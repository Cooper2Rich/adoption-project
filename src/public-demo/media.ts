import { demoAsset } from "../runtime.ts";
import { adoptionAds } from "./adoption-ads.ts";
import { createHash } from "./platform-crypto.ts";

const samples = new Map<string, Uint8Array>();
let preparing: Promise<void> | undefined;
export function prepareSamples() {
  return (preparing ||= Promise.all(
    ["forest", "food", "education", "seedling"].map(async (name) => {
      const response = await fetch(demoAsset(`images/${name}.jpg`));
      if (!response.ok)
        throw new Error("Sample media could not load. Please try again.");
      samples.set(`${name}.jpg`, new Uint8Array(await response.arrayBuffer()));
    }),
  )
    .then(() => {})
    .catch((error) => {
      preparing = undefined;
      throw error;
    }));
}

// Limited to the four bundled sample files. This never reads a local filesystem.
export function readFileSync(path: URL | string) {
  const bytes = samples.get(String(path).split("/").pop() || "");
  if (!bytes) throw new Error("This sample is unavailable in the public demo.");
  return bytes;
}
export const readSampleMedia = readFileSync;
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("slander-public-media-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Browser media storage is unavailable."));
  });
}
export async function mediaFile(path: string): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(path);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
function signature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (type === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  return (
    ["video/mp4", "video/quicktime"].includes(type) &&
    new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp"
  );
}
export async function uploadMedia(body: unknown) {
  const file = body instanceof FormData ? body.get("media") : null;
  if (!(file instanceof File) || !file.size)
    throw new Error("Choose a photo or video.");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("Choose a file smaller than 30 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signature(bytes, file.type))
    throw new Error("Use a valid JPG, PNG, WebP, MP4 or MOV file.");
  const path = `/api/media/public-${crypto.randomUUID()}`;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(file, path);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("Unable to save this media in browser storage."));
      transaction.onabort = () =>
        reject(new Error("Browser media storage is full or unavailable."));
    });
  } finally {
    db.close();
  }
  return {
    media: path,
    mediaType: file.type.startsWith("video/") ? "video" : "image",
  };
}
export async function mediaEvidence(path: string) {
  const imported = adoptionAds.find((ad) => ad.media === path);
  if (imported)
    return {
      verified: true,
      bytes: imported.bytes,
      digest: imported.digest,
      source: "bundled-user-import-sha256",
    };
  let bytes: Uint8Array;
  if (
    /^\/videos\/nocturne-(midnight|espresso|afterhours)(-filmed-v2)?\.webm$/.test(
      path,
    )
  ) {
    const response = await fetch(demoAsset(path));
    if (!response.ok)
      throw new Error(
        "Coffee showcase video could not load. Please try again.",
      );
    bytes = new Uint8Array(await response.arrayBuffer());
  } else if (/^\/images\/(forest|food|education|seedling)\.jpg$/.test(path))
    bytes = readFileSync(path);
  else {
    const file = await mediaFile(path);
    if (!file)
      throw new Error(
        "Re-upload this creative; its browser media file is unavailable.",
      );
    bytes = new Uint8Array(await file.arrayBuffer());
  }
  return {
    verified: true,
    bytes: bytes.length,
    digest: createHash("sha256").update(bytes).digest("hex"),
    source: "browser-local-media",
  };
}
