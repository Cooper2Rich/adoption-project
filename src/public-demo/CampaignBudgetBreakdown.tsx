import { PieChart } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useWorkspace } from "../context.tsx";
import { adBudgetBreakdown } from "./ad-budget.ts";
import "./ad-platforms.css";
import {
  platformNames,
  type AdSpendRules,
  type CampaignAdSetup,
} from "./ad-platforms.ts";
import { AdBudgetBreakdown } from "./AdBudgetBreakdown.tsx";
import { campaignBudgetBreakdown } from "./campaign-budget.ts";
import { money } from "./catalog.ts";
import { completedAdSpendReport } from "./completed-ad-spend.ts";
import { useFinancialSamples } from "./FinancialSamples.tsx";

export function CampaignBudgetPanel() {
  const { access, role, campaignScope } = useWorkspace();
  const [loaded, setLoaded] = useState<{
    id: string;
    setup?: CampaignAdSetup;
    error?: string;
  }>();
  useEffect(() => {
    if (role !== "admin" || !campaignScope) return;
    let current = true;
    const id = campaignScope.id;
    void api<CampaignAdSetup>(
      `/management/campaigns/${id}/ad-platforms`,
      access,
    )
      .then((setup) => {
        if (current) setLoaded({ id, setup });
      })
      .catch(() => {
        if (current)
          setLoaded({
            id,
            error:
              "Budget breakdown could not load. Open Manage ad platforms to review the campaign settings.",
          });
      });
    return () => {
      current = false;
    };
  }, [access, role, campaignScope?.id, campaignScope?.status]);
  if (role !== "admin" || !campaignScope) return null;
  const data = loaded?.id === campaignScope.id ? loaded : undefined;
  return data?.setup ? (
    <CampaignBudgetBreakdown
      rules={data.setup.rules}
      connections={data.setup.connections}
    />
  ) : (
    <p>{data?.error || "Loading campaign budget…"}</p>
  );
}

export function CampaignBudgetBreakdown({
  rules,
  connections,
}: {
  rules: AdSpendRules;
  connections?: CampaignAdSetup["connections"];
}) {
  const { projects, posts } = useWorkspace();
  const { enabled } = useFinancialSamples();
  const spent = completedAdSpendReport(projects, enabled);
  const report = campaignBudgetBreakdown(rules, spent.byPlatform);
  const ads = adBudgetBreakdown(
    rules,
    projects,
    posts,
    spent.rows,
    connections,
  );
  return (
    <section
      className="ad-platform-panel campaign-budget-breakdown"
      aria-labelledby="campaign-budget-title"
    >
      <div className="ad-platform-section-heading">
        <PieChart size={20} />
        <div>
          <h2 id="campaign-budget-title">Campaign budget breakdown</h2>
          <p>Saved campaign budget allocated across Meta and TikTok.</p>
        </div>
        <span className="ad-platform-state">
          {enabled ? "Includes sample spend" : "Samples hidden"}
        </span>
      </div>
      <div className="ad-platform-summary">
        <div>
          <small>Total allocated</small>
          <strong>{money(report.allocatedCents)}</strong>
        </div>
        <div>
          <small>
            {enabled ? "Spent · sample" : "Spent · samples excluded"}
          </small>
          <strong>{money(report.spentCents)}</strong>
        </div>
        <div>
          <small>Budget left</small>
          <strong
            className={
              report.remainingCents < 0 ? "budget-over" : "budget-left"
            }
          >
            {money(report.remainingCents)}
          </strong>
        </div>
      </div>
      <div className="campaign-budget-platforms">
        {report.rows.map((row) => {
          const usedPercent = row.allocatedCents
            ? (row.spentCents / row.allocatedCents) * 100
            : row.spentCents
              ? 100
              : 0;
          return (
            <section
              className="campaign-budget-platform"
              key={row.platform}
              aria-label={`${platformNames[row.platform]} budget`}
            >
              <div className="campaign-budget-platform-heading">
                <h3>{platformNames[row.platform]}</h3>
                <span>
                  {row.platform === "meta"
                    ? rules.metaPercent
                    : 100 - rules.metaPercent}
                  % allocated
                </span>
              </div>
              <dl>
                <div>
                  <dt>Allocated</dt>
                  <dd>{money(row.allocatedCents)}</dd>
                </div>
                <div>
                  <dt>Spent{enabled ? " · sample" : ""}</dt>
                  <dd>{money(row.spentCents)}</dd>
                </div>
                <div>
                  <dt>Left</dt>
                  <dd
                    className={
                      row.remainingCents < 0 ? "budget-over" : "budget-left"
                    }
                  >
                    {money(row.remainingCents)}
                  </dd>
                </div>
              </dl>
              <div
                className={`campaign-budget-meter ${row.remainingCents < 0 ? "over" : ""}`}
                role="meter"
                aria-label={`${platformNames[row.platform]} allocated budget used`}
                aria-valuemin={0}
                aria-valuemax={row.allocatedCents || 1}
                aria-valuenow={Math.min(
                  row.spentCents,
                  row.allocatedCents || 1,
                )}
                aria-valuetext={`${money(row.spentCents)} spent of ${money(row.allocatedCents)} allocated`}
              >
                <span style={{ width: `${Math.min(usedPercent, 100)}%` }} />
              </div>
              {row.remainingCents < 0 && (
                <p className="budget-over">
                  Over allocation by {money(-row.remainingCents)}. Adjust the
                  saved cap or platform split.
                </p>
              )}
            </section>
          );
        })}
      </div>
      <p className="ad-platform-help">
        Left = allocated − spent. Negative amounts show an overrun; unused
        platform budgets are not transferred automatically.{" "}
        {enabled
          ? "Completed sample history is included."
          : "Sample history is excluded from these figures."}{" "}
        No live provider balance or spending is connected.
      </p>
      <AdBudgetBreakdown report={ads} includeSamples={enabled} />
    </section>
  );
}
