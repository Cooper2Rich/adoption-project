import { requireProject } from "./access.ts";
import { rows, scopedCreator } from "./analytics-common.ts";
import { giftEvidence } from "./analytics-gifts.ts";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";

export const ratio = (numerator: any, denominator: any, scale: any = 1) =>
  numerator === null || denominator === null || denominator <= 0
    ? null
    : (numerator / denominator) * scale;
export function economicsReport(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  evidenceId: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  requireProject(state, campaignId, access);
  const evidence = records.get("metric_evidence", evidenceId);
  if (!evidence || evidence.campaignId !== campaignId)
    throw new AppError("Metric evidence unavailable.", 404);
  scopedCreator(access, evidence.creatorId);
  const basis = evidence.basis,
    ids = new Set(evidence.distributionIds);
  const financial = giftEvidence(
    records,
    campaignId,
    basis,
    evidence.creatorId,
    at,
    evidence.distributionIds,
  );
  const costsByPayer: any[] = [];
  for (const op of rows(records, "finance_operations", campaignId)) {
    if (
      op.kind !== "media_spend" ||
      !ids.has(op.distributionId) ||
      op.effectiveAt < basis.startsAt ||
      op.effectiveAt >= basis.endsAt ||
      op.recordedAt > at
    )
      continue;
    const amountCents =
      (op.spentMediaCents || 0) + (op.creatorMediaCostCents || 0);
    costsByPayer.push({
      operationId: op.id,
      sourceRecordId: op.sourceRecordId,
      payer: op.payer,
      payerId: op.payerId,
      amountCents,
    });
  }
  const spendCents = costsByPayer.reduce(
    (n: any, c: any) => n + c.amountCents,
    0,
  );
  const creatorExpenseCents = costsByPayer
    .filter(
      (c: any) => c.payer === "creator" && c.payerId === evidence.creatorId,
    )
    .reduce((n: any, c: any) => n + c.amountCents, 0);
  if (![spendCents, creatorExpenseCents].every(Number.isSafeInteger))
    throw new AppError("Costs exceed safe integer bounds.");
  let firstPartyRedirectClicks = 0;
  for (const c of rows(records, "tracking_clicks", campaignId, basis.endsAt))
    if (
      ids.has(c.distributionId) &&
      c.effectiveAt >= basis.startsAt &&
      c.effectiveAt < basis.endsAt
    )
      firstPartyRedirectClicks++;
  const n = evidence.counts,
    complete = evidence.coverage === "complete",
    reconciled =
      evidence.financialCoverage === "complete" &&
      !financial.reasons.length &&
      !records.pendingCount(campaignId);
  const clicks = complete ? n.validOutboundClicks : null,
    impressions = complete ? n.validImpressions : null;
  return {
    campaignId,
    creatorId: evidence.creatorId,
    basis,
    evidenceId,
    coverage: evidence.coverage,
    correctionLineage: {
      supersedesId: evidence.supersedesId,
      correctionReason: evidence.correctionReason,
    },
    metrics: {
      impressions: n.validImpressions,
      outboundClicks: n.validOutboundClicks,
      allClicks: n.allClicks,
      views: n.validViews,
      firstPartyRedirectClicks,
      eligibleLandingVisits: n.eligibleLandingVisits,
      outboundCTR: ratio(clicks, impressions),
      cpcCents: ratio(spendCents, clicks),
      cpmCents: ratio(spendCents, impressions, 1000),
      donationConversionRate: ratio(
        reconciled ? financial.eligibleSettledGiftCount : null,
        complete ? n.eligibleLandingVisits : null,
      ),
      acquisitionCostCents: ratio(
        spendCents,
        reconciled ? financial.eligibleSettledGiftCount : null,
      ),
    },
    finances: {
      ...financial,
      actualMediaSpendCents: spendCents,
      costsByPayer,
      creatorExpenseCents,
      creatorNetBeforeOtherCostsCents:
        financial.creditedCommissionCents - creatorExpenseCents,
      campaignFundedMediaSpendCents: spendCents - creatorExpenseCents,
      fees: { status: "unknown", amountCents: null },
      seedAndAppUseAllocations:
        access.role === "creator"
          ? null
          : ((t: any) => ({
              seedGuaranteeCents: t.seedGuaranteeCents,
              seedAppUseCents: t.seedAppUseCents,
              mediaCents: t.mediaCents,
            }))(records.financeTotals(campaignId)),
      creatorCommissionPerOwnAdCost: ratio(
        financial.creditedCommissionCents,
        creatorExpenseCents,
      ),
      beneficiaryBeforeFeesPerCampaignAdCost: ratio(
        financial.beneficiaryBeforeFeesCents,
        spendCents - creatorExpenseCents,
      ),
    },
    naLabel: "N/A",
    disclosure:
      "Simulated attributed outcomes. Ratios do not establish causality, incremental lift or unique reach. Reserves and pledged budgets are not expenses. Fees are unknown; fixture-only zero fee assumptions must be named separately.",
  };
}
