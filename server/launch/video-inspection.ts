import { createHash } from "node:crypto";

export const VIDEO_MAX_BYTES = 5_000_000_000;
function fail(message: string): never {
  throw new Error(
    `VIDEO_FORMAT: ${message}. Export MP4/H.264 with AAC or no audio, at most 60 seconds`,
  );
}
function durationError(): never {
  throw new Error(
    "VIDEO_DURATION: Video must be at most 60 seconds, inclusive",
  );
}
function aacConfiguration(bytes: Buffer) {
  function descriptor(start: number, end: number) {
    if (start + 2 > end) fail("Truncated audio descriptor");
    const tag = bytes[start++];
    let size = 0,
      done = false;
    for (let i = 0; i < 4 && start < end; i++) {
      const b = bytes[start++];
      size = size * 128 + (b & 127);
      if (!(b & 128)) {
        done = true;
        break;
      }
    }
    if (!done || start + size > end) fail("Invalid audio descriptor size");
    return { tag, start, end: start + size };
  }
  const es = descriptor(4, bytes.length);
  if (es.tag !== 3 || es.start + 3 > es.end)
    fail("Missing ES audio descriptor");
  let offset = es.start + 3;
  const flags = bytes[es.start + 2];
  if (flags & 128) offset += 2;
  if (flags & 64) {
    if (offset >= es.end) fail("Invalid ES URL");
    offset += 1 + bytes[offset];
  }
  if (flags & 32) offset += 2;
  const decoder = descriptor(offset, es.end);
  if (
    decoder.tag !== 4 ||
    decoder.end - decoder.start < 13 ||
    bytes[decoder.start] !== 0x40 ||
    bytes[decoder.start + 1] >> 2 !== 5
  )
    fail("Audio track is not MPEG-4 AAC");
  const config = descriptor(decoder.start + 13, decoder.end);
  if (config.tag !== 5 || config.end - config.start < 2)
    fail("Missing AAC decoder configuration");
  let objectType = bytes[config.start] >> 3;
  if (objectType === 31)
    objectType =
      32 + ((bytes[config.start] & 7) << 3) + (bytes[config.start + 1] >> 5);
  // ISO/IEC 14496-3 Audio Object Types: AAC and AAC SBR/PS extensions only.
  if (![1, 2, 3, 4, 5, 6, 17, 19, 20, 23, 29, 39].includes(objectType))
    fail("Audio track is not AAC");
}

interface Track {
  id: number;
  handler: string;
  codecs: string[];
  scale: number;
  headerDuration: bigint;
  presentation: bigint;
  samples: number;
  sizedSamples: number;
  bytes: bigint;
  ticks: bigint;
  composition: bigint;
  fragmentEnd: bigint;
  edits: { duration: bigint; media: bigint }[];
  offsets: bigint[];
}
interface Defaults {
  duration: number;
  size: number;
  description: number;
}
interface Fragment {
  track?: Track;
  defaults?: Defaults;
  decode: bigint;
  base: bigint;
}

// Read every original byte once, retaining only the current transport chunk and
// a bounded field/decoder configuration. Sample tables and fragments are reduced
// incrementally; neither a large mdat nor a large moov is collected in memory.
export async function inspectVideo(
  stream: AsyncIterable<Uint8Array> | Iterable<Uint8Array> | null,
  declaredSize: unknown,
) {
  if (
    typeof declaredSize !== "number" ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 1 ||
    declaredSize > VIDEO_MAX_BYTES
  )
    throw new Error(
      "VIDEO_SIZE: Choose 1 to 5,000,000,000 bytes (decimal 5 GB)",
    );
  if (!stream) throw new Error("VIDEO_INCOMPLETE: Upload has no bytes");
  const sourceSize = declaredSize;
  async function* source() {
    yield* stream!;
  }
  const iterator = source()[Symbol.asyncIterator](),
    hash = createHash("sha256");
  let chunk: Buffer = Buffer.alloc(0),
    position = 0,
    received = 0;
  async function fill() {
    while (!chunk.length) {
      const next = await iterator.next();
      if (next.done) fail("Incomplete MP4 upload");
      chunk = Buffer.from(
        next.value.buffer,
        next.value.byteOffset,
        next.value.byteLength,
      );
      received += chunk.length;
      if (received > sourceSize)
        throw new Error("VIDEO_SIZE: Stored bytes exceed the selected size");
      hash.update(chunk);
    }
  }
  async function take(n: number, end: number): Promise<Buffer> {
    if (n < 0 || position + n > end) fail("Truncated MP4 field");
    const result = Buffer.alloc(n);
    let copied = 0;
    while (copied < n) {
      await fill();
      const size = Math.min(n - copied, chunk.length);
      chunk.copy(result, copied, 0, size);
      chunk = chunk.subarray(size);
      copied += size;
      position += size;
    }
    return result;
  }
  async function skip(n: number, end: number) {
    if (n < 0 || position + n > end) fail("Truncated MP4 atom");
    while (n) {
      await fill();
      const size = Math.min(n, chunk.length);
      chunk = chunk.subarray(size);
      position += size;
      n -= size;
    }
  }
  const tracks: Track[] = [],
    defaults = new Map<number, Defaults>(),
    media: { start: bigint; end: bigint }[] = [];
  let movieScale = 0,
    movieDuration = 0n,
    sawFtyp = false,
    sawMoov = false;
  async function boxes(
    end: number,
    parent: string,
    track?: Track,
    fragment?: Fragment,
    moof = 0,
  ) {
    while (position < end) {
      const start = position,
        h = await take(8, end),
        type = h.toString("ascii", 4);
      let size = BigInt(h.readUInt32BE(0)),
        header = 8;
      if (size === 1n) {
        size = (await take(8, end)).readBigUInt64BE();
        header = 16;
      }
      if (size === 0n) size = BigInt(end - start);
      if (size < BigInt(header) || size > BigInt(end - start))
        fail("Truncated or invalid MP4 atom");
      const stop = start + Number(size);
      const field = (n: number) => take(n, stop);
      const rest = () => skip(stop - position, stop);
      if (type === "ftyp") {
        if (
          parent !== "root" ||
          sawFtyp ||
          stop - position < 8 ||
          (stop - position) % 4
        )
          fail("Invalid MP4 file type");
        const accepted = (b: string) =>
          [
            "isom",
            "iso2",
            "iso3",
            "iso4",
            "iso5",
            "iso6",
            "mp41",
            "mp42",
            "avc1",
            "dash",
            "M4V ",
          ].includes(b);
        const first = await field(8);
        let compatible = accepted(first.toString("ascii", 0, 4));
        while (position < stop)
          compatible =
            accepted((await field(4)).toString("ascii")) || compatible;
        if (!compatible) fail("Unsupported MP4 file type");
        sawFtyp = true;
      } else if (type === "moov") {
        if (parent !== "root" || sawMoov)
          fail("Duplicate or misplaced movie metadata");
        sawMoov = true;
        await boxes(stop, type);
      } else if (type === "trak") {
        if (parent !== "moov") fail("Misplaced track");
        const t: Track = {
          id: 0,
          handler: "",
          codecs: [],
          scale: 0,
          headerDuration: 0n,
          presentation: 0n,
          samples: 0,
          sizedSamples: 0,
          bytes: 0n,
          ticks: 0n,
          composition: 0n,
          fragmentEnd: 0n,
          edits: [],
          offsets: [],
        };
        tracks.push(t);
        await boxes(stop, type, t);
      } else if (["mdia", "minf", "stbl", "edts", "mvex"].includes(type)) {
        const expected: Record<string, string> = {
          mdia: "trak",
          minf: "mdia",
          stbl: "minf",
          edts: "trak",
          mvex: "moov",
        };
        if (parent !== expected[type]) fail("Misplaced media metadata");
        await boxes(stop, type, track);
      } else if (type === "moof") {
        if (parent !== "root" || !sawMoov)
          fail("Missing initialization metadata for fragments");
        await boxes(stop, type, undefined, undefined, start);
      } else if (type === "traf") {
        if (parent !== "moof") fail("Misplaced fragment");
        await boxes(
          stop,
          type,
          undefined,
          { decode: 0n, base: BigInt(moof) },
          moof,
        );
      } else if (type === "mvhd" || type === "mdhd") {
        if (parent !== (type === "mvhd" ? "moov" : "mdia"))
          fail("Misplaced duration header");
        const version = (await field(4))[0];
        if (version > 1) fail("Invalid duration header");
        await field(version ? 16 : 8);
        const p = await field(version ? 12 : 8),
          scale = p.readUInt32BE(0),
          duration = version ? p.readBigUInt64BE(4) : BigInt(p.readUInt32BE(4));
        if (!scale) fail("Invalid media timescale");
        if (type === "mvhd") {
          if (movieScale) fail("Duplicate movie duration");
          movieScale = scale;
          movieDuration = duration;
        } else {
          if (!track || track.scale) fail("Duplicate media duration");
          track.scale = scale;
          track.headerDuration = duration;
        }
      } else if (type === "tkhd") {
        if (parent !== "trak" || !track || track.id)
          fail("Duplicate or misplaced track header");
        const version = (await field(4))[0];
        if (version > 1) fail("Invalid track header");
        await field(version ? 16 : 8);
        track.id = (await field(8)).readUInt32BE(0);
        track.presentation = version
          ? (await field(8)).readBigUInt64BE()
          : BigInt((await field(4)).readUInt32BE());
      } else if (type === "hdlr") {
        if (parent !== "mdia" || !track || track.handler)
          fail("Duplicate or misplaced media handler");
        track.handler = (await field(12)).toString("ascii", 8, 12);
      } else if (type === "stsd") {
        if (parent !== "stbl" || !track || track.codecs.length)
          fail("Duplicate or misplaced sample descriptions");
        const count = (await field(8)).readUInt32BE(4);
        if (!count) fail("Missing sample description");
        for (let i = 0; i < count; i++) {
          if (stop - position < 8)
            fail("Sample description count differs from codec entries");
          const entryStart = position,
            p = await field(8),
            codec = p.toString("ascii", 4),
            entryEnd = entryStart + p.readUInt32BE();
          if (
            entryEnd > stop ||
            entryEnd < position ||
            !["avc1", "avc3", "mp4a"].includes(codec)
          )
            fail("Unsupported video or audio codec");
          track.codecs.push(codec);
          await skip(codec === "mp4a" ? 28 : 78, entryEnd);
          let configured = false;
          while (position < entryEnd) {
            const configStart = position,
              c = await take(8, entryEnd),
              name = c.toString("ascii", 4),
              configEnd = configStart + c.readUInt32BE();
            if (configEnd < position || configEnd > entryEnd)
              fail("Invalid decoder configuration");
            if (name === "avcC" && codec !== "mp4a") {
              if (configured) fail("Duplicate H.264 decoder configuration");
              const avc = await take(6, configEnd);
              if (avc[0] !== 1 || (avc[4] & 3) === 2 || !(avc[5] & 31))
                fail("Missing H.264 decoder configuration");
              async function nal(type: number) {
                const length = (await take(2, configEnd)).readUInt16BE();
                if (!length) fail("Empty H.264 parameter set");
                const first = (await take(1, configEnd))[0];
                if (first & 128 || (first & 31) !== type)
                  fail("Invalid H.264 parameter set");
                await skip(length - 1, configEnd);
              }
              for (let s = 0; s < (avc[5] & 31); s++) await nal(7);
              const pps = (await take(1, configEnd))[0];
              if (!pps) fail("Missing H.264 picture parameter set");
              for (let p = 0; p < pps; p++) await nal(8);
              configured = true;
            } else if (name === "esds" && codec === "mp4a") {
              if (configured || configEnd - position > 4096)
                fail("Invalid AAC decoder configuration");
              aacConfiguration(await take(configEnd - position, configEnd));
              configured = true;
            }
            await skip(configEnd - position, configEnd);
          }
          if (!configured) fail("Missing codec decoder configuration");
        }
        if (position !== stop)
          fail("Sample description count differs from codec entries");
      } else if (
        [
          "stts",
          "ctts",
          "stsz",
          "stz2",
          "stco",
          "co64",
          "stsc",
          "elst",
        ].includes(type)
      ) {
        if (!track || parent !== (type === "elst" ? "edts" : "stbl"))
          fail("Misplaced sample table");
        const full = await field(4),
          version = full[0];
        if (version > (type === "elst" || type === "ctts" ? 1 : 0))
          fail("Invalid sample table version");
        if (type === "stsz" || type === "stz2") {
          const h = await field(8),
            count = h.readUInt32BE(4);
          if (track.sizedSamples) fail("Duplicate sample sizes");
          track.sizedSamples = count;
          if (type === "stsz") {
            const fixed = h.readUInt32BE();
            if (fixed) track.bytes += BigInt(fixed) * BigInt(count);
            else
              for (let i = 0; i < count; i++)
                track.bytes += BigInt((await field(4)).readUInt32BE());
          } else {
            const bits = h[3];
            if (![4, 8, 16].includes(bits)) fail("Invalid compact sample size");
            for (let i = 0; i < count; i += bits === 4 ? 2 : 1) {
              const v = await field(bits === 16 ? 2 : 1);
              track.bytes += BigInt(
                bits === 16
                  ? v.readUInt16BE()
                  : bits === 8
                    ? v[0]
                    : (v[0] >> 4) + (i + 1 < count ? v[0] & 15 : 0),
              );
            }
          }
        } else {
          const count = (await field(4)).readUInt32BE();
          for (let i = 0; i < count; i++) {
            if (type === "stts" || type === "ctts") {
              const p = await field(8),
                n = p.readUInt32BE(),
                value =
                  type === "ctts" && version
                    ? p.readInt32BE(4)
                    : p.readUInt32BE(4);
              if (!n || (type === "stts" && !value))
                fail("Invalid sample timing");
              if (type === "stts") {
                track.samples += n;
                track.ticks += BigInt(n) * BigInt(value);
              } else if (BigInt(value) > track.composition)
                track.composition = BigInt(value);
            } else if (type === "elst") {
              const p = await field(version ? 20 : 12),
                duration = version
                  ? p.readBigUInt64BE()
                  : BigInt(p.readUInt32BE()),
                media = version
                  ? p.readBigInt64BE(8)
                  : BigInt(p.readInt32BE(4));
              if (media < -1n || p.readInt32BE(version ? 16 : 8) !== 65536)
                fail("Invalid presentation edit");
              track.edits.push({ duration, media });
            } else if (type === "stsc") {
              const p = await field(12);
              if (
                !p.readUInt32BE() ||
                !p.readUInt32BE(4) ||
                !p.readUInt32BE(8) ||
                p.readUInt32BE(8) > track.codecs.length
              )
                fail("Invalid sample chunk description");
            } else {
              const p = await field(type === "co64" ? 8 : 4),
                offset =
                  type === "co64"
                    ? p.readBigUInt64BE()
                    : BigInt(p.readUInt32BE());
              // Store merged offset ranges rather than one allocation per sample.
              if (track.offsets.length < 2) track.offsets.push(offset);
              else {
                track.offsets[0] =
                  track.offsets[0] < offset ? track.offsets[0] : offset;
                track.offsets[1] =
                  track.offsets[1] > offset ? track.offsets[1] : offset;
              }
            }
          }
        }
        if (position !== stop)
          fail("Sample table length differs from its entry count");
      } else if (type === "trex") {
        if (parent !== "mvex") fail("Misplaced fragment defaults");
        const p = await field(24),
          id = p.readUInt32BE(4);
        if (defaults.has(id)) fail("Duplicate fragment defaults");
        defaults.set(id, {
          description: p.readUInt32BE(8),
          duration: p.readUInt32BE(12),
          size: p.readUInt32BE(16),
        });
      } else if (type === "tfhd") {
        if (parent !== "traf" || !fragment || fragment.track)
          fail("Duplicate or misplaced fragment header");
        const p = await field(8),
          flags = p.readUInt32BE() & 0xffffff,
          id = p.readUInt32BE(4),
          t = tracks.find((t) => t.id === id);
        if (!t || !defaults.has(id)) fail("Unknown fragment track");
        fragment.track = t;
        fragment.decode = t.fragmentEnd;
        fragment.defaults = { ...defaults.get(id)! };
        if (flags & 1) fragment.base = (await field(8)).readBigUInt64BE();
        if (flags & 2)
          fragment.defaults.description = (await field(4)).readUInt32BE();
        if (flags & 8)
          fragment.defaults.duration = (await field(4)).readUInt32BE();
        if (flags & 16)
          fragment.defaults.size = (await field(4)).readUInt32BE();
        if (flags & 32) await field(4);
        if (
          !fragment.defaults.description ||
          fragment.defaults.description > t.codecs.length
        )
          fail("Invalid fragment codec description");
      } else if (type === "tfdt") {
        if (parent !== "traf" || !fragment?.track)
          fail("Missing fragment header");
        const version = (await field(4))[0];
        if (version > 1) fail("Invalid fragment timeline");
        fragment.decode = version
          ? (await field(8)).readBigUInt64BE()
          : BigInt((await field(4)).readUInt32BE());
      } else if (type === "trun") {
        if (parent !== "traf" || !fragment?.track || !fragment.defaults)
          fail("Missing fragment header");
        const p = await field(8),
          version = p[0],
          flags = p.readUInt32BE() & 0xffffff,
          count = p.readUInt32BE(4),
          t = fragment.track;
        if (version > 1 || flags & ~0xf05)
          fail("Invalid fragment sample flags");
        if (flags & 1) {
          const offset = fragment.base + BigInt((await field(4)).readInt32BE());
          t.offsets.push(offset);
          if (t.offsets.length > 2)
            t.offsets = [
              t.offsets.reduce((a, b) => (a < b ? a : b)),
              t.offsets.reduce((a, b) => (a > b ? a : b)),
            ];
        }
        if (flags & 4) await field(4);
        for (let i = 0; i < count; i++) {
          const duration =
            flags & 0x100
              ? (await field(4)).readUInt32BE()
              : fragment.defaults.duration;
          const size =
            flags & 0x200
              ? (await field(4)).readUInt32BE()
              : fragment.defaults.size;
          if (!duration || !size)
            fail("Missing fragment sample timing or bytes");
          if (flags & 0x400) await field(4);
          const c = flags & 0x800 ? await field(4) : Buffer.alloc(4),
            composition = BigInt(version ? c.readInt32BE() : c.readUInt32BE());
          if (composition > t.composition) t.composition = composition;
          fragment.decode += BigInt(duration);
          t.samples++;
          t.sizedSamples++;
          t.bytes += BigInt(size);
        }
        if (fragment.decode > t.fragmentEnd) t.fragmentEnd = fragment.decode;
        if (position !== stop)
          fail("Fragment table length differs from sample count");
      } else if (type === "mdat") {
        if (parent !== "root") fail("Misplaced media bytes");
        media.push({ start: BigInt(position), end: BigInt(stop) });
      }
      await rest();
    }
  }
  try {
    await boxes(declaredSize, "root");
    if (chunk.length || received !== declaredSize)
      fail("Incomplete MP4 upload");
    let extra = await iterator.next();
    while (!extra.done) {
      if (extra.value.length)
        throw new Error("VIDEO_SIZE: Stored bytes exceed the selected size");
      extra = await iterator.next();
    }
    if (!sawFtyp || !sawMoov || !movieScale || !media.length)
      fail("Missing MP4 video data");
    if (movieDuration > BigInt(movieScale) * 60n) durationError();
    const video = tracks.filter((t) => t.handler === "vide"),
      audio = tracks.filter((t) => t.handler === "soun");
    if (
      video.length !== 1 ||
      tracks.length !== video.length + audio.length ||
      new Set(tracks.map((t) => t.id)).size !== tracks.length
    )
      fail("Use one video track and optional AAC audio tracks");
    let duration = 0,
      totalBytes = 0n;
    for (const t of tracks) {
      if (
        !t.id ||
        !t.scale ||
        !t.codecs.length ||
        !t.samples ||
        t.samples !== t.sizedSamples ||
        !t.bytes
      )
        fail("Missing or inconsistent media samples");
      if (
        t.codecs.some((c) =>
          t.handler === "vide" ? !["avc1", "avc3"].includes(c) : c !== "mp4a",
        )
      )
        fail("Track codec does not match media handler");
      const timeline = t.fragmentEnd > t.ticks ? t.fragmentEnd : t.ticks;
      if (t.headerDuration && t.headerDuration !== timeline)
        fail("Media duration differs from sample timing");
      const edited = t.edits.reduce((s, e) => s + e.duration, 0n);
      const presented = edited || t.presentation;
      if (presented > BigInt(movieScale) * 60n) durationError();
      if (edited && t.presentation && edited !== t.presentation)
        fail("Track duration differs from presentation edits");
      if (t.edits.length) {
        for (const e of t.edits)
          if (
            e.media >= 0n &&
            e.media * BigInt(movieScale) + e.duration * BigInt(t.scale) >
              (timeline + t.composition) * BigInt(movieScale)
          )
            fail("Presentation edit exceeds media samples");
      } else {
        if (timeline > BigInt(t.scale) * 60n) durationError();
        // A short forged movie/tkhd header cannot hide an untrimmed long track.
        if (
          presented &&
          timeline * BigInt(movieScale) > (presented + 1n) * BigInt(t.scale)
        )
          fail("Presentation duration differs from media samples");
      }
      for (const offset of t.offsets)
        if (!media.some((m) => offset >= m.start && offset < m.end))
          fail("Sample offset is outside media bytes");
      totalBytes += t.bytes;
      duration = Math.max(
        duration,
        presented ? Number(presented) / movieScale : Number(timeline) / t.scale,
      );
    }
    if (totalBytes > media.reduce((sum, m) => sum + m.end - m.start, 0n))
      fail("Sample sizes exceed stored media bytes");
    if (!duration || duration > 60) durationError();
    return {
      size: position,
      sha256: hash.digest("hex"),
      duration,
      videoCodec: "h264",
      audioCodec: audio.length ? "aac" : "none",
    };
  } finally {
    await iterator.return?.();
  }
}
