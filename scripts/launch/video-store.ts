import Mux from "@mux/ts";
import type { WebhookBody } from "@mux/ts/resources/webhooks.mjs";
import ffmpeg from "ffmpeg-static";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import {
  link,
  mkdir,
  open,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { inspectVideo } from "../../server/launch/video-inspection.ts";

export async function localVideoStore(directory: string) {
  const root = join(directory, "private-video-fixture");
  await mkdir(root, { recursive: true });
  const path = (name: string) => {
    if (!/^videos\/[a-z0-9]+\.mp4$/.test(name))
      throw new Error("VIDEO_PATH: Invalid video identity");
    return join(root, name.slice(7));
  };
  return {
    read: async (name: any) => Readable.toWeb(createReadStream(path(name))),
    async write(name: any, stream: any) {
      const destination = path(name),
        temporary = destination + "." + randomUUID();
      const file = await open(temporary, "wx");
      let size = 0;
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > 5_000_000_000)
            throw new Error("VIDEO_SIZE: Choose at most 5,000,000,000 bytes");
          await file.write(chunk);
        }
        await file.close();
        await link(temporary, destination);
      } finally {
        await file.close();
        await unlink(temporary);
      }
    },
    async token() {
      throw new Error("VIDEO_FIXTURE: Use the owned local byte route");
    },
  };
}

// Explicit candidate, persistent and owned by one run. Actual provider evidence
// remains separate. Test callbacks still pass the official signature verifier.
export async function localMuxProvider(
  directory: string,
  webhookSecret: string,
) {
  const path = join(directory, "synthetic-mux.json");
  try {
    await readFile(path);
  } catch {
    await writeFile(
      path,
      JSON.stringify({ assets: [] as any[], calls: 0, mode: "processing" }),
    );
  }
  let queue = Promise.resolve();
  async function access(change: (state: any) => any) {
    const operation = queue.then(async () => {
      const state = JSON.parse(await readFile(path, "utf8"));
      const result = await change(state);
      await writeFile(path, JSON.stringify(state));
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  const sdk = new Mux({
    tokenId: "synthetic",
    tokenSecret: "synthetic",
    webhookSecret,
    maxRetries: 0,
  });
  return {
    synthetic: true,
    available: () => true,
    mode: async (mode: any) =>
      access((s: any) => {
        s.mode = mode;
      }),
    calls: async () => access((s: any) => s.calls),
    async create(url: string | URL | Request, identity: string) {
      return access(async (s: any) => {
        s.calls++;
        await writeFile(path, JSON.stringify(s));
        if (s.mode === "reject") {
          throw Object.assign(new Error("Synthetic rejection"), {
            status: 422,
          });
        }
        if (s.mode === "unknown-absent")
          throw new Error("Synthetic lost request");
        const source = await fetch(url);
        if (!source.ok) throw new Error("Synthetic source fetch failed");
        const inspection = await inspectVideo(
          source.body,
          Number(source.headers.get("content-length")),
        );
        const asset: Record<string, any> = {
          id: `synthetic-${s.calls}`,
          passthrough: identity,
          status: s.mode === "ready" ? "ready" : "preparing",
          playback_ids: [
            { id: `synthetic-playback-${s.calls}`, policy: "signed" },
          ],
          source: url,
        };
        asset.inputInfo = [
          {
            file: {
              container_format: "mov,mp4,m4a,3gp,3g2,mj2",
              tracks: [
                {
                  type: "video",
                  encoding: inspection.videoCodec,
                  duration: inspection.duration,
                },
                ...(inspection.audioCodec === "aac"
                  ? [
                      {
                        type: "audio",
                        encoding: "aac",
                        duration: inspection.duration,
                      },
                    ]
                  : []),
              ],
            },
          },
        ];
        const id = identity.split(":")[0];
        if (!/^[a-z0-9]+$/.test(id)) throw new Error("Invalid source identity");
        const output = join(directory, `${asset.playback_ids[0].id}.mp4`);
        const child = spawn(
          ffmpeg!,
          [
            "-v",
            "error",
            "-y",
            "-i",
            join(directory, "private-video-fixture", `${id}.mp4`),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            output,
          ],
          { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
        );
        let errors = "";
        child.stderr.on("data", (c: any) => (errors += c));
        const [code] = await once(child, "exit");
        if (code !== 0) throw new Error(`Synthetic decode failed: ${errors}`);
        s.assets.push(asset);
        if (s.mode === "unknown") {
          await writeFile(path, JSON.stringify(s));
          throw new Error("Synthetic lost response");
        }
        return asset;
      });
    },
    async find(identity: string, id: any) {
      return access(
        (s: any) =>
          s.assets.find((a: any) =>
            id ? a.id === id : a.passthrough === identity,
          ) ?? null,
      );
    },
    async inputs(id: any) {
      return access((s: any) => {
        const a = s.assets.find((a: any) => a.id === id);
        if (!a) throw new Error("Missing synthetic asset");
        return (
          a.inputInfo ?? [
            {
              file: {
                container_format: "mov,mp4,m4a,3gp,3g2,mj2",
                tracks: [{ type: "video", encoding: "h264", duration: 1 }],
              },
            },
          ]
        );
      });
    },
    async update(id: any, patch: any) {
      return access((s: any) => {
        const a = s.assets.find((a: any) => a.id === id);
        if (!a) throw new Error("Missing synthetic asset");
        Object.assign(a, patch);
        return a;
      });
    },
    unwrap: (body: WebhookBody, headers: any) =>
      sdk.webhooks.unwrap(body, headers),
    signature(body: string, timestamp: any = Math.floor(Date.now() / 1000)) {
      return `t=${timestamp},v1=${createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;
    },
    async playbackBytes(id: string) {
      if (!/^synthetic-playback-\d+$/.test(id))
        throw new Error("Invalid processed identity");
      return Readable.toWeb(createReadStream(join(directory, `${id}.mp4`)));
    },
  };
}
