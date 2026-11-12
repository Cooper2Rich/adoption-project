import { readFileSync } from "node:fs";

export function readSampleMedia(path: any) {
  return readFileSync(new URL(`../public${path}`, import.meta.url));
}
