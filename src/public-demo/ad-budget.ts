import { currentEligibility } from "../../server/eligibility.ts";
import type { Post, Project } from "../types.ts";
import type {
  AdPlatform,
  AdSpendRules,
  CampaignAdSetup,
} from "./ad-platforms.ts";
import { campaignBudgetBreakdown } from "./campaign-budget.ts";
import type { CompletedAdSpend } from "./completed-ad-spend.ts";

const platforms = ["meta", "tiktok"] as const;
type Amounts = {
  allocatedCents: number;
  spentCents: number;
  remainingCents: number;
};
export type AdBudgetRow = {
  adId: string;
  projectId: string;
  title: string;
  historyOnly: boolean;
  eligiblePlatforms: AdPlatform[];
  platforms: Record<AdPlatform, Amounts>;
  totals: Amounts;
};

// Equal shares with stable cent remainders. Capped shares are redistributed
// only among remaining ads on this same platform, never across platforms.
export function splitAdBudget(
  amount: number,
  capacities: { id: string; limitCents: number }[],
) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    capacities.some(
      (row) => !Number.isSafeInteger(row.limitCents) || row.limitCents < 0,
    ) ||
    new Set(capacities.map((row) => row.id)).size !== capacities.length
  )
    throw new Error(
      "Ad budgets require unique IDs and nonnegative whole cents.",
    );
  const rows = capacities
    .map((row) => ({ ...row, amountCents: 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  let remaining = amount;
  let active = rows.filter((row) => row.limitCents > 0);
  while (remaining > 0 && active.length) {
    const base = Math.floor(remaining / active.length),
      remainder = remaining % active.length;
    let assigned = 0;
    active.forEach((row, index) => {
      const next = Math.min(
        base + (index < remainder ? 1 : 0),
        row.limitCents - row.amountCents,
      );
      row.amountCents += next;
      assigned += next;
    });
    if (!assigned) break;
    remaining -= assigned;
    active = active.filter((row) => row.amountCents < row.limitCents);
  }
  return rows.map(({ id, amountCents }) => ({ id, amountCents }));
}

export function adBudgetBreakdown(
  rules: Pick<AdSpendRules, "campaignLimitCents" | "metaPercent">,
  projects: Project[],
  posts: Post[],
  completed: CompletedAdSpend[],
  connections: CampaignAdSetup["connections"] = {},
) {
  const projectIds = new Set(projects.map((project) => project.id));
  const scopedSpend = completed.filter((row) => projectIds.has(row.projectId));
  const spent = { meta: 0, tiktok: 0 };
  for (const row of scopedSpend) spent[row.platform] += row.amountCents;
  const campaign = campaignBudgetBreakdown(rules, spent);
  const rows = new Map<string, AdBudgetRow>();
  const emptyAmounts = (): Amounts => ({
    allocatedCents: 0,
    spentCents: 0,
    remainingCents: 0,
  });
  for (const post of posts.filter((post) => projectIds.has(post.projectId))) {
    const project = projects.find((project) => project.id === post.projectId)!;
    const eligible =
      post.status === "approved" && currentEligibility(post, project);
    rows.set(post.id, {
      adId: post.id,
      projectId: post.projectId,
      title: post.title,
      historyOnly: false,
      eligiblePlatforms: eligible
        ? platforms.filter(
            (platform) =>
              post.mediaType === "video" ||
              (platform === "meta" &&
                !connections.meta?.targetId.endsWith("-video")),
          )
        : [],
      platforms: { meta: emptyAmounts(), tiktok: emptyAmounts() },
      totals: emptyAmounts(),
    });
  }
  for (const entry of scopedSpend) {
    if (!rows.has(entry.adId))
      rows.set(entry.adId, {
        adId: entry.adId,
        projectId: entry.projectId,
        title: entry.creative,
        historyOnly: true,
        eligiblePlatforms: [],
        platforms: { meta: emptyAmounts(), tiktok: emptyAmounts() },
        totals: emptyAmounts(),
      });
    const row = rows.get(entry.adId)!;
    if (row.projectId !== entry.projectId)
      throw new Error("Completed spend does not match the ad's project.");
    row.platforms[entry.platform].spentCents += entry.amountCents;
  }
  const unassigned = { meta: 0, tiktok: 0 };
  for (const platform of platforms) {
    const allocation = campaign.rows.find(
      (row) => row.platform === platform,
    )!.allocatedCents;
    const eligible = [...rows.values()].filter((row) =>
      row.eligiblePlatforms.includes(platform),
    );
    const shares = splitAdBudget(
      allocation,
      eligible.map((row) => ({ id: row.adId, limitCents: allocation })),
    );
    for (const share of shares)
      rows.get(share.id)!.platforms[platform].allocatedCents =
        share.amountCents;
    unassigned[platform] =
      allocation - shares.reduce((sum, share) => sum + share.amountCents, 0);
  }
  for (const row of rows.values()) {
    for (const platform of platforms) {
      const amounts = row.platforms[platform];
      amounts.remainingCents = amounts.allocatedCents - amounts.spentCents;
      row.totals.allocatedCents += amounts.allocatedCents;
      row.totals.spentCents += amounts.spentCents;
      row.totals.remainingCents += amounts.remainingCents;
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.adId.localeCompare(b.adId)),
    unassigned,
    campaign,
  };
}
