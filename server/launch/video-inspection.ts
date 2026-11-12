import { createHash } from "node:crypto";

interface Sample {
  codec: string;
  avc?: boolean;
  aac?: boolean;
}
interface Track {
  codecs: Sample[];
  handler?: string;
  sampleCount?: number;
  duration?: boolean;
  presentation?: bigint;
}
interface Box {
  type: string;
  end: number;
  track?: Track;
  sample?: Sample;
}
interface Atom extends Box {
  prefix: Buffer;
}

export const VIDEO_MAX_BYTES = 5_000_000_000;
function fail(message: string): never {
  throw new Error(
    `VIDEO_FORMAT: ${message}. Export MP4/H.264 with AAC or no audio, at most 60 seconds`,
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

// Incremental ISO-BMFF inspection. Large mdat/free boxes are hashed and skipped,
// never buffered. Only the small prefixes needed to identify tracks are kept.
// Mux must subsequently decode/process the same immutable source before ready.
export async function inspectVideo(
  stream: AsyncIterable<Uint8Array> | null,
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
  let position = 0,
    pending: Buffer = Buffer.alloc(0),
    atom: Atom | null = null,
    sawFtyp = false,
    sawMoov = false,
    sawMdat = false;
  const stack: Box[] = [{ type: "root", end: declaredSize }],
    tracks: Track[] = [],
    durations: number[] = [];
  let movieScale = 0;
  const hash = createHash("sha256");
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  function track() {
    return stack.findLast((s: any) => s.track)?.track;
  }
  function finish(a: Atom) {
    const p = a.prefix;
    if (a.type === "ftyp") {
      if (p.length < 8 || p.length % 4 !== 0) fail("Invalid MP4 file type");
      const brands = [p.toString("ascii", 0, 4)];
      for (let i = 8; i + 4 <= p.length; i += 4)
        brands.push(p.toString("ascii", i, i + 4));
      if (
        !brands.some((b: any) =>
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
          ].includes(b),
        )
      )
        fail("Unsupported MP4 file type");
      sawFtyp = true;
    }
    if (a.type === "mvhd" || a.type === "mdhd") {
      if (p.length < 20 || ![0, 1].includes(p[0]))
        fail("Invalid duration header");
      const version = p[0],
        offset = version ? 20 : 12;
      if (p.length < offset + (version ? 12 : 8))
        fail("Truncated duration header");
      const scale = p.readUInt32BE(offset);
      const duration = version
        ? p.readBigUInt64BE(offset + 4)
        : BigInt(p.readUInt32BE(offset + 4));
      if (!scale || duration <= 0n) fail("Invalid media duration");
      if (a.type === "mvhd") {
        if (duration > BigInt(scale) * 60n)
          throw new Error(
            "VIDEO_DURATION: Video must be at most 60 seconds, inclusive",
          );
        movieScale = scale;
        durations.push(Number(duration) / scale);
      }
      if (a.type === "mdhd" && a.track) a.track.duration = true;
    }
    if (a.type === "tkhd" && a.track) {
      const offset = p[0] === 1 ? 28 : 20;
      if (p.length < offset + (p[0] === 1 ? 8 : 4) || ![0, 1].includes(p[0]))
        fail("Invalid track presentation duration");
      a.track.presentation =
        p[0] === 1 ? p.readBigUInt64BE(offset) : BigInt(p.readUInt32BE(offset));
    }
    if (a.type === "hdlr" && a.track) {
      if (p.length < 12) fail("Invalid media handler");
      a.track.handler = p.toString("ascii", 8, 12);
    }
    if (a.type === "stsd" && a.track) {
      // Exactly one supported sample description per track. Multiple descriptions
      // are inspected by the streaming child entry parser below.
      if (p.length < 8 || p.readUInt32BE(4) < 1)
        fail("Missing sample description");
      if (a.track.sampleCount !== undefined)
        fail("Duplicate sample descriptions");
      a.track.sampleCount = p.readUInt32BE(4);
    }
    if (a.type === "avcC" && a.sample) {
      if (p.length < 7 || p[0] !== 1 || !(p[5] & 31))
        fail("Missing H.264 decoder configuration");
      a.sample.avc = true;
    }
    if (a.type === "esds" && a.sample) {
      aacConfiguration(p);
      a.sample.aac = true;
    }
  }
  for await (const input of stream) {
    const chunk = Buffer.from(input);
    hash.update(chunk);
    if (position + pending.length + chunk.length > declaredSize)
      throw new Error("VIDEO_SIZE: Stored bytes exceed the selected size");
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length) {
      while (stack.length > 1 && position === stack.at(-1)!.end) stack.pop();
      if (atom) {
        const n = Math.min(pending.length, atom.end - position);
        const keep = Math.min(n, Math.max(0, 4096 - atom.prefix.length));
        if (keep)
          atom.prefix = Buffer.concat([atom.prefix, pending.subarray(0, keep)]);
        position += n;
        pending = pending.subarray(n);
        if (position === atom.end) {
          finish(atom);
          atom = null;
        }
        continue;
      }
      if (pending.length < 8) break;
      let length = pending.readUInt32BE(0),
        header = 8;
      const type = pending.toString("ascii", 4, 8),
        parent = stack.at(-1)!;
      if (length === 1) {
        if (pending.length < 16) break;
        const n = pending.readBigUInt64BE(8);
        if (n > BigInt(Number.MAX_SAFE_INTEGER))
          fail("Atom size exceeds source");
        length = Number(n);
        header = 16;
      }
      if (length === 0) length = parent.end - position;
      if (length < header || position + length > parent.end)
        fail("Truncated or invalid MP4 atom");
      const end = position + length,
        currentTrack = track();
      position += header;
      pending = pending.subarray(header);
      if (containers.has(type)) {
        if (type === "moov") {
          if (sawMoov) fail("Duplicate movie metadata");
          sawMoov = true;
        }
        const t = type === "trak" ? { codecs: [] as any[] } : undefined;
        if (t) tracks.push(t);
        stack.push({ type, end, ...(t ? { track: t } : {}) });
        continue;
      }
      // stsd has a full-box header then variable sample entries; their child
      // configuration boxes begin after the ISO video/audio sample-entry prefix.
      if (type === "stsd" || ["avc1", "avc3", "mp4a"].includes(type)) {
        if (type === "stsd" && parent.type !== "stbl")
          fail("Invalid sample description location");
        if (type !== "stsd" && parent.type !== "stsd")
          fail("Invalid codec sample location");
        const skip = type === "stsd" ? 8 : type === "mp4a" ? 28 : 78;
        if (end - position < skip) fail("Truncated sample entry");
        atom = {
          type,
          end: position + skip,
          prefix: Buffer.alloc(0),
          track: currentTrack,
        };
        const sample = type !== "stsd" ? { codec: type } : undefined;
        if (sample && currentTrack) currentTrack.codecs.push(sample);
        stack.push({ type, end, ...(sample ? { sample } : {}) });
        continue;
      }
      if (parent.type === "stsd") fail("Unsupported video or audio codec");
      if (type === "mdat") sawMdat = true;
      atom = {
        type,
        end,
        prefix: Buffer.alloc(0),
        track: currentTrack,
        sample: stack.findLast((s: any): { sample: any } => s.sample)?.sample,
      };
      if (position === end) {
        finish(atom);
        atom = null;
      }
    }
  }
  while (stack.length > 1 && position === stack.at(-1)!.end) stack.pop();
  if (position !== declaredSize || pending.length || atom || stack.length !== 1)
    fail("Incomplete MP4 upload");
  if (!sawFtyp || !sawMoov || !sawMdat || !durations.length)
    fail("Missing MP4 video data");
  const video = tracks.filter((t: any) => t.handler === "vide"),
    audio = tracks.filter((t: any) => t.handler === "soun");
  if (video.length !== 1 || tracks.length !== video.length + audio.length)
    fail("Use one video track and optional AAC audio tracks");
  for (const t of tracks) {
    if (t.sampleCount !== t.codecs.length)
      fail("Sample description count differs from codec entries");
    if (
      !movieScale ||
      !t.presentation ||
      t.presentation > BigInt(movieScale) * 60n
    )
      throw new Error(
        "VIDEO_DURATION: Every presented track must be at most 60 seconds, inclusive",
      );
  }
  for (const t of video)
    if (
      !t.duration ||
      !t.codecs.length ||
      t.codecs.some((c: any) => !["avc1", "avc3"].includes(c.codec) || !c.avc)
    )
      fail("Video track is not H.264");
  for (const t of audio)
    if (
      !t.duration ||
      !t.codecs.length ||
      t.codecs.some((c: any) => c.codec !== "mp4a" || !c.aac)
    )
      fail("Audio track is not AAC");
  return {
    size: position,
    sha256: hash.digest("hex"),
    duration: Math.max(...durations),
    videoCodec: "h264",
    audioCodec: audio.length ? "aac" : "none",
  };
}
