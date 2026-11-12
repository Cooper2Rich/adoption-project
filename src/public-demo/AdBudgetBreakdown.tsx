import type { adBudgetBreakdown } from "./ad-budget.ts";
import { platformNames } from "./ad-platforms.ts";
import { money } from "./catalog.ts";

export function AdBudgetBreakdown({
  report,
  includeSamples,
}: {
  report: ReturnType<typeof adBudgetBreakdown>;
  includeSamples: boolean;
}) {
  const unassigned = report.unassigned.meta + report.unassigned.tiktok;
  return (
    <section className="ad-budget-breakdown" aria-labelledby="ad-budget-title">
      <h3 id="ad-budget-title">Ad budget breakdown</h3>
      <p className="ad-platform-help">
        Calculated equal shares of each platform’s campaign budget among
        currently eligible ads.{" "}
        {includeSamples
          ? "Spent includes completed sample history."
          : "Sample spending is excluded."}{" "}
        Totals include unassigned budget below; left can be negative when an ad
        has exceeded its allocation.
      </p>
      <div className="ad-budget-grid">
        {report.rows.map((row) => (
          <article
            className="ad-budget-card"
            key={row.adId}
            data-ad-id={row.adId}
            aria-label={`Budget for ${row.title}`}
          >
            <div className="ad-budget-card-heading">
              <h4>{row.title}</h4>
              <span className="ad-platform-state">
                {row.historyOnly
                  ? "Historical · sample"
                  : row.eligiblePlatforms.length
                    ? `Eligible: ${row.eligiblePlatforms.map((platform) => platformNames[platform]).join(", ")}`
                    : "No new allocation"}
              </span>
            </div>
            <dl className="ad-budget-totals">
              <div>
                <dt>Allocated</dt>
                <dd>{money(row.totals.allocatedCents)}</dd>
              </div>
              <div>
                <dt>Spent{includeSamples ? " · sample" : ""}</dt>
                <dd>{money(row.totals.spentCents)}</dd>
              </div>
              <div>
                <dt>Left</dt>
                <dd
                  className={
                    row.totals.remainingCents < 0
                      ? "budget-over"
                      : "budget-left"
                  }
                >
                  {money(row.totals.remainingCents)}
                </dd>
              </div>
            </dl>
            <div className="ad-platform-table">
              <table>
                <caption className="sr-only">
                  Platform budgets for {row.title}
                </caption>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Allocated</th>
                    <th>Spent</th>
                    <th>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {(["meta", "tiktok"] as const).map((platform) => {
                    const amounts = row.platforms[platform];
                    return (
                      <tr key={platform}>
                        <th scope="row">{platformNames[platform]}</th>
                        <td>{money(amounts.allocatedCents)}</td>
                        <td>{money(amounts.spentCents)}</td>
                        <td
                          className={
                            amounts.remainingCents < 0
                              ? "budget-over"
                              : "budget-left"
                          }
                        >
                          {money(amounts.remainingCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
      {!report.rows.length && (
        <p className="ad-platform-help">
          No ads in this campaign yet. Its budget remains unassigned until
          eligible creatives are available.
        </p>
      )}
      {unassigned > 0 && (
        <div className="ad-budget-unassigned">
          <strong>Unassigned budget: {money(unassigned)}</strong>
          <span>
            Meta {money(report.unassigned.meta)} · TikTok{" "}
            {money(report.unassigned.tiktok)}
          </span>
          <p>
            No eligible ad is available for these platform shares. This budget
            is included in the campaign totals.
          </p>
        </div>
      )}
    </section>
  );
}
