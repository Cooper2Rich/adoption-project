import { upload } from "@vercel/blob/client";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Doc } from "../../convex/functions.ts";
import { campaign } from "./creator-api.ts";
import { timestamp } from "./format.ts";
import { photoApi, type PhotoEntry } from "./photo-api.ts";
import { usePhotoToken } from "./photo-auth.tsx";
import { ProcessedVideo, VideoStatuses } from "./Videos.tsx";
import { OriginalDownload } from "./OriginalDownload.tsx";

function errorText(error: unknown) {
  return (
    String(error instanceof Error ? error.message : error).match(
      /(?:VIDEO_[A-Z_]+|PHOTO_[A-Z_]+|STALE_VERSION|TERMS_UNAVAILABLE|ACCEPTANCE_REQUIRED|REASON_REQUIRED|DESCRIPTION_REQUIRED|PUBLIC_NAME|OPERATION_CONFLICT|FORBIDDEN):[^\n]*/,
    )?.[0] ?? "Photo operation could not be confirmed. Reconnect and retry."
  );
}
function endpoint(action: string, id?: string) {
  return `/api/photos?action=${action}&campaignId=adoption${id ? `&uploadId=${id}` : ""}`;
}
function PrivatePhoto({ id }: { id: string }) {
  const token = usePhotoToken();
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    void (async () => {
      try {
        const result = await fetch(endpoint("resource", id), {
          headers: { Authorization: `Bearer ${await token()}` },
        });
        if (!result.ok) throw new Error("Unavailable");
        objectUrl = URL.createObjectURL(await result.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  return url ? (
    <a href={url} download="submitted-photo">
      <img
        className="submitted-photo"
        src={url}
        alt="Unmodified submitted photo"
      />
    </a>
  ) : (
    <p>
      {error
        ? "Private photo unavailable. Check your session."
        : "Loading private photo…"}
    </p>
  );
}
function EntryHistory({ entry }: { entry: PhotoEntry }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = entry.versions.find((v) => v.version === entry.version)!;
  return (
    <>
      <h3>{current.title}</h3>
      <p>{current.description}</p>
      <p>
        Public attribution: {current.publicCreatorName || "Campaign creator"}
      </p>
      <p>
        <strong>{entry.status}</strong> · Version {entry.version}
      </p>
      <p>
        Tracked fundraising path: <code>{entry.trackedPath}</code>
      </p>
      <p className="muted">
        This competition entry keeps the same tracked fundraising link across
        sharing and platform placements.
      </p>
      <div className="photo-grid">
        {current.video && <ProcessedVideo id={current.video} />}
        {current.photos.map((id) => (
          <PrivatePhoto key={id} id={id} />
        ))}
      </div>
      {current.video && (
        <OriginalDownload
          uploadId={current.video}
          entryId={entry._id}
          version={current.version}
        />
      )}
      <details onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary>
          Submission and review history ({entry.versions.length} versions)
        </summary>
        {entry.versions.map((v) => (
          <section key={v._id}>
            <h4>
              Version {v.version}: {v.title}
            </h4>
            <p>{v.description}</p>
            {historyOpen && v.video && v.version !== entry.version && (
              <OriginalDownload
                uploadId={v.video}
                entryId={entry._id}
                version={v.version}
              />
            )}
            <p>
              {timestamp(v.at)} · {v.actor} · {v.source} · {v.photos.length}{" "}
              original photos · agreement {v.acceptanceId}
            </p>
            {historyOpen && v.version !== entry.version && (
              <div className="photo-grid">
                {v.photos.map((id) => (
                  <PrivatePhoto key={id} id={id} />
                ))}
              </div>
            )}
          </section>
        ))}
        {entry.events.map((e) => (
          <p key={e._id}>
            {e.action} · version {e.version} · {timestamp(e.at)} · {e.actor}
            {e.reason ? ` · ${e.reason}` : ""}
          </p>
        ))}
      </details>
    </>
  );
}
export function CreatorPhotos({ canSubmit }: { canSubmit: boolean }) {
  const entries = useQuery(photoApi.workspace, campaign)?.filter(
    (e) => !e.versions.find((v) => v.version === e.version)?.video,
  );
  const reserve = useMutation(photoApi.reserve),
    submit = useMutation(photoApi.submit);
  const token = usePhotoToken();
  const [editing, setEditing] = useState<PhotoEntry | null>(null);
  const [title, setTitle] = useState(""),
    [publicCreatorName, setPublicCreatorName] = useState(""),
    [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<{
    fingerprint: string;
    id: string;
    photos: Doc<"photoUploads">["_id"][];
  } | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      if (!editing && !files.length)
        throw new Error("PHOTO_COUNT: Choose 1 to 10 photos");
      if (files.length > 10)
        throw new Error("PHOTO_COUNT: Choose at most 10 photos");
      if (files.some((f) => !["image/jpeg", "image/png"].includes(f.type)))
        throw new Error("PHOTO_FORMAT: Choose JPEG or PNG photos");
      if (files.some((f) => f.size < 1 || f.size > 100_000_000))
        throw new Error(
          "PHOTO_SIZE: Each photo must contain 1 to 100,000,000 bytes",
        );
      if (files.reduce((sum, f) => sum + f.size, 0) > 1_000_000_000)
        throw new Error(
          "PHOTO_TOTAL: Choose at most 1,000,000,000 photo bytes",
        );
      const fingerprint = JSON.stringify({
        title,
        description,
        publicCreatorName: publicCreatorName.trim(),
        entry: editing?._id,
        version: editing?.version,
        files: files.map((f) => [f.name, f.size, f.lastModified]),
      });
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, id: crypto.randomUUID(), photos: [] };
      const operation = retry.current;
      const headers = { Authorization: `Bearer ${await token()}` };
      for (let index = operation.photos.length; index < files.length; index++) {
        const file = files[index]!;
        const record = await reserve({
          ...campaign,
          operationId: `${operation.id}-${index}`,
          filename: file.name,
          size: file.size,
          type: file.type as "image/jpeg" | "image/png",
        });
        if (
          import.meta.env.DEV &&
          import.meta.env.VITE_LOCAL_LAUNCH_HARNESS === "owned-isolated-run"
        ) {
          const result = await fetch(endpoint("local-upload", record._id), {
            method: "PUT",
            headers,
            body: file,
          });
          // An immutable local object may already exist after a lost response;
          // verification below proves its actual content before submission.
          if (!result.ok && result.status !== 400)
            throw new Error((await result.json()).error);
        } else {
          try {
            await upload(record.pathname, file, {
              access: "private",
              handleUploadUrl: endpoint("token"),
              clientPayload: JSON.stringify({ uploadId: record._id }),
              headers,
              multipart: true,
              contentType: record.type,
            });
          } catch {
            /* Verify an existing immutable upload after a response loss. */
          }
        }
        const result = await fetch(endpoint("verify", record._id), {
          method: "POST",
          headers,
        });
        const verified = await result.json();
        if (!result.ok) throw new Error(verified.error);
        operation.photos.push(record._id);
      }
      const photos = files.length
        ? operation.photos
        : editing!.versions.find((v) => v.version === editing!.version)!.photos;
      const saved = await submit({
        ...campaign,
        operationId: operation.id,
        title,
        description,
        publicCreatorName: publicCreatorName.trim(),
        photos,
        ...(editing
          ? { entryId: editing._id, expectedVersion: editing.version }
          : {}),
      });
      setMessage(
        saved._id !== editing?._id && editing
          ? "Replacement saved as a separate pending entry with its own link. Original history and results remain intact."
          : "Saved for manager review. Upload acceptance does not guarantee platform acceptance or placement.",
      );
      setEditing(null);
      setTitle("");
      setDescription("");
      setPublicCreatorName("");
      setFiles([]);
      retry.current = null;
      if (input.current) input.current.value = "";
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="panel photo-workspace"
      aria-label="Your photo submissions"
    >
      <h2>Your photo submissions</h2>
      <p>
        Choose 1–10 JPEG/PNG photos, up to 100,000,000 bytes each and
        1,000,000,000 bytes total. Staff review your exact files and return
        problems to you; they do not edit or reformat creative.
      </p>
      <p>
        Corrections before first approval keep the entry and link. Replacing
        approved media creates a new pending entry and link with no inherited
        approval, metrics or earnings. Title and description edits keep the
        entry and require review.
      </p>
      {canSubmit ? (
        <form onSubmit={save} className="photo-form">
          <h3>
            {editing ? `Edit version ${editing.version}` : "Submit photos"}
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
            Photo title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div>
            <label htmlFor="photo-description">Photo description</label>
            <textarea
              id="photo-description"
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label>
            {editing
              ? "Replacement photos (leave empty for descriptive edits)"
              : "JPEG/PNG photos"}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []));
                retry.current = null;
              }}
            />
          </label>
          <button className="primary-button" disabled={pending}>
            {pending
              ? "Verifying photo bytes…"
              : editing
                ? "Submit correction"
                : "Submit photos for review"}
          </button>
          {editing && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(null);
                setTitle("");
                setDescription("");
                setPublicCreatorName("");
                setFiles([]);
                retry.current = null;
                if (input.current) input.current.value = "";
              }}
            >
              Cancel correction
            </button>
          )}
        </form>
      ) : (
        <p role="alert">
          Photo submission is blocked until the actual applicable participation
          terms are available. Your saved submission history remains below.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!entries ? (
        <p>Loading submissions…</p>
      ) : entries.length === 0 ? (
        <p>No submissions yet.</p>
      ) : (
        entries.map((entry) => (
          <article
            className="photo-entry"
            key={entry._id}
            aria-label={`Submission ${entry._id}`}
          >
            <EntryHistory entry={entry} />
            <button
              disabled={pending}
              onClick={() => {
                const v = entry.versions.find(
                  (v) => v.version === entry.version,
                )!;
                setEditing(entry);
                setTitle(v.title);
                setDescription(v.description);
                setPublicCreatorName(v.publicCreatorName ?? "");
                setFiles([]);
                retry.current = null;
                if (input.current) input.current.value = "";
                input.current?.scrollIntoView({ block: "center" });
              }}
            >
              Correct {entry.versions.at(-1)!.title}
            </button>
          </article>
        ))
      )}
    </section>
  );
}
function ReviewEntry({ entry }: { entry: PhotoEntry }) {
  const review = useMutation(photoApi.review);
  const [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const operation = useRef<{ key: string; id: string } | null>(null);
  async function decide(decision: "approved" | "rejected" | "revisions") {
    setPending(true);
    setMessage("");
    const key = JSON.stringify({ version: entry.version, decision, reason });
    if (operation.current?.key !== key)
      operation.current = { key, id: crypto.randomUUID() };
    try {
      await review({
        ...campaign,
        entryId: entry._id,
        expectedVersion: entry.version,
        operationId: operation.current.id,
        decision,
        reason,
      });
      setMessage(
        decision === "approved"
          ? "Approved unchanged creative. No paid advertising was dispatched."
          : "Feedback saved for the creator.",
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="panel photo-entry" aria-label={`Review ${entry._id}`}>
      <EntryHistory entry={entry} />
      {entry.status !== "approved" && (
        <>
          <label htmlFor={`review-feedback-${entry._id}`}>
            Review feedback (required for revisions or rejection)
          </label>
          <textarea
            id={`review-feedback-${entry._id}`}
            value={reason}
            maxLength={5000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="photo-actions">
            <button disabled={pending} onClick={() => void decide("revisions")}>
              Request revisions
            </button>
            <button disabled={pending} onClick={() => void decide("rejected")}>
              Reject with reason
            </button>
            <button
              className="primary-button"
              disabled={pending}
              onClick={() => void decide("approved")}
            >
              Approve unchanged creative
            </button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
export function PhotoReview() {
  const entries = useQuery(photoApi.workspace, campaign);
  return (
    <main className="preview-layout campaign-setup">
      <p className="eyebrow">adoption.is / Manager review</p>
      <h1>Review creator photos and videos.</h1>
      <VideoStatuses />
      <p>
        Review submitted photos and processed video playback. Return creative or
        formatting problems to the creator. Approval permits public display;
        paid advertising requires separate launch readiness and admission.
      </p>
      {!entries ? (
        <p>Loading submissions…</p>
      ) : entries.length ? (
        entries.map((entry) => <ReviewEntry key={entry._id} entry={entry} />)
      ) : (
        <p>No creative submissions to review.</p>
      )}
    </main>
  );
}
