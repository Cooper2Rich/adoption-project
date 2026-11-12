import { useConvex, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Doc } from "../../convex/functions.ts";
import { campaign } from "./creator-api.ts";
import { photoApi, type PhotoEntry } from "./photo-api.ts";
import { usePhotoToken } from "./photo-auth.tsx";
import { uploadOriginalParts } from "./video-upload.ts";
import { OriginalDownload } from "./OriginalDownload.tsx";

const endpoint = (action: string, id?: string) =>
  `/api/videos?action=${action}&campaignId=adoption${id ? `&uploadId=${id}` : ""}`;
type Video = Doc<"videoUploads">;
type Status = Pick<
  Video,
  | "_id"
  | "filename"
  | "subject"
  | "state"
  | "error"
  | "size"
  | "sha256"
  | "duration"
  | "attempt"
  | "createdAt"
> & { originalArchiveState: string };
const workspace = makeFunctionReference<
  "query",
  { campaignId: string },
  Status[]
>("videos:workspace");
const reserveRef = makeFunctionReference<
  "mutation",
  { campaignId: string; operationId: string; filename: string; size: number },
  Video
>("videos:reserve");
const accessRef = makeFunctionReference<
  "query",
  { campaignId: string; uploadId: Video["_id"] },
  Video
>("videos:uploadAccess");
const multipartRef = makeFunctionReference<
  "mutation",
  {
    campaignId: string;
    uploadId: Video["_id"];
    key: string;
    providerUploadId: string;
    parts: NonNullable<Video["multipart"]>["parts"];
  },
  null
>("videos:multipart");
export function videoError(error: unknown) {
  return (
    String(error instanceof Error ? error.message : error).match(
      /(?:VIDEO_[A-Z_]+|PUBLIC_NAME|DESCRIPTION_REQUIRED|STALE_VERSION|TERMS_UNAVAILABLE|ACCEPTANCE_REQUIRED|FORBIDDEN|OPERATION_CONFLICT):[^\n]*/,
    )?.[0] ??
    "Video operation could not be confirmed. Reconnect and retry the same original."
  );
}
export function ProcessedVideo({ id }: { id: string }) {
  const token = usePhotoToken(),
    element = useRef<HTMLVideoElement>(null);
  const state = useQuery(workspace, campaign)?.find(
    (record) => record._id === id,
  )?.state;
  const [message, setMessage] = useState(""),
    [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    setMessage("");
    void (async () => {
      try {
        const result = await fetch(endpoint("playback", id), {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error);
        if (active) setUrl(body.url);
      } catch (error) {
        if (active) setMessage(videoError(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [id, token, state]);
  useEffect(() => {
    const video = element.current;
    if (!video || !url) return;
    if (
      url.includes(".m3u8") &&
      !video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      let active = true,
        cleanup: () => void = () => {};
      void import("hls.js").then(({ default: Hls }) => {
        if (active && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
          cleanup = () => hls.destroy();
        }
      });
      return () => {
        active = false;
        cleanup();
      };
    }
    video.src = url;
  }, [url]);
  return url ? (
    <video
      ref={element}
      controls
      playsInline
      preload="metadata"
      aria-label="Processed video review"
      style={{ width: "100%", maxHeight: 420, background: "#111" }}
    />
  ) : (
    <p role="status">{message || "Loading verified processed playback…"}</p>
  );
}
export function VideoStatuses({
  onResume,
}: {
  onResume?: (id: Video["_id"]) => void;
}) {
  const records = useQuery(workspace, campaign),
    token = usePhotoToken();
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function retry(id: string, action: string) {
    setPending(true);
    try {
      const result = await fetch(endpoint(action, id), {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      setMessage("Original preserved. Status refresh requested.");
    } catch (error) {
      setMessage(videoError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel" aria-label="Video processing status">
      <h2>Video processing status</h2>
      <p>
        Exact originals remain private and preserved independently of processed
        playback.
      </p>
      {!records ? (
        <p>Loading video status…</p>
      ) : records.length === 0 ? (
        <p>No video uploads yet.</p>
      ) : (
        records.map((record) => (
          <article className="photo-entry" key={record._id}>
            <h3>{record.filename}</h3>
            <p>
              <strong>{record.state}</strong> ·{" "}
              {record.size?.toLocaleString("en-US")} bytes · attempt{" "}
              {record.attempt}
              {record.duration ? ` · ${record.duration} seconds` : ""}
            </p>
            {record.error && <p role="alert">{record.error}</p>}
            {record.sha256 && <OriginalDownload uploadId={record._id} />}
            {record.state === "ready" ? (
              <ProcessedVideo id={record._id} />
            ) : (
              <>
                <button
                  disabled={
                    pending ||
                    !["retained", "restored"].includes(
                      record.originalArchiveState,
                    )
                  }
                  onClick={() =>
                    void retry(record._id, record.sha256 ? "process" : "verify")
                  }
                >
                  {record.sha256
                    ? "Retry / refresh processing"
                    : "Retry byte verification"}
                </button>
                {!record.sha256 && onResume && (
                  <button
                    disabled={pending}
                    onClick={() => onResume(record._id)}
                  >
                    Resume this upload
                  </button>
                )}
              </>
            )}
          </article>
        ))
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function CreatorVideos({ canSubmit }: { canSubmit: boolean }) {
  const client = useConvex(),
    reserve = useMutation(reserveRef),
    submit = useMutation(photoApi.submit),
    saveMultipart = useMutation(multipartRef),
    token = usePhotoToken();
  const entries = useQuery(photoApi.workspace, campaign)?.filter(
    (entry) =>
      !!entry.versions.find((version) => version.version === entry.version)
        ?.video,
  );
  const [editing, setEditing] = useState<PhotoEntry | null>(null),
    [resumeId, setResumeId] = useState<Video["_id"] | null>(null),
    [title, setTitle] = useState(""),
    [publicCreatorName, setPublicCreatorName] = useState(""),
    [description, setDescription] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const operation = useRef({ id: crypto.randomUUID(), fingerprint: "" }),
    input = useRef<HTMLInputElement>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      if (!file && !editing && !resumeId)
        throw new Error("VIDEO_COUNT: Choose one MP4 original");
      const fingerprint = JSON.stringify([
        title,
        description,
        publicCreatorName,
        editing?._id,
        editing?.version,
        // Setting resumeId after reservation is internal progress, not a new
        // submission. Keep a lost-response retry bound to the same operation.
        file ? undefined : resumeId,
        file?.name,
        file?.size,
        file?.lastModified,
      ]);
      if (operation.current.fingerprint !== fingerprint)
        operation.current = { id: crypto.randomUUID(), fingerprint };
      const operationId = operation.current.id;
      const headers = { Authorization: `Bearer ${await token()}` };
      let id = editing?.versions.find(
        (version) => version.version === editing.version,
      )?.video;
      if (file || resumeId) {
        let record = resumeId
          ? await client.query(accessRef, { ...campaign, uploadId: resumeId })
          : await reserve({
              ...campaign,
              operationId,
              filename: file!.name,
              size: file!.size,
            });
        id = record._id;
        if (!record.sha256) {
          setResumeId(record._id);
          if (!file)
            throw new Error(
              "VIDEO_RESUME: Select the same original file to resume uploading",
            );
          if (
            file.size !== record.declaredSize ||
            file.name !== record.filename
          )
            throw new Error(
              "VIDEO_RESUME: Select the same original file or start a new upload",
            );
          if (
            import.meta.env.DEV &&
            import.meta.env.VITE_LOCAL_LAUNCH_HARNESS === "owned-isolated-run"
          ) {
            const result = await fetch(endpoint("local-upload", id), {
              method: "PUT",
              headers,
              body: file,
            });
            if (!result.ok && result.status !== 400)
              throw new Error((await result.json()).error);
          } else {
            const response = await fetch(endpoint("token"), {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "blob.generate-client-token",
                payload: {
                  pathname: record.pathname,
                  multipart: true,
                  clientPayload: JSON.stringify({ uploadId: id }),
                },
              }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            await uploadOriginalParts(
              file,
              record.pathname,
              body.clientToken,
              record.multipart,
              async (multipart) => {
                await saveMultipart({
                  ...campaign,
                  uploadId: id!,
                  key: multipart.key,
                  providerUploadId: multipart.uploadId,
                  parts: multipart.parts,
                });
              },
              setMessage,
            );
          }
          setMessage("Verifying the exact stored original…");
          const verified = await fetch(endpoint("verify", id), {
            method: "POST",
            headers,
          });
          const body = await verified.json();
          if (!verified.ok) throw new Error(body.error);
          record = body;
        }
        const processed = await fetch(endpoint("process", id), {
          method: "POST",
          headers,
        });
        const body = await processed.json();
        if (!processed.ok) setMessage(body.error);
      }
      if (!id) throw new Error("VIDEO_COUNT: Choose one original video");
      const saved = await submit({
        ...campaign,
        operationId,
        title,
        description,
        publicCreatorName: publicCreatorName.trim(),
        photos: [],
        video: id,
        ...(editing
          ? { entryId: editing._id, expectedVersion: editing.version }
          : {}),
      });
      setMessage(
        saved._id !== editing?._id && editing
          ? "Replacement saved as a separate pending entry. Original history remains intact."
          : "Video submitted for fresh review. Playback awaits verified processing. Submission acceptance does not guarantee platform acceptance or placement.",
      );
      setEditing(null);
      setResumeId(null);
      setTitle("");
      setDescription("");
      setPublicCreatorName("");
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      setMessage(videoError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Your video submissions">
      <div className="panel">
        <h2>Your video submissions</h2>
        <p>
          Upload one exact MP4/H.264 original with AAC or no audio: up to
          5,000,000,000 bytes and 60 seconds, inclusive. Your original stays
          private. Staff review processed playback and return corrections to
          you. Verified originals have no automatic archive expiry, including
          after campaign completion, withdrawal or playback removal.
        </p>
        {canSubmit ? (
          <form onSubmit={save} className="photo-form">
            <h3>
              {editing
                ? `Correct video version ${editing.version}`
                : resumeId
                  ? "Resume original upload"
                  : "Submit a video"}
            </h3>
            <label>
              Public creator name (optional)
              <input
                maxLength={80}
                value={publicCreatorName}
                onChange={(event) => setPublicCreatorName(event.target.value)}
              />
              <span>
                This name appears with approved ads. Leave blank to use a stable
                campaign creator identifier. Do not enter your email.
              </span>
            </label>
            <label>
              Video title
              <input
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div>
              <label htmlFor="video-description">Video description</label>
              <textarea
                id="video-description"
                required
                maxLength={5000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <label>
              MP4 original video
              <input
                ref={input}
                type="file"
                accept="video/mp4"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button className="primary-button" disabled={pending}>
              {pending
                ? "Uploading / verifying video…"
                : editing
                  ? "Submit video correction"
                  : "Submit video for review"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                operation.current = {
                  id: crypto.randomUUID(),
                  fingerprint: "",
                };
                setResumeId(null);
                setEditing(null);
                setFile(null);
                if (input.current) input.current.value = "";
              }}
            >
              Start a new upload
            </button>
          </form>
        ) : (
          <p role="alert">
            Video submission is blocked until the actual applicable
            participation terms are available. Your saved history remains
            accessible.
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      <VideoStatuses
        onResume={(id) => {
          setResumeId(id);
          input.current?.scrollIntoView({ block: "center" });
        }}
      />
      {entries?.map((entry) => {
        const version = entry.versions.find(
          (version) => version.version === entry.version,
        )!;
        return (
          <article className="panel photo-entry" key={entry._id}>
            <h3>{version.title}</h3>
            <p>
              {version.description} · {entry.status} · Version {entry.version}
            </p>
            <p>Tracked fundraising path: {entry.trackedPath}</p>
            <ProcessedVideo id={version.video!} />
            <OriginalDownload
              uploadId={version.video!}
              entryId={entry._id}
              version={version.version}
            />
            <button
              disabled={pending || !canSubmit}
              onClick={() => {
                setEditing(entry);
                setResumeId(null);
                setFile(null);
                setTitle(version.title);
                setDescription(version.description);
                setPublicCreatorName(version.publicCreatorName ?? "");
                if (input.current) input.current.value = "";
                input.current?.scrollIntoView({ block: "center" });
              }}
            >
              Correct {version.title}
            </button>
            <details>
              <summary>
                Video revision history ({entry.versions.length} versions)
              </summary>
              {entry.versions.map((version) => (
                <div key={version._id}>
                  <p>
                    Version {version.version} · {version.title} · agreement{" "}
                    {version.acceptanceId} ·{" "}
                    {new Date(version.at).toISOString()} · {version.actor}
                  </p>
                  {version.video && version.version !== entry.version && (
                    <OriginalDownload
                      uploadId={version.video}
                      entryId={entry._id}
                      version={version.version}
                    />
                  )}
                </div>
              ))}
            </details>
          </article>
        );
      })}
    </section>
  );
}
