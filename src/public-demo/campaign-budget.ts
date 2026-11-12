import type { AdSpendRules } from "./ad-platforms.ts";

export function campaignBudgetBreakdown(
  rules: Pick<AdSpendRules, "campaignLimitCents" | "metaPercent">,
  spent: { meta: number; tiktok: number },
) {
  if (
    !Number.isSafeInteger(rules.campaignLimitCents) ||
    rules.campaignLimitCents < 0 ||
    !Number.isInteger(rules.metaPercent) ||
    rules.metaPercent < 0 ||
    rules.metaPercent > 100 ||
    ![spent.meta, spent.tiktok].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    throw new Error(
      "Budget amounts must be nonnegative whole cents with a valid platform split.",
    );
  const meta = Math.floor((rules.campaignLimitCents * rules.metaPercent) / 100);
  const allocated = { meta, tiktok: rules.campaignLimitCents - meta };
  const rows = (["meta", "tiktok"] as const).map((platform) => ({
    platform,
    allocatedCents: allocated[platform],
    spentCents: spent[platform],
    remainingCents: allocated[platform] - spent[platform],
  }));
  const spentCents = spent.meta + spent.tiktok;
  return {
    rows,
    allocatedCents: rules.campaignLimitCents,
    spentCents,
    remainingCents: rules.campaignLimitCents - spentCents,
  };
}
