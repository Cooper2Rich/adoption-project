import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Derive the mark and wordmark from the supplied black-background brand logo.
export async function prepareBrand(
  sourcePath: string,
  destination = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../public/brand",
  ),
) {
  await mkdir(destination, { recursive: true });
  const original = resolve(destination, "blue-ripple-logo.png");
  if (resolve(sourcePath) !== original) await copyFile(sourcePath, original);
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows: number[] = [];
  for (let y = 0; y < info.height; y++) {
    if (
      data
        .subarray(
          y * info.width * info.channels,
          (y + 1) * info.width * info.channels,
        )
        .some((value) => value !== 0)
    )
      rows.push(y);
  }
  let gap = 0,
    split = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] - rows[i - 1] > gap) {
      gap = rows[i] - rows[i - 1];
      split = Math.floor((rows[i] + rows[i - 1]) / 2);
    }
  }
  if (!split)
    throw new Error("Logo must contain separate mark and wordmark artwork");
  async function artwork(top: number, height: number) {
    const region = await sharp(sourcePath)
      .removeAlpha()
      .extract({ left: 0, top, width: info.width, height })
      .png()
      .toBuffer();
    return sharp(region)
      .trim({ background: "black", threshold: 0 })
      .png()
      .toBuffer();
  }
  const mark = await artwork(0, split);
  for (const [size, filename] of [
    [512, "blue-ripple-mark.png"],
    [64, "blue-ripple-favicon.png"],
  ] as const) {
    const fitted = await sharp(mark)
      .resize(Math.round(size * 0.94), Math.round(size * 0.94), {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 3, background: "black" },
    })
      .composite([{ input: fitted, gravity: "centre" }])
      .png()
      .toFile(resolve(destination, filename));
  }
  await sharp(await artwork(split, info.height - split))
    .resize({ width: 960 })
    .png()
    .toFile(resolve(destination, "blue-ripple-wordmark.png"));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const sourcePath = process.argv[2];
  if (!sourcePath)
    throw new Error("Usage: node scripts/prepare-brand.ts <logo>");
  await prepareBrand(sourcePath);
}
