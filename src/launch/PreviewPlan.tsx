import type { SavedPreview } from "./api.ts";
import { money, timestamp } from "./format.ts";

export function PreviewPlan({ record }: { record: SavedPreview }) {
  const result = record.result;
  const totalAds = new Set(record.input.entries.map((entry) => entry.id)).size;
  return (
    <section className="panel plan-panel" aria-labelledby="plan-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Saved allocation</p>
          <h2 id="plan-title">
            {result.status === "blocked"
              ? "Funding plan blocked"
              : result.status === "boosts-held"
                ? "Baseline protected. Boosts held."
                : "Allocation preview ready"}
          </h2>
          <p className="field-help">
            Total ads: <strong>{totalAds}</strong>
          </p>
        </div>
        <span className={`tag ${result.status}`}>
          {result.status === "ready" ? "Ready to review" : "Needs attention"}
        </span>
      </div>
      {!!result.reasons.length && (
        <div className="plan-reasons" role="note">
          {result.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      <div className="allocation-totals">
        <div>
          <span>Baseline</span>
          <strong data-testid="baseline-total">
            {money(result.baselineCents)}
          </strong>
        </div>
        <div>
          <span>Boost pool</span>
          <strong data-testid="boost-total">{money(result.boostCents)}</strong>
        </div>
        <div>
          <span>Uncommitted headroom</span>
          <strong data-testid="uncommitted-total">
            {money(result.uncommittedCents)}
          </strong>
        </div>
      </div>
      {!!result.targets.length && (
        <>
          <div className="table-scroll">
            <table>
              <caption>
                Per-entry allocation · {result.day} · America/Chicago
              </caption>
              <thead>
                <tr>
                  <th scope="col">Entry</th>
                  <th scope="col">Baseline</th>
                  <th scope="col">Boost</th>
                  <th scope="col">Meta</th>
                  <th scope="col">TikTok</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.targets.map((row) => (
                  <tr key={row.entryId}>
                    <th scope="row">
                      Entry {row.entryId.toUpperCase()}
                      <small>
                        {row.score === null
                          ? "Score unavailable"
                          : `Score ${row.score.toFixed(2)}`}
                      </small>
                    </th>
                    <td>{money(row.baselineCents)}</td>
                    <td>{money(row.boostCents)}</td>
                    <td>
                      {money(row.metaCents)}
                      {row.heldMetaCents > 0 && (
                        <small className="held">Held</small>
                      )}
                    </td>
                    <td>
                      {money(row.tiktokCents)}
                      {row.heldTiktokCents > 0 && (
                        <small className="held">Held</small>
                      )}
                    </td>
                    <td>
                      <strong>
                        {money(row.baselineCents + row.boostCents)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-help">
            {result.occupiedSlots} occupied slots · {result.eligibleEntries}{" "}
            eligible funded entries · {result.selectedCount} boosted entries,
            including full cutoff ties. Held provider shares are not
            redistributed.
          </p>
        </>
      )}
      <dl className="plan-provenance">
        <div>
          <dt>Evidence source</dt>
          <dd>{record.input.finance.source}</dd>
        </div>
        <div>
          <dt>Financial evidence</dt>
          <dd>
            {record.input.finance.status} ·{" "}
            {timestamp(record.input.finance.asOf)}
          </dd>
        </div>
        <div>
          <dt>Authority / safety versions</dt>
          <dd>
            {record.input.authority.revision} /{" "}
            {record.input.finance.safety?.revision ?? "Not configured"}
          </dd>
        </div>
        <div>
          <dt>Saved by</dt>
          <dd>
            {record.actor} · {timestamp(record.createdAt)}
          </dd>
        </div>
      </dl>
      <p className="advisory-footer">
        Saved as an advisory record. No funds or ad slots reserved.
      </p>
    </section>
  );
}
