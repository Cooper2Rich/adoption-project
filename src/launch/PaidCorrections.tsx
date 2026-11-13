import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference, type RegisteredQuery } from "convex/server";
import type { read } from "../../convex/paidMetrics.ts";
import { timestamp } from "./format.ts";
type Data =
  typeof read extends RegisteredQuery<"public", any, infer R>
    ? Awaited<R>
    : never;
const inspectApi = makeFunctionReference<"query">("paidCorrections:inspect"),
  saveApi = makeFunctionReference<"mutation">("paidCorrections:save"),
  releaseApi = makeFunctionReference<"mutation">("paidCorrections:release");
const inputTime = (n: number) => new Date(n).toISOString().slice(0, 19);
export function PaidCorrections({ data }: { data: Data }) {
  const [entryId, setEntry] = useState(""),
    [metric, setMetric] = useState("impressions"),
    [start, setStart] = useState(() =>
      data.inputs[0] ? inputTime(data.inputs[0].period.start) : "",
    ),
    [end, setEnd] = useState(() =>
      data.inputs[0] ? inputTime(data.inputs[0].period.end) : "",
    ),
    [value, setValue] = useState(""),
    [source, setSource] = useState(""),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [certified, setCertified] = useState(false),
    [releaseReason, setReleaseReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const startMs = Date.parse(start + "Z"),
    endMs = Date.parse(end + "Z"),
    valid =
      !!data.correctionBounds &&
      !!entryId &&
      Number.isSafeInteger(startMs) &&
      Number.isSafeInteger(endMs) &&
      startMs < endMs &&
      startMs >= Date.parse(data.correctionBounds.campaignStart) &&
      endMs <= Date.parse(data.correctionBounds.campaignEnd);
  const scope = {
    campaignId: "adoption",
    entryId,
    metric,
    start: startMs,
    end: endMs,
  };
  const prior = useQuery(inspectApi, valid ? scope : "skip"),
    save = useMutation(saveApi),
    release = useMutation(releaseApi);
  async function perform(work: () => Promise<unknown>, text: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(text);
    } catch (error) {
      setMessage(
        String(error).match(/(?:PAID_[A-Z_]+|FORBIDDEN):[^\r\n]*/)?.[0] ??
          "Could not save. Review current scope, permission and history.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Manager metric corrections">
      <h2>Fallback and certified corrections</h2>
      <p>
        Replace one entry metric for an exact range. Times below are UTC; the
        end is exclusive. Certification requires an evidence reference and
        remains authoritative until explicit release. Reasoned fallback does not
        establish completeness.
      </p>
      {!data.correctionBounds ? (
        <p>Configure the campaign period before entering metric corrections.</p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform(
            () =>
              save({
                ...scope,
                value: Number(value),
                source,
                reason,
                certified,
                ...(evidence ? { evidence } : {}),
                expectedInputFingerprint: prior.inputFingerprint,
                expectedRevision: data.correctionState.revision,
                operationId: crypto.randomUUID(),
              }),
            "Metric correction saved with immutable history.",
          );
        }}
      >
        <label htmlFor="correction-entry">Correction entry</label>
        <select
          id="correction-entry"
          value={entryId}
          required
          onChange={(e) => setEntry(e.target.value)}
        >
          <option value="">Choose entry</option>
          {data.correctionEntries.map((e) => (
            <option value={e._id} key={e._id}>
              {e.title} · {e._id}
            </option>
          ))}
        </select>
        <label htmlFor="correction-metric">Correction metric</label>
        <select
          id="correction-metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="impressions">Paid impressions</option>
          <option value="linkClicks">Total link clicks</option>
        </select>
        <label htmlFor="correction-start">Range start (UTC)</label>
        <input
          id="correction-start"
          type="datetime-local"
          step="1"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label htmlFor="correction-end">Range end (UTC, exclusive)</label>
        <input
          id="correction-end"
          type="datetime-local"
          step="1"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <p>
          Prior value:{" "}
          {prior?.value?.toLocaleString() ?? "Unknown for this exact scope"}.{" "}
          {prior?.reason}
        </p>
        <label htmlFor="correction-value">New metric value</label>
        <input
          id="correction-value"
          type="number"
          min="0"
          max={Number.MAX_SAFE_INTEGER}
          step="1"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <label htmlFor="correction-source">Fallback or correction source</label>
        <input
          id="correction-source"
          maxLength={120}
          required
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <label htmlFor="correction-reason">Correction reason</label>
        <input
          id="correction-reason"
          maxLength={500}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={certified}
            onChange={(e) => setCertified(e.target.checked)}
          />
          Certify this exact scope
        </label>
        <label htmlFor="correction-evidence">Evidence reference</label>
        <input
          id="correction-evidence"
          maxLength={500}
          required={certified}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
        <p>
          New value: {value || "Not entered"} ·{" "}
          {certified ? "Certified exact scope" : "Uncertified fallback"}.
          Imported platform breakdown remains source provenance; entry
          replacements are not allocated to platforms.
        </p>
        <button disabled={busy || !valid || !prior}>
          Save metric correction
        </button>
      </form>
      <p aria-live="polite" aria-label="Correction result">
        {message}
      </p>
      <label htmlFor="correction-release-reason">Release reason</label>
      <input
        id="correction-release-reason"
        value={releaseReason}
        maxLength={500}
        onChange={(e) => setReleaseReason(e.target.value)}
      />
      {data.correctionState.corrections.map((c) => (
        <article key={c._id} aria-label={`Correction ${c._id}`}>
          <h3>
            {c.certified ? "Certified correction" : "Fallback"} ·{" "}
            {c.active ? "Active" : "Released or reconciled"}
          </h3>
          <p>
            Entry {c.entryId} · {c.metric} · {timestamp(c.start)} to{" "}
            {timestamp(c.end)} (exclusive)
          </p>
          <p>
            Prior {c.priorValue?.toLocaleString() ?? "Unknown"} → New{" "}
            {c.value.toLocaleString()} · {c.reason}
          </p>
          <p>
            Actor {c.actor} · {timestamp(c.at)} · source {c.source} · version{" "}
            {c.version} / revision {c.revision}
          </p>
          <p>Evidence: {c.evidence ?? "Not certified"}</p>
          {c.active ? (
            <button
              disabled={busy || !releaseReason.trim()}
              onClick={() =>
                void perform(
                  () =>
                    release({
                      campaignId: "adoption",
                      correctionId: c._id,
                      reason: releaseReason,
                      expectedRevision: data.correctionState.revision,
                      operationId: crypto.randomUUID(),
                    }),
                  "Authority released; retained imported values visible; completeness re-evaluated.",
                )
              }
            >
              Release {c.metric} authority
            </button>
          ) : null}
          <details>
            <summary>Correction and reconciliation history</summary>
            {data.correctionState.events
              .filter((e) => e.correctionId === c._id)
              .map((e) => (
                <p key={e._id}>
                  {e.action} · prior {e.priorValue ?? "Unknown"} → new{" "}
                  {e.value ?? "Unknown"} · {e.reason} · {e.actor} / {e.source} ·{" "}
                  {timestamp(e.at)} · version {e.version} / revision{" "}
                  {e.revision}
                </p>
              ))}
          </details>
        </article>
      ))}
    </section>
  );
}
