import { useConvex, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useEffect, useState } from "react";
import type { StandingsResult } from "../../convex/standings.ts";
import type {
  PeriodKind,
  competitionPeriods,
} from "../../convex/competitionPolicy.ts";

const periodsRef = makeFunctionReference<
  "query",
  { kind: PeriodKind },
  ReturnType<typeof competitionPeriods>
>("standings:periods");
const readRef = makeFunctionReference<
  "query",
  { kind: PeriodKind; period: string },
  StandingsResult
>("standings:read");
const refreshRef = makeFunctionReference<
  "mutation",
  { campaignId: string; kind: PeriodKind; period: string; operationId: string }
>("standings:refresh");
const historyRef = makeFunctionReference<
  "query",
  { campaignId: string },
  {
    _id: string;
    at: number;
    actor: string;
    source: string;
    version: number;
    period: string;
    kind: PeriodKind;
    outcome: string;
  }[]
>("standings:history");
type Result = StandingsResult;
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const time = (at: number | null) =>
  at === null
    ? "Not available"
    : new Date(at).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        timeZoneName: "short",
      });

export function Standings({ manager = false }: { manager?: boolean }) {
  const [kind, setKind] = useState<PeriodKind>("daily"),
    [selected, setSelected] = useState("");
  const periods = useQuery(periodsRef, { kind });
  const period =
    periods?.find((p) => p.label === selected)?.label ??
    periods?.find((p) => p.start <= Date.now() && p.end > Date.now())?.label ??
    periods?.at(-1)?.label;
  return (
    <section
      className="panel standings"
      aria-label={manager ? "Standings workspace" : "Public standings"}
    >
      <p className="eyebrow">adoption.is · Competition</p>
      <h1>
        {manager ? "Publish provisional standings" : "Competition standings"}
      </h1>
      <p>
        Each ad competes independently. Multiple ads and repeated daily and
        weekly wins are allowed.
      </p>
      <div className="standings-controls">
        <label>
          Standings frequency
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PeriodKind);
              setSelected("");
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <label>
          Chicago period
          <select
            value={period ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {periods?.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
                {p.prizeEligible ? "" : " · Partial, no prize"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {period ? (
        manager ? (
          <ManagerPeriod
            key={`${kind}-${period}`}
            kind={kind}
            period={period}
          />
        ) : (
          <PublicPeriod key={`${kind}-${period}`} kind={kind} period={period} />
        )
      ) : (
        <p role="status">
          {periods === undefined
            ? "Loading periods…"
            : "Competition periods are not available yet."}
        </p>
      )}
    </section>
  );
}
function PublicPeriod({ kind, period }: { kind: PeriodKind; period: string }) {
  const convex = useConvex(),
    [result, setResult] = useState<Result | undefined>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const update = async () => {
      const request = ++generation;
      try {
        const value = await convex.query(readRef, { kind, period });
        if (active && generation === request) {
          setResult(value);
          setFailed(false);
        }
      } catch {
        if (active && generation === request) setFailed(true);
      }
    };
    void update();
    const interval = setInterval(() => {
      void update();
    }, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [convex, kind, period]);
  return (
    <>
      <p>
        Stored results refresh every 30 seconds. Provider imports follow their
        own reporting delays and rate limits.
      </p>
      <Results result={result} failed={failed} />
    </>
  );
}
function ManagerPeriod({ kind, period }: { kind: PeriodKind; period: string }) {
  const result = useQuery(readRef, { kind, period }),
    refresh = useMutation(refreshRef),
    history = useQuery(historyRef, { campaignId: "adoption" });
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  return (
    <>
      <p>
        Build a stored result from current trusted inputs. Missing evidence
        retains the previous result. Publication records your identity and input
        revision; it does not award or pay a prize.
      </p>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage("");
          try {
            const r = await refresh({
              campaignId: "adoption",
              kind,
              period,
              operationId,
            });
            setMessage(`Refresh ${r.outcome}.`);
            setOperationId(crypto.randomUUID());
          } catch (e) {
            setMessage(
              e instanceof Error
                ? e.message
                : "Refresh failed. Retry the same operation.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Publishing…" : "Publish stored provisional results"}
      </button>
      {message && <p role="status">{message}</p>}
      <Results result={result} />
      <h2>Refresh history</h2>
      <ul>
        {history
          ?.slice(-5)
          .reverse()
          .map((r) => (
            <li key={r._id}>
              {r.kind} {r.period}: {r.outcome} · {r.actor} · {time(r.at)} ·{" "}
              {r.source} v{r.version}
            </li>
          ))}
      </ul>
    </>
  );
}
function Results({
  result,
  failed = false,
}: {
  result: Result | undefined;
  failed?: boolean;
}) {
  if (result === undefined)
    return (
      <p role="status">
        {failed
          ? "Some results are delayed. Reconnecting…"
          : "Loading standings…"}
      </p>
    );
  if (!result) return <p role="status">Standings unavailable.</p>;
  return (
    <>
      <h2>
        {result.kind === "daily" ? "Daily" : "Weekly"} · {result.period.label}
      </h2>
      <p>
        <strong>Provisional</strong> ·{" "}
        {result.period.prizeEligible
          ? "Full competition period"
          : "Partial period: no prize. Eligible fundraising commission is preserved."}
      </p>
      {(result.delayed || failed) && (
        <p role="status">
          <strong>Some results are delayed</strong>
          {result.updatedAt
            ? ". Showing last-known results."
            : ". No complete stored result yet."}
        </p>
      )}
      <p>
        Results updated: <time>{time(result.updatedAt)}</time>
      </p>
      <p>
        Last successful import: {time(result.freshness.lastSuccessfulImport)}
        <br />
        Source data as of: {time(result.freshness.dataAsOf)}
        <br />
        Reporting delay:{" "}
        {result.freshness.reportingDelayMs === null
          ? "Unknown"
          : `${Math.ceil(result.freshness.reportingDelayMs / 60000)} minutes`}
      </p>
      <p>
        Score: 40 × √min(impressions / target, 1) + 30 × √min(total link clicks
        / target, 1) + 30 × √min(fundraising dollars / target, 1). Maximum 100.
      </p>
      <p>
        Selected targets: {result.targets.impressions} impressions ·{" "}
        {result.targets.totalClicks} link clicks ·{" "}
        {money(result.targets.fundraisingCents)} fundraising.
      </p>
      <p>
        Ranks use unrounded scores, then total link clicks, fundraising and
        impressions. Exact ties share rank and split one fixed prize in whole
        cents.
      </p>
      {result.rows.length ? (
        <ol className="standings-rows">
          {result.rows.map((row) => (
            <li
              key={row.entryId}
              className="standings-row"
              aria-label={`Rank ${row.rank} ${row.title}`}
            >
              <strong>
                Rank {row.rank} ·{" "}
                <a href={`/entries/${row.entryId}`}>{row.title}</a>
              </strong>
              <p>
                By {row.creator} · Score {row.score.toFixed(2)}
              </p>
              <p>
                {row.impressions} impressions · {row.linkClicks} link clicks ·{" "}
                {money(row.fundraisingCents)} fundraising
              </p>
              {row.rank === 1 && result.period.prizeEligible && (
                <p>
                  Proposed share: {money(row.proposedPrizeCents)} of one{" "}
                  {money(result.fixedPrizeCents ?? 0)} fixed prize · Not awarded
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>No public ranked ads available.</p>
      )}
      <p>{result.evidence}</p>
    </>
  );
}
