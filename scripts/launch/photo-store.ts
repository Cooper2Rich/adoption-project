import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

// This persistent, run-owned adapter stands in for private Blob, without
// pretending that local byte evidence proves actual provider capability.
export async function localPhotoStore(directory: any) {
  const root = join(directory, "private-photo-fixture");
  await mkdir(root, { recursive: true });
  function path(name: any) {
    if (!/^photos\/[a-z0-9]+\.(png|jpg)$/.test(name))
      throw new Error("PHOTO_PATH: Invalid photo identity");
    return join(root, name.slice(7));
  }
  return {
    async read(name: any) {
      return Readable.toWeb(createReadStream(path(name)));
    },
    async write(name: any, stream: any) {
      const destination = path(name);
      const temporary = destination + "." + randomUUID();
      const file = await open(temporary, "wx");
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > 100_000_000)
            throw new Error(
              "PHOTO_SIZE: Each photo must be at most 100,000,000 bytes",
            );
          await file.write(chunk);
        }
        await file.close();
        await link(temporary, destination); // Atomic publication without overwrite.
      } finally {
        await file.close();
        await unlink(temporary);
      }
    },
    async token() {
      throw new Error(
        "PHOTO_FIXTURE: Owned verification uses the local byte route",
      );
    },
  };
}
