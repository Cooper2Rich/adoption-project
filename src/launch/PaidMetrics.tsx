import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference, type RegisteredQuery } from "convex/server";
import { useState } from "react";
import type { read } from "../../convex/paidMetrics.ts";
import { usePhotoToken } from "./photo-auth.tsx";
import { PaidCorrections } from "./PaidCorrections.tsx";
import { timestamp } from "./format.ts";

type Result<T> =
  T extends RegisteredQuery<"public", any, infer R> ? Awaited<R> : never;
const readApi = makeFunctionReference<
  "query",
  { campaignId: string },
  Result<typeof read>
>("paidMetrics:read");
const mapApi = makeFunctionReference<"mutation">("paidMetrics:mapPlacement"),
  revokeApi = makeFunctionReference<"mutation">("paidMetrics:revokePlacement");
const scope = { campaignId: "adoption" };
export function PaidMetrics() {
  const data = useQuery(readApi, scope),
    map = useMutation(mapApi),
    revoke = useMutation(revokeApi),
    getToken = usePhotoToken();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [enrollment, setEnrollment] = useState("");
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (error) {
      const match = String(error).match(/(?:PAID_[A-Z_]+|FORBIDDEN):[^\r\n]*/);
      setMessage(
        match?.[0] ??
          "Could not save. Check your current campaign permission and reconnect.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function run(sourceId: string, periodId: string) {
    const response = await fetch("/api/paid-metrics?action=import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getToken()}`,
      },
      body: JSON.stringify({
        ...scope,
        sourceId,
        periodId,
        operationId: crypto.randomUUID(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
  }
  return (
    <main
      className="paid-metrics preview-layout"
      aria-label="Paid metric imports"
    >
      <section className="preview-intro">
        <p className="eyebrow">Campaign operations</p>
        <h1>Paid performance</h1>
        <p>
          Inspect paid impressions and total link clicks by approved competition
          entry, source and exact reporting period.
        </p>
        <p className="tag">
          Production reporting held · actual provider validation required (#12)
        </p>
        <p>
          Imported controlled evidence cannot authorize spending, scores or
          finalization. Confirmed fundraising remains in the fundraising ledger.
        </p>
      </section>
      <section className="panel">
        <h2>Required reporting periods</h2>
        <p>
          Reporting days come from trusted placement requirements in
          America/Chicago. Every required day is shown automatically, including
          missing coverage. Broader windows use these days once; source timezone
          and competition attribution require actual provider validation.
        </p>
      </section>
      <section className="panel">
        <h2>Approved placement mappings</h2>
        <p>
          Choose a placement with explicit enrollment approval and unchanged
          creative proof. Discovery alone cannot enroll an ad or authorize
          provider changes.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              () => map({ ...scope, enrollmentId: enrollment }),
              "Placement mapping saved; source monitoring active.",
            );
          }}
        >
          <label htmlFor="paid-approved-enrollment">Approved enrollment</label>
          <select
            id="paid-approved-enrollment"
            required
            value={enrollment}
            onChange={(e) => setEnrollment(e.target.value)}
          >
            <option value="">Select an approved enrollment</option>
            {data?.enrollments.map((p) => (
              <option key={p._id} value={p._id}>
                {p.platform} · {p.account} · {p.adId} · entry {p.entryId}
              </option>
            ))}
          </select>
          <button disabled={busy || !enrollment}>Map approved placement</button>
        </form>
        {data?.mappings.map((m) => (
          <article key={m._id} className="paid-mapping">
            <h3>
              {m.platform} · {m.adId}
            </h3>
            <p>
              Competition entry {m.entryId} ·{" "}
              {m.active
                ? "Required placement"
                : "Retired for future monitoring; historical coverage retained"}
            </p>
            <p>
              Actor {m.actor} · {timestamp(m.at)} · version {m.version}
            </p>
            {m.active ? (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(
                    () => revoke({ ...scope, mappingId: m._id }),
                    "Placement retired. Historical requirements and values retained.",
                  )
                }
              >
                Retire {m.platform} placement
              </button>
            ) : null}
          </article>
        ))}
      </section>
      <p role="status">{message}</p>
      {!data ? (
        <p>Loading paid performance…</p>
      ) : (
        <>
          <PaidCorrections data={data} />
          {data.sources.map((s) => (
            <section
              className="panel"
              key={s._id}
              aria-label={`${s.provider} source health`}
            >
              <div className="panel-heading">
                <h2>
                  {s.provider} · {s.account}
                </h2>
                <strong>
                  {!s.active
                    ? "Monitoring inactive"
                    : s.outage
                      ? "Import outage"
                      : "Monitoring active"}
                </strong>
              </div>
              <p>{s.statusReason}</p>
              <p>Monitoring activated {timestamp(s.activatedAt)}</p>
              <p>
                Last successful operation:{" "}
                {s.lastSuccess === undefined
                  ? "No successful import yet"
                  : timestamp(s.lastSuccess)}
              </p>
              <p>
                Next permitted request:{" "}
                {s.retryHold ?? (s.nextAt ? timestamp(s.nextAt) : "Ready")}.
                Requests respect provider backoff; a 30-second refresh does not
                promise new measurements.
              </p>
              {data.inputs
                .filter((i) =>
                  i.period.mappingIds.some((id) =>
                    data.mappings.some(
                      (m) => m._id === id && m.sourceId === s._id,
                    ),
                  ),
                )
                .map((i) => (
                  <button
                    key={i.period._id}
                    disabled={busy || !!s.retryHold}
                    onClick={() =>
                      void perform(
                        () => run(s._id, i.period._id),
                        "Import operation recorded. Review its outcome and separate coverage below.",
                      )
                    }
                  >
                    Import {s.provider} · {i.period.label}
                  </button>
                ))}
              <p className="muted">
                Controlled evidence freshness: 15 minutes. Actual reporting
                delay and completeness contracts remain unvalidated.
              </p>
              <details>
                <summary>Import operation history</summary>
                {data.operations
                  .filter((o) => o.sourceId === s._id)
                  .map((o) => (
                    <p key={o._id}>
                      {o.state} · {o.reason} · {timestamp(o.finishedAt ?? o.at)}{" "}
                      · actor {o.actor} · generation {o.generation}
                    </p>
                  ))}
              </details>
            </section>
          ))}
          {data.inputs.map((i) => (
            <section
              className="panel"
              key={i.period._id}
              aria-label={`Period ${i.period.label}`}
            >
              <h2>{i.period.label}</h2>
              <p>
                {timestamp(i.period.start)} to {timestamp(i.period.end)}{" "}
                (exclusive)
              </p>
              {i.entries.length ? (
                i.entries.map((e) => (
                  <article key={e.entryId}>
                    <h3>Entry {e.entryId}</h3>
                    <p>
                      <strong>
                        {e.complete
                          ? "Complete controlled coverage"
                          : "Incomplete coverage"}{" "}
                        · Finalization held
                      </strong>
                    </p>
                    <p>
                      {Object.values(e.metricAuthority).some(
                        (m) => m.authorityIds.length > 0,
                      )
                        ? "Effective metrics:"
                        : "Accepted observations:"}{" "}
                      {e.impressions?.toLocaleString() ?? "Missing"} paid
                      impressions ·{" "}
                      {e.linkClicks?.toLocaleString() ?? "Missing"} total link
                      clicks. Missing scopes are excluded from these observed
                      subtotals.
                    </p>
                    {Object.values(e.metricAuthority).some(
                      (m) => m.authorityIds.length > 0,
                    ) ? (
                      <p>
                        Entry manager authority applied. {e.platformBreakdown}.{" "}
                        {Object.values(e.metricAuthority)
                          .map((m) => m.reason)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {Object.entries(e.platforms).map(([platform, v]) => (
                      <p key={platform}>
                        {platform}:{" "}
                        {v.impressions?.toLocaleString() ?? "Missing"}{" "}
                        impressions ·{" "}
                        {v.linkClicks?.toLocaleString() ?? "Missing"} link
                        clicks
                      </p>
                    ))}
                    <ul className="paid-coverage">
                      {e.coverage.map((c, index) => (
                        <li key={`${c.mappingId}:${c.metric}`}>
                          <strong>
                            {c.platform}{" "}
                            {c.metric === "linkClicks"
                              ? "total link clicks"
                              : "impressions"}
                            :{" "}
                            {c.value === null
                              ? "Missing"
                              : c.value === 0 && c.complete
                                ? "Known zero (controlled proof)"
                                : c.value.toLocaleString()}
                          </strong>
                          <p>
                            {c.complete
                              ? "Complete controlled scope"
                              : c.reason}
                          </p>
                          <details open={index === 0}>
                            <summary>Source timestamp and mapping</summary>
                            <p>
                              Latest source data-as-of:{" "}
                              {c.latestDataAsOf === null
                                ? "Unknown"
                                : timestamp(c.latestDataAsOf)}{" "}
                              · Reporting delay:{" "}
                              {c.reportingDelayMs === null
                                ? "Unknown"
                                : `${Math.floor(c.reportingDelayMs / 1000)} seconds`}
                            </p>
                            <p>
                              Retained observation data-as-of:{" "}
                              {c.dataAsOf === null
                                ? "Unknown"
                                : timestamp(c.dataAsOf)}{" "}
                              · Latest operation: {c.latestOperationState}
                            </p>
                            <p>
                              Mapping {c.mappingId} ·{" "}
                              {c.provenance ?? "No coverage evidence"}
                            </p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              ) : (
                <p>No required placements for this period.</p>
              )}
            </section>
          ))}
          <section className="panel">
            <h2>Source and mapping history</h2>
            <details>
              <summary>{data.audit.length} audit records</summary>
              {data.audit.map((a) => (
                <p key={a._id}>
                  {a.action} · {a.actor} / {a.source} · {timestamp(a.at)} ·
                  version {a.version} · {a.evidence}
                </p>
              ))}
            </details>
            <p>{data.gate}</p>
          </section>
        </>
      )}
    </main>
  );
}
