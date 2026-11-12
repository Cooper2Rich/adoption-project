import type { PublicAd } from "./catalog.ts";

// October 24 PRD addendum overrides grading-v2's older weights and ties.
// User-approved demo targets, not production configuration or payouts.
export const DEMO_TARGETS = Object.freeze({
  impressions: 50_000,
  clicks: 2_000,
  donatedCents: 250_000,
});
export type CampaignTargets = {
  impressions: number;
  clicks: number;
  donatedCents: number;
};
export type ScoredAd = PublicAd & { score: number; rank: number };

export function scorePublicAd(
  ad: Pick<PublicAd, "impressions" | "clicks" | "donatedCents">,
  targets: CampaignTargets = DEMO_TARGETS,
): number | null {
  if (
    Object.values(targets).some(
      (target) => !Number.isSafeInteger(target) || target <= 0,
    )
  )
    throw new Error("Campaign scoring targets must be positive safe integers.");
  if (
    [ad.impressions, ad.clicks, ad.donatedCents].some(
      (value) => value === null || !Number.isSafeInteger(value) || value < 0,
    )
  )
    return null;
  const component = (value: number, target: number) =>
    Math.min(1, Math.sqrt(value / target));
  return (
    40 * component(ad.impressions!, targets.impressions) +
    30 * component(ad.clicks!, targets.clicks) +
    30 * component(ad.donatedCents!, targets.donatedCents)
  );
}

function compareResults(a: ScoredAd, b: ScoredAd) {
  // Never round before comparison or substitute CTR for total link clicks.
  return (
    b.score - a.score ||
    b.clicks! - a.clicks! ||
    b.donatedCents! - a.donatedCents! ||
    b.impressions! - a.impressions!
  );
}

export function rankPublicAds(
  ads: PublicAd[],
  campaignId: string,
  targets: CampaignTargets = DEMO_TARGETS,
): ScoredAd[] {
  const scored = ads
    .filter((ad) => (ad.campaignId || ad.projectId) === campaignId)
    .flatMap((ad) => {
      const score = scorePublicAd(ad, targets);
      return score === null ? [] : [{ ...ad, score, rank: 0 }];
    })
    .sort((a, b) => compareResults(a, b) || a.id.localeCompare(b.id));
  // Stable IDs order display only; exact ties retain shared competition ranks.
  scored.forEach((ad, index) => {
    ad.rank =
      index > 0 && compareResults(ad, scored[index - 1]) === 0
        ? scored[index - 1].rank
        : index + 1;
  });
  return scored.slice(0, 25);
}
