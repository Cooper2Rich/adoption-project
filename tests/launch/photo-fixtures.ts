import sharp from "sharp";
import { crc32 } from "node:zlib";

export async function pngBytes(size?: number) {
  const base = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#e89445" },
  })
    .png()
    .toBuffer();
  if (!size) return base;
  const chunks: Buffer[] = [base.subarray(0, base.length - 12)];
  let remaining = size - base.length;
  while (remaining) {
    const total = Math.min(1_000_012, remaining);
    if (total < 12)
      throw new Error("Fixture padding must contain a full ancillary chunk");
    const chunk = Buffer.alloc(total);
    chunk.writeUInt32BE(total - 12, 0);
    chunk.write("npAD", 4, "ascii");
    chunk.writeUInt32BE(crc32(chunk.subarray(4, total - 4)), total - 4);
    chunks.push(chunk);
    remaining -= total;
  }
  chunks.push(base.subarray(base.length - 12));
  return Buffer.concat(chunks);
}
export async function jpegBytes() {
  return sharp({
    create: { width: 3, height: 2, channels: 3, background: "#2a735d" },
  })
    .jpeg()
    .toBuffer();
}
