import type { PublicAd } from "./catalog.ts";

// A repeating burst schedule supplies cumulative fictional metrics, never money
// records. Each burst is large enough to visibly change a demo campaign leader.
export function simulateLeaders(ads: PublicAd[], tick: number): PublicAd[] {
  if (!tick) return ads;
  const groups = new Map<string, PublicAd[]>();
  for (const ad of ads) {
    if (
      [ad.impressions, ad.clicks, ad.donatedCents].some(
        (value) => value === null,
      )
    )
      continue;
    const campaignId = ad.campaignId || ad.projectId;
    groups.set(campaignId, [...(groups.get(campaignId) || []), ad]);
  }
  const counts = new Map<string, number>();
  for (const group of groups.values()) {
    group.forEach((ad, index) => {
      const first = index || group.length;
      const bursts = Math.max(0, Math.floor((tick - first) / group.length) + 1);
      const last = first + (bursts - 1) * group.length;
      counts.set(ad.id, (bursts * (first + last)) / 2);
    });
  }
  return ads.map((ad) => {
    const bursts = counts.get(ad.id) || 0;
    return bursts
      ? {
          ...ad,
          impressions: ad.impressions! + 60000 * bursts,
          clicks: ad.clicks! + 2500 * bursts,
          donatedCents: ad.donatedCents! + 300000 * bursts,
        }
      : ad;
  });
}
