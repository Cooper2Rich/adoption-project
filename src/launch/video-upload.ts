import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  completeMultipartUpload,
  createMultipartUpload,
  uploadPart,
} from "@vercel/blob/client";

type Multipart = {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string; sha256: string }[];
};
// A checkpoint is durable before the next part is sent. On resume every already
// confirmed part is compared with the reselected file, including after reload.
export async function uploadOriginalParts(
  file: Blob,
  pathname: string,
  token: string,
  saved: Multipart | undefined,
  checkpoint: (state: Multipart) => Promise<void>,
  progress: (message: string) => void,
) {
  const options = {
    access: "private" as const,
    contentType: "video/mp4",
    token,
  };
  const multipart: Multipart = saved
    ? { ...saved, parts: [...saved.parts] }
    : { ...(await createMultipartUpload(pathname, options)), parts: [] };
  await checkpoint(multipart);
  const partSize = 16 * 1024 * 1024;
  for (
    let start = 0, partNumber = 1;
    start < file.size;
    start += partSize, partNumber++
  ) {
    const part = file.slice(start, Math.min(start + partSize, file.size)),
      hash = bytesToHex(sha256(new Uint8Array(await part.arrayBuffer()))),
      prior = multipart.parts.find((p) => p.partNumber === partNumber);
    if (prior) {
      if (prior.sha256 !== hash)
        throw new Error(
          "VIDEO_RESUME: Selected original differs from uploaded parts. Start a new upload",
        );
      continue;
    }
    progress(
      `Uploading original: ${Math.round((start / file.size) * 100)}%. Keep this page open or reselect the same file to resume.`,
    );
    const result = await uploadPart(pathname, part, {
      ...options,
      key: multipart.key,
      uploadId: multipart.uploadId,
      partNumber,
    });
    multipart.parts.push({ ...result, sha256: hash });
    await checkpoint(multipart);
  }
  try {
    await completeMultipartUpload(pathname, multipart.parts, {
      ...options,
      key: multipart.key,
      uploadId: multipart.uploadId,
    });
  } catch {
    // A lost finalize response is resolved by authoritative stored-byte verification.
    // Its failure remains visible; the original is never marked verified here.
  }
}
