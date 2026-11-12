import { OriginalRecovery, useOriginalArchive } from "./OriginalRecovery.tsx";
import { useRef, useState } from "react";
import { usePhotoToken } from "./photo-auth.tsx";

type OriginalDownloadProps = {
  uploadId: string;
  entryId?: string;
  version?: number;
};

export function OriginalDownload(props: OriginalDownloadProps) {
  return (
    <OriginalDownloadControl
      key={`${props.uploadId}:${props.entryId ?? ""}:${props.version ?? ""}`}
      {...props}
    />
  );
}

function OriginalDownloadControl({
  uploadId,
  entryId,
  version,
}: OriginalDownloadProps) {
  const token = usePhotoToken();
  const archive = useOriginalArchive(uploadId);
  const unavailable =
    archive &&
    ["dispatched", "unknown", "failed", "deleted"].includes(archive.state);
  const operation = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [grant, setGrant] = useState<{ url: string; expiresAt: number } | null>(
    null,
  );
  async function issue() {
    setPending(true);
    setGrant(null);
    operation.current ??= crypto.randomUUID();
    const operationId = operation.current;
    try {
      const result = await fetch(
        `/api/videos?action=original-ticket&campaignId=adoption&uploadId=${uploadId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entryId,
            version,
            operationId,
          }),
        },
      );
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      if (body.expiresAt <= Date.now()) {
        operation.current = null;
        throw new Error(
          "VIDEO_EXPIRED: Request a fresh original download link",
        );
      }
      setGrant(body);
      operation.current = null;
      setMessage(
        "Private link issued. The transfer starts when you select Download exact original.",
      );
    } catch (error) {
      setMessage(
        String(error instanceof Error ? error.message : error).match(
          /(?:FORBIDDEN|VIDEO_[A-Z_]+|OPERATION_CONFLICT):[^\n]*/,
        )?.[0] ??
          "Original download unavailable. Reconnect and retry this request.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="original-download"
      aria-label={
        version === undefined
          ? "Private original archive"
          : `Private original version ${version}`
      }
    >
      <OriginalRecovery uploadId={uploadId} status={archive} />
      <button
        type="button"
        disabled={pending || !!unavailable}
        onClick={() => void issue()}
      >
        {pending ? "Requesting private link…" : "Get original download link"}
      </button>
      {grant && !unavailable && (
        <p>
          <a href={grant.url} download rel="noreferrer">
            Download exact original
          </a>
          {" · "}Expires {new Date(grant.expiresAt).toLocaleTimeString()}.
        </p>
      )}
      {message && !unavailable && <p role="status">{message}</p>}
      <p className="muted">
        Links last five minutes. Anyone holding an issued link can use it until
        expiry, even after access is revoked, unless original purge starts.
        Purge blocks new transfers. A transfer already started may finish
        afterward. Keep the link private.
      </p>
    </div>
  );
}
