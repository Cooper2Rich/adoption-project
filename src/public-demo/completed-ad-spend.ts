import type { AdPlatform } from "./ad-platforms.ts";

export type CompletedAdSpend = {
  id: string;
  adId: string;
  projectId: string;
  platform: AdPlatform;
  creative: string;
  amountCents: number;
  completedAt: string;
};

// Frozen illustrations, separate from platform evidence and financial ledgers.
const examples: CompletedAdSpend[] = [
  {
    id: "coffee-meta-midnight",
    adId: "nocturne-midnight",
    projectId: "nocturne-coffee-showcase-v1",
    platform: "meta",
    creative: "Your midnight ritual",
    amountCents: 24000,
    completedAt: "2026-10-21T15:00:00Z",
  },
  {
    id: "coffee-tiktok-midnight",
    adId: "nocturne-midnight",
    projectId: "nocturne-coffee-showcase-v1",
    platform: "tiktok",
    creative: "Your midnight ritual",
    amountCents: 16000,
    completedAt: "2026-10-21T16:00:00Z",
  },
  {
    id: "coffee-meta-espresso",
    adId: "nocturne-espresso",
    projectId: "nocturne-coffee-showcase-v1",
    platform: "meta",
    creative: "A little obsession, in every shot",
    amountCents: 18000,
    completedAt: "2026-10-22T15:00:00Z",
  },
  {
    id: "coffee-tiktok-afterhours",
    adId: "nocturne-afterhours",
    projectId: "nocturne-coffee-showcase-v1",
    platform: "tiktok",
    creative: "A seat after dark",
    amountCents: 12000,
    completedAt: "2026-10-23T15:00:00Z",
  },
  {
    id: "river-meta",
    adId: "sample-river-financial-story",
    projectId: "fictional-river-showcase-v1",
    platform: "meta",
    creative: "River stories · sample",
    amountCents: 125000,
    completedAt: "2026-10-22T14:00:00Z",
  },
  {
    id: "river-tiktok",
    adId: "sample-river-financial-story",
    projectId: "fictional-river-showcase-v1",
    platform: "tiktok",
    creative: "River stories · sample",
    amountCents: 75000,
    completedAt: "2026-10-23T14:00:00Z",
  },
  {
    id: "adoption-meta",
    adId: "adoption-girl-in-the-middle",
    projectId: "acu-ad-competition",
    platform: "meta",
    creative: "The Girl in the Middle",
    amountCents: 90000,
    completedAt: "2026-10-22T17:00:00Z",
  },
  {
    id: "adoption-tiktok",
    adId: "adoption-girl-in-the-middle",
    projectId: "acu-ad-competition",
    platform: "tiktok",
    creative: "The Girl in the Middle",
    amountCents: 60000,
    completedAt: "2026-10-23T17:00:00Z",
  },
];

export function completedAdSpendReport(
  projects: { id: string }[],
  includeSamples = true,
) {
  const ids = new Set(projects.map((project) => project.id));
  const rows = includeSamples
    ? examples
        .filter((row) => ids.has(row.projectId))
        .map((row) => ({ ...row }))
        .sort(
          (a, b) =>
            b.completedAt.localeCompare(a.completedAt) ||
            a.id.localeCompare(b.id),
        )
    : [];
  const byPlatform = { meta: 0, tiktok: 0 };
  for (const row of rows) byPlatform[row.platform] += row.amountCents;
  return { rows, byPlatform, totalCents: byPlatform.meta + byPlatform.tiktok };
}
