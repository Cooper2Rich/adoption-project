import ffmpeg from "ffmpeg-static";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile);
export async function videoBytes({
  duration = 1,
  video = "libx264",
  audio = "none",
  faststart = false,
  color = "orange",
  fragmented = false,
  bframes = false,
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "slander-video-fixture-")),
    output = join(directory, "fixture.mp4");
  try {
    await execute(
      ffmpeg!,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=32x32:r=25:d=${duration}`,
        ...(audio !== "none"
          ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`]
          : []),
        "-c:v",
        video,
        ...(video === "libx264"
          ? ["-preset", "ultrafast", "-pix_fmt", "yuv420p"]
          : []),
        ...(audio !== "none" ? ["-c:a", audio] : ["-an"]),
        ...(bframes ? ["-bf", "2"] : []),
        ...(fragmented
          ? ["-movflags", "+frag_keyframe+empty_moov+default_base_moof"]
          : faststart
            ? ["-movflags", "+faststart"]
            : []),
        "-t",
        String(duration),
        output,
      ],
      { windowsHide: true },
    );
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function* paddedVideo(
  bytes: Buffer,
  size: number,
  { extended = true, zero = false } = {},
) {
  yield bytes;
  const remaining = size - bytes.length,
    header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(zero ? 0 : extended ? 1 : remaining, 0);
  header.write("free", 4);
  if (extended) header.writeBigUInt64BE(BigInt(remaining), 8);
  yield header;
  let padding = remaining - header.length;
  const block = Buffer.alloc(1024 * 1024);
  while (padding) {
    const length = Math.min(padding, block.length);
    yield block.subarray(0, length);
    padding -= length;
  }
}
