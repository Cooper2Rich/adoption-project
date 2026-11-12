import type { ManagedCampaign, Project } from "../types.ts";
import { recordedAdFundAllocation } from "./ad-fund-policy.ts";
import type { PublicAd, Support } from "./catalog.ts";
import { leaderboardWindow, periodAd } from "./leaderboard-periods.ts";
import { samplePaymentsFor, type SamplePayment } from "./sample-finances.ts";

export function campaignFundingReport(
  campaigns: ManagedCampaign[],
  projects: Project[],
  ads: PublicAd[],
  support: Support[],
  now = new Date(),
  payments: SamplePayment[] = [],
) {
  const today = leaderboardWindow("daily", now);
  const previous = leaderboardWindow(
    "daily",
    new Date(now.getTime() - 86400000),
  );
  return campaigns.map((campaign) => {
    const projectIds = new Set(
      projects.filter((p) => p.campaignId === campaign.id).map((p) => p.id),
    );
    const measured = ads.filter(
      (ad) => (ad.campaignId || ad.projectId) === campaign.id,
    );
    const days = measured.map((ad) => ({
      current: periodAd(ad, today),
      previous: periodAd(ad, previous),
    }));
    const known =
      days.length > 0 &&
      days.every(
        (day) =>
          day.current.donatedCents !== null &&
          day.previous.donatedCents !== null,
      );
    const currentRaised = known
      ? days.reduce((sum, day) => sum + day.current.donatedCents!, 0)
      : null;
    const previousRaised = known
      ? days.reduce((sum, day) => sum + day.previous.donatedCents!, 0)
      : null;
    const contributions = support.filter((s) =>
      s.campaignId
        ? s.campaignId === campaign.id
        : projectIds.has(
            s.projectId || ads.find((ad) => ad.id === s.adId)?.projectId || "",
          ),
    );
    const allocation = {
      grossCents: 0,
      creatorCents: 0,
      appUseFeeCents: 0,
      beneficiaryCents: 0,
      legacyCents: 0,
      paidCents: 0,
      appPaidCents: 0,
    };
    for (const contribution of contributions) {
      allocation.grossCents += contribution.amountCents;
      const a = recordedAdFundAllocation(
        contribution.amountCents,
        contribution.allocation,
      );
      if (a) {
        allocation.creatorCents += a.creatorCents;
        allocation.appUseFeeCents += a.appUseFeeCents;
        allocation.beneficiaryCents += a.beneficiaryCents;
      } else allocation.legacyCents += contribution.amountCents;
    }
    const appPayments = samplePaymentsFor(
      contributions,
      payments,
      "application",
    );
    allocation.appPaidCents = appPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0,
    );
    allocation.paidCents = samplePaymentsFor(
      contributions,
      payments,
      "creator",
    ).reduce((sum, p) => sum + p.amountCents, 0);
    return {
      campaign,
      ...allocation,
      appPayments,
      appOutstandingCents: allocation.appUseFeeCents - allocation.appPaidCents,
      currentRaised,
      previousRaised,
      growthCents:
        currentRaised === null || previousRaised === null
          ? null
          : currentRaised - previousRaised,
      growthPercent:
        currentRaised !== null && previousRaised
          ? (100 * (currentRaised - previousRaised)) / previousRaised
          : null,
    };
  });
}
