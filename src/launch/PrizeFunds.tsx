import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useState } from "react";
import type { inspectPrize } from "../../convex/prizeFunds.ts";

type Projection = Awaited<ReturnType<typeof inspectPrize>>;
const inspectRef = makeFunctionReference<
  "query",
  { campaignId: string },
  Projection
>("prizeFunds:inspect");
const retryRef = makeFunctionReference<
  "mutation",
  { campaignId: string; occurrenceId: string }
>("prizeFunds:retry");
const money = (n: number | null) =>
  n === null
    ? "Unknown"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n / 100);
const date = (at: number | null | undefined) =>
  at == null
    ? "Unavailable"
    : new Date(at).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        timeZoneName: "short",
      });
export function PrizeFunds() {
  const data = useQuery(inspectRef, { campaignId: "adoption" }),
    retry = useMutation(retryRef);
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  if (!data)
    return (
      <main className="setup-message" role="status">
        Loading protected prize funds…
      </main>
    );
  const b = data.balances;
  async function recheck(id: string) {
    setBusy(id);
    setError(null);
    try {
      await retry({ campaignId: "adoption", occurrenceId: id });
    } catch {
      setError(
        "Recheck unavailable. Reconnect with current campaign manager access and retry.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="preview-layout">
      <section className="panel prize-funds" aria-label="Protected prize funds">
        <p className="eyebrow">adoption.is · Campaign manager</p>
        <h1>Protected prize funds</h1>
        <p>
          Separate purposes preserve creator earnings and advertising
          obligations. Fixed replenishment moves fundraising funds into the
          prize fund; it does not award or pay a prize.
        </p>
        <p role="status">
          {data.covered
            ? "Full promised prize schedule covered"
            : "Paid competition held: " + data.coverageReason}
        </p>
        <p>
          Actual financial transfer authority: held pending validated account
          and route approval.{" "}
          {data.synthetic
            ? "Controlled, unvalidated evidence."
            : "Production dispatch unavailable."}
        </p>
        <dl className="rules-summary">
          <dt>Fundraising purpose cash</dt>
          <dd>{money(b.fundraisingCents)}</dd>
          <dt>Reserved creator earnings</dt>
          <dd>{money(b.reservedCreatorCents)}</dd>
          <dt>Unreflected fundraising refund holds</dt>
          <dd>{money(b.refundHoldCents)}</dd>
          <dt>Current pending refund principal</dt>
          <dd>{money(b.requiredRefundCents)}</dd>
          <dt>Unsettled / unreflected source reservations</dt>
          <dd>{money(b.reservedSourceCents)}</dd>
          <dt>Available for fixed replenishment</dt>
          <dd>{money(b.availableCents)}</dd>
          <dt>Settled prize fund</dt>
          <dd>{money(b.prizeCents)}</dd>
          <dt>Full promised daily and weekly prizes</dt>
          <dd>
            {money(data.requiredCents)} · {data.periods.length} complete Chicago
            periods
          </dd>
          <dt>Advertising purpose cash</dt>
          <dd>{money(b.advertisingCents)}</dd>
          <dt>Protected advertising obligations</dt>
          <dd>{money(b.advertisingObligationsCents)}</dd>
        </dl>
        <p>
          Purpose evidence observed {date(data.evidence?.input.observedAt)};
          expires {date(data.evidence?.input.expiresAt)}. Unknown and negative
          availability remain held. Future replenishment is excluded from
          promised coverage.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <h2>Fixed weekly replenishment</h2>
        <p>
          Advance check is exactly 24 elapsed hours before execution. Execution
          checks current funds again; shortages transfer nothing and retry
          hourly.
        </p>
        {data.occurrences.length ? (
          data.occurrences.map((o) => (
            <article className="panel" key={o._id}>
              <h3>
                {o.local} America/Chicago · {money(o.amountCents)}
              </h3>
              <p>
                <strong>{o.state}</strong> · {o.reason}
              </p>
              <p>
                Advance due {date(o.advanceAt)}; checked{" "}
                {date(o.advanceCheckedAt)}. Execution {date(o.executionAt)}.
                Next check {date(o.nextAt)}.
              </p>
              <p>
                Last available{" "}
                {money(o.availableCents ?? o.advanceAvailableCents ?? null)}.
              </p>
              {o.state !== "fulfilled" ? (
                <button
                  disabled={busy !== null}
                  onClick={() => void recheck(o._id)}
                >
                  {busy === o._id ? "Requesting…" : "Recheck same obligation"}
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p>Locked campaign schedule is not available.</p>
        )}
        <h2>Transfer settlement history</h2>
        {data.transfers.length ? (
          data.transfers.map((t) => (
            <article className="panel" key={t._id}>
              <h3>
                {money(t.amountCents)} · {t.state}
              </h3>
              <p>
                {t.account} · {t.route} · {t.sourcePurpose} →{" "}
                {t.destinationPurpose}
              </p>
              <p>
                Manager {t.manager} · {t.source} · version {t.version} ·{" "}
                {date(t.at)}
              </p>
              <p>
                Settlement {t.settlementReference ?? "unconfirmed"}.{" "}
                {t.conflict ? "Conflicting settlement evidence held." : ""}
              </p>
            </article>
          ))
        ) : (
          <p>No transfer dispatched.</p>
        )}
        <details>
          <summary>Promised prize periods</summary>
          {data.periods.map((p) => (
            <p key={p.kind + p.period}>
              {p.kind} {p.period} · {money(p.cents)}
            </p>
          ))}
        </details>
        <details>
          <summary>Settlement observations</summary>
          {data.observations.map((o) => (
            <p key={o._id}>
              {o.outcome} · generation {o.generation} · {o.source} ·{" "}
              {date(o.at)} · {o.settlementReference ?? "unconfirmed"}
            </p>
          ))}
        </details>
        <details>
          <summary>Audit history</summary>
          {data.audit.map((a) => (
            <p key={a._id}>
              {a.action} · {a.actor} · {a.source} · version {a.version} ·{" "}
              {date(a.at)} · {a.evidence}
            </p>
          ))}
        </details>
      </section>
    </main>
  );
}
