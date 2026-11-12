import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { dateLabel } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { loadAds, money, viewerState, type PublicAd } from "./catalog.ts";
import {
  FinancialSampleControl,
  useFinancialSamples,
} from "./FinancialSamples.tsx";
import { campaignFundingReport } from "./funding-report.ts";

export function AdminFunding() {
  const {
    role,
    managedCampaigns = [],
    projects,
    posts,
    search,
    sampleFinancials,
  } = useWorkspace();
  const { enabled } = useFinancialSamples();
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("growth");
  useEffect(() => {
    void loadAds()
      .then(setAds)
      .catch((e) => setError(e.message));
  }, []);
  if (role !== "admin") return <Navigate to="/projects" replace />;
  const support = [
    ...(enabled ? sampleFinancials?.contributions || [] : []),
    ...viewerState().support,
  ].map((s) => ({
    ...s,
    projectId: s.projectId || posts.find((p) => p.id === s.adId)?.projectId,
  }));
  const rows = campaignFundingReport(
    managedCampaigns,
    projects,
    ads,
    support,
    new Date(),
    enabled ? sampleFinancials?.payments || [] : [],
  );
  const totals = rows.reduce(
    (sum, row) => ({
      gross: sum.gross + row.grossCents,
      creator: sum.creator + row.creatorCents,
      nonprofit: sum.nonprofit + row.beneficiaryCents,
      fee: sum.fee + row.appUseFeeCents,
      legacy: sum.legacy + row.legacyCents,
      appPaid: sum.appPaid + row.appPaidCents,
      appOutstanding: sum.appOutstanding + row.appOutstandingCents,
    }),
    {
      gross: 0,
      creator: 0,
      nonprofit: 0,
      fee: 0,
      legacy: 0,
      appPaid: 0,
      appOutstanding: 0,
    },
  );
  const assigned = rows.reduce((sum, row) => sum + row.grossCents, 0);
  const unassigned =
    support.reduce((sum, s) => sum + s.amountCents, 0) - assigned;
  const visible = rows
    .filter((row) =>
      `${row.campaign.name} ${row.campaign.ownerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === "app-fees"
          ? b.appUseFeeCents - a.appUseFeeCents
          : sort === "nonprofit"
            ? b.beneficiaryCents - a.beneficiaryCents
            : sort === "funding"
              ? b.grossCents - a.grossCents
              : (b.growthCents ?? -Infinity) - (a.growthCents ?? -Infinity)) ||
        a.campaign.name.localeCompare(b.campaign.name),
    );
  return (
    <section className="admin-funding">
      <div className="page-heading">
        <div>
          <h1>Funding.</h1>
          <p>
            Compare campaign growth, creator allocations and application
            payments.
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <FinancialSampleControl />
      <div className="funding-summary">
        {[
          { label: "Ad funds", amount: totals.gross + unassigned },
          { label: "Creator allocations · 10%", amount: totals.creator },
          { label: "Nonprofit allocations · 85%", amount: totals.nonprofit },
          { label: "Application fees accrued · 5%", amount: totals.fee },
        ].map(({ label, amount }) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{money(amount)}</strong>
            {label === "Application fees accrued · 5%" && (
              <small>
                Paid: {money(totals.appPaid)} · Outstanding:{" "}
                {money(totals.appOutstanding)}
              </small>
            )}
          </div>
        ))}
      </div>
      <p className="metrics-note">
        Allocations are recorded for new ad-fund contributions and rounded per
        contribution. Application fees accrue at 5%. Sample payments are
        fictional; saved contributions have no completed transfers. Project
        setup pricing remains pending.
      </p>
      {(totals.legacy > 0 || unassigned > 0) && (
        <p className="info-banner">
          Historical funds retain their original records: {money(totals.legacy)}{" "}
          without a new split.{" "}
          {unassigned > 0 &&
            `${money(unassigned)} cannot be assigned to a campaign from the retained evidence.`}{" "}
          No historical allocations have been invented.
        </p>
      )}
      <div className="section-toolbar">
        <div>
          <h2 id="campaign-performance">Campaign performance</h2>
          <p className="metrics-note">
            Growth compares today’s funds raised with yesterday, UTC.
            Performance figures are illustrative sample metrics; ad-fund
            allocations below use saved contributions.
          </p>
        </div>
        <select
          aria-label="Sort campaign funding"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="growth">Fastest growth · funds raised</option>
          <option value="funding">Most ad funds</option>
          <option value="nonprofit">Highest nonprofit allocation</option>
          <option value="app-fees">Highest application fees</option>
        </select>
      </div>
      <div className="funding-campaign-list">
        {visible.map((row) => (
          <article className="funding-campaign" key={row.campaign.id}>
            <header>
              <Link to={`/campaigns/${row.campaign.id}`}>
                <h3>{row.campaign.name} ↗</h3>
                <small>{row.campaign.ownerName}</small>
              </Link>
              <span className="count-pill">
                {row.campaign.status === "archived"
                  ? "Archived"
                  : row.campaign.status === "active"
                    ? "Open"
                    : "Draft"}
              </span>
            </header>
            <dl className="funding-metrics">
              <div>
                <dt>Raised today · sample</dt>
                <dd>
                  {row.currentRaised === null
                    ? "N/A"
                    : money(row.currentRaised)}
                </dd>
              </div>
              <div>
                <dt>Daily growth · sample</dt>
                <dd>
                  {row.growthCents === null
                    ? "N/A"
                    : `${row.growthCents >= 0 ? "+" : ""}${money(row.growthCents)}`}
                </dd>
                <small>
                  {row.growthPercent === null
                    ? row.currentRaised === null
                      ? "No comparable evidence"
                      : row.currentRaised > 0
                        ? "New activity"
                        : "No change"
                    : `${row.growthPercent.toFixed(1)}% vs yesterday`}
                </small>
              </div>
              <div>
                <dt>Ad funds received</dt>
                <dd>{money(row.grossCents)}</dd>
              </div>
              <div>
                <dt>Creator allocated</dt>
                <dd>{money(row.creatorCents)}</dd>
              </div>
              <div>
                <dt>Nonprofit allocated</dt>
                <dd>{money(row.beneficiaryCents)}</dd>
              </div>
              <div>
                <dt>Application fees accrued</dt>
                <dd>{money(row.appUseFeeCents)}</dd>
              </div>
              <div>
                <dt>Paid to application</dt>
                <dd>{money(row.appPaidCents)}</dd>
                <small>Outstanding: {money(row.appOutstandingCents)}</small>
              </div>
            </dl>
            {row.legacyCents > 0 && (
              <p className="metrics-note">
                Includes {money(row.legacyCents)} in historical funding with its
                allocation unchanged.
              </p>
            )}
          </article>
        ))}
      </div>
      {!visible.length && <p>No campaigns match your search.</p>}
      {enabled && visible.some((row) => row.appPayments.length > 0) && (
        <section className="sample-payment-history">
          <h2 className="earnings-section-title">
            Sample application payment history
          </h2>
          <div className="earnings-list">
            {visible.flatMap((row) =>
              row.appPayments.map((payment) => (
                <article className="earnings-row" key={payment.id}>
                  <div>
                    <h3>{row.campaign.name}</h3>
                    <p>
                      {dateLabel(payment.at)} · Completed · fictional
                      application payment
                    </p>
                  </div>
                  <strong>{money(payment.amountCents)}</strong>
                </article>
              )),
            )}
          </div>
        </section>
      )}
    </section>
  );
}
