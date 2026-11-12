import type { Post, Project } from "../types.ts";
import { allocateAdFund, recordedAdFundAllocation } from "./ad-fund-policy.ts";
import type { Support } from "./catalog.ts";

export type SamplePayment = {
  id: string;
  contributionId: string;
  recipient: "creator" | "application";
  amountCents: number;
  at: string;
};
export type SampleFinancials = {
  version: 1;
  contributions: Support[];
  payments: SamplePayment[];
};

// Frozen, separately labeled illustration records. Never enter viewer history,
// donation votes, public rankings, live payment rails or the cause-gift ledger.
export function ensureSampleFinancials(state: {
  sampleFinancials?: SampleFinancials;
  projects: Project[];
  posts: Post[];
  creators: { id: string; name: string }[];
}) {
  if (state.sampleFinancials) return;
  const financials: SampleFinancials = {
    version: 1,
    contributions: [],
    payments: [],
  };
  const fixtures = [
    {
      adId: "nocturne-midnight",
      amount: 480000,
      creatorPaid: 40000,
      appPaid: 24000,
    },
    {
      adId: "nocturne-espresso",
      amount: 320000,
      creatorPaid: 20000,
      appPaid: 10000,
    },
    { adId: "nocturne-afterhours", amount: 240000, creatorPaid: 0, appPaid: 0 },
    { adId: "sample-1", amount: 360000, creatorPaid: 24000, appPaid: 12000 },
    { adId: "sample-2", amount: 270000, creatorPaid: 18000, appPaid: 9000 },
    { adId: "sample-3", amount: 180000, creatorPaid: 12000, appPaid: 6000 },
    { adId: "sample-4", amount: 120000, creatorPaid: 8000, appPaid: 4000 },
    {
      adId: "sample-river-financial-story",
      amount: 640000,
      creatorPaid: 40000,
      appPaid: 24000,
    },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const post =
      fixture.adId === "sample-river-financial-story"
        ? {
            id: fixture.adId,
            title: "River stories · sample",
            projectId: "fictional-river-showcase-v1",
            creatorId: "fictional-river-showcase-v1-creator",
          }
        : state.posts.find((p) => p.id === fixture.adId);
    const project = state.projects.find((p) => p.id === post?.projectId);
    if (
      !post ||
      !project ||
      !state.creators.some((c) => c.id === post.creatorId)
    )
      continue;
    const id = `sample-finance-v1-${post.id}`;
    financials.contributions.push({
      id,
      viewerId: "fictional-sample-support",
      adId: post.id,
      title: post.title,
      projectId: project.id,
      campaignId: project.campaignId || project.id,
      creatorId: post.creatorId,
      amountCents: fixture.amount,
      allocation: allocateAdFund(fixture.amount),
      at: `2026-10-${18 + (index % 5)}T12:00:00.000Z`,
    });
    for (const [recipient, amountCents] of [
      ["creator", fixture.creatorPaid],
      ["application", fixture.appPaid],
    ] as const) {
      if (amountCents)
        financials.payments.push({
          id: `${id}-${recipient}-payment`,
          contributionId: id,
          recipient,
          amountCents,
          at: "2026-10-23T15:00:00.000Z",
        });
    }
  }
  state.sampleFinancials = financials;
}

export function samplePaymentsFor(
  contributions: Support[],
  payments: SamplePayment[],
  recipient: SamplePayment["recipient"],
) {
  const seen = new Set<string>();
  const used = new Map<string, number>();
  return payments.filter((payment) => {
    if (
      payment.recipient !== recipient ||
      seen.has(payment.id) ||
      !Number.isSafeInteger(payment.amountCents) ||
      payment.amountCents <= 0
    )
      return false;
    seen.add(payment.id);
    const contribution = contributions.find(
      (c) => c.id === payment.contributionId,
    );
    const allocation =
      contribution &&
      recordedAdFundAllocation(
        contribution.amountCents,
        contribution.allocation,
      );
    if (!allocation) return false;
    const limit =
      recipient === "creator"
        ? allocation.creatorCents
        : allocation.appUseFeeCents;
    const total = (used.get(payment.contributionId) || 0) + payment.amountCents;
    if (total > limit) return false;
    used.set(payment.contributionId, total);
    return true;
  });
}
