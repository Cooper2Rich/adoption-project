import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useRef, useState } from "react";

type Status = {
  state: string;
  generation: number;
  isAdministrator: boolean;
  requestedAt?: number;
  purgeAt?: number;
  confirmedAt?: number;
  message?: string;
  reasons: string[];
  purgeAvailable: boolean;
  history: {
    action: string;
    actor: string;
    source: string;
    at: number;
    generation: number;
  }[];
};
const statusRef = makeFunctionReference<
  "query",
  { campaignId: string; uploadId: string },
  Status
>("originalArchives:status");
const changeRef = makeFunctionReference<
  "mutation",
  {
    campaignId: string;
    uploadId: string;
    expectedGeneration: number;
    operationId: string;
    action: "request" | "restore" | "reconfirm";
    confirmation?: string;
  },
  null
>("originalArchives:change");
const retryRef = makeFunctionReference<
  "mutation",
  { campaignId: string; uploadId: string },
  null
>("originalArchives:retry");
export function useOriginalArchive(uploadId: string) {
  return useQuery(statusRef, { campaignId: "adoption", uploadId });
}
export function OriginalRecovery({
  uploadId,
  status,
}: {
  uploadId: string;
  status: Status | undefined;
}) {
  const change = useMutation(changeRef),
    retry = useMutation(retryRef);
  const [confirming, setConfirming] = useState<"request" | "reconfirm" | null>(
      null,
    ),
    [confirmation, setConfirmation] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const operation = useRef<{ id: string; fingerprint: string } | null>(null);
  async function act(action: "request" | "restore" | "reconfirm") {
    if (!status) return;
    const fingerprint = JSON.stringify([
      action,
      status.generation,
      confirmation,
    ]);
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { id: crypto.randomUUID(), fingerprint };
    const operationId = operation.current.id;
    setPending(true);
    try {
      await change({
        campaignId: "adoption",
        uploadId,
        expectedGeneration: status.generation,
        operationId,
        action,
        ...(action !== "restore" ? { confirmation } : {}),
      });
      operation.current = null;
      setConfirming(null);
      setConfirmation("");
      setMessage(
        action === "request"
          ? "Deletion confirmed. Original bytes remain for the full recovery window."
          : action === "reconfirm"
            ? "Deletion authority reconfirmed. The original recovery deadline is unchanged."
            : "Original restored. Pending purge cancelled.",
      );
    } catch (error) {
      setMessage(
        String(error instanceof Error ? error.message : error).match(
          /(?:VIDEO_[A-Z_]+|FORBIDDEN|STALE_VERSION|OPERATION_CONFLICT):[^\n]*/,
        )?.[0] ?? "Archive operation is unconfirmed. Reconnect and retry.",
      );
    } finally {
      setPending(false);
    }
  }
  if (!status) return <p role="status">Loading original archive status…</p>;
  const recovery = ["pending", "blocked"].includes(status.state);
  const irreversible = ["dispatched", "unknown", "failed"].includes(
    status.state,
  );
  return (
    <div className="original-recovery" aria-label="Original recovery">
      <p>
        <strong>
          Original archive:{" "}
          {status.state === "deleted" ? "permanently deleted" : status.state}
        </strong>
      </p>
      {status.state === "deleted" && (
        <p>
          Physical absence confirmed{" "}
          {new Date(status.confirmedAt!).toISOString()}. The deletion audit is
          retained.
        </p>
      )}
      {recovery && (
        <p>
          Original bytes are retained for 30 elapsed days. Recovery closes{" "}
          {new Date(status.purgeAt!).toISOString()}. Storage usage continues.
          Restoring cancels pending purge.
        </p>
      )}
      {irreversible && (
        <p>
          Deletion was dispatched; physical deletion is unconfirmed. Restoration
          and new use are blocked while the outcome is uncertain.
        </p>
      )}
      {status.message && <p role="status">{status.message}</p>}
      {!status.purgeAvailable && status.isAdministrator && (
        <p>
          Automatic purge is unavailable until the storage worker, actual media
          evidence and configuration are supplied. This is not a permanent
          deletion confirmation.
        </p>
      )}
      {status.isAdministrator && (
        <>
          {["retained", "restored"].includes(status.state) && (
            <>
              {status.reasons.length > 0 && (
                <p>Deletion blocked: {status.reasons.join("; ")}.</p>
              )}
              <button
                type="button"
                disabled={pending || status.reasons.length > 0}
                onClick={() => setConfirming("request")}
              >
                Request original deletion
              </button>
            </>
          )}
          {confirming && (
            <div role="group" aria-label="Confirm original deletion">
              <p>
                {confirming === "reconfirm"
                  ? `Reconfirm authority for this existing deletion. The recovery deadline remains ${new Date(status.purgeAt!).toISOString()}. This does not start a new recovery window. If that deadline has elapsed, purge is immediately eligible after current-use and provider checks.`
                  : "Confirm deletion of this exact original. It will remain recoverable for 30 days, then become eligible for permanent physical deletion."}{" "}
                Public removal and playback removal do not delete the original.
                Starting purge blocks new original transfers, including
                previously issued links. Transfers already started may finish.
              </p>
              <label>
                Type DELETE ORIGINAL
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                disabled={pending || confirmation !== "DELETE ORIGINAL"}
                onClick={() => void act(confirming ?? "request")}
              >
                {confirming === "reconfirm"
                  ? "Reconfirm with unchanged recovery deadline"
                  : "Confirm deletion with 30-day recovery"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirming(null);
                  setConfirmation("");
                }}
              >
                Cancel deletion request
              </button>
            </div>
          )}
          {recovery && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming("reconfirm")}
            >
              Reconfirm deletion authority
            </button>
          )}
          {recovery && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void act("restore")}
            >
              Restore original and cancel purge
            </button>
          )}
          {(recovery || irreversible) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void retry({ campaignId: "adoption", uploadId })
                  .then(() =>
                    setMessage(
                      "Purge reconciliation requested; refresh status before assuming deletion.",
                    ),
                  )
                  .catch(() =>
                    setMessage(
                      "Purge reconciliation unavailable. Reconnect and retry.",
                    ),
                  )
                  .finally(() => setPending(false));
              }}
            >
              Retry / reconcile original purge
            </button>
          )}
        </>
      )}
      {message && status.state !== "deleted" && <p role="status">{message}</p>}
      {status.history.length > 0 && (
        <details>
          <summary>
            Original deletion audit ({status.history.length} events)
          </summary>
          {status.history.map((event, index) => (
            <p key={index}>
              {event.action} · {event.actor} ·{" "}
              {new Date(event.at).toISOString()} · version {event.generation} ·{" "}
              {event.source}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
