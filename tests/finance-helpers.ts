import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { freezeIntent } from "../server/attribution.ts";
import { COMPENSATION } from "../server/eligibility.ts";
import { createContribution, ingestEvent } from "../server/finance.ts";
import { consent, publishTerms } from "../server/marketplace.ts";
import { fixture } from "./helpers.ts";

export async function financeFixture(t, options = {}) {
  const f = await fixture(t);
  const project = f.store.read().projects[0];
  f.store.update((s) => {
    s.projects[0].instagram = "fictional.trees";
    if (options.payer === "sponsor") {
      s.organizations.push({
        id: "fictional-finance-sponsor",
        name: "Fictional Finance Sponsor",
        type: "business",
      });
      s.projects[0].sponsorOrganizationIds.push("fictional-finance-sponsor");
    }
  });
  const at = new Date(Date.now() - 3600000).toISOString();
  const terms = f.store.update((s, r) =>
    publishTerms(
      s,
      r,
      project.id,
      {
        currency: "USD",
        creatorCommissionBps: 1000,
        effectiveAt: at,
        startsAt: `${project.startDate}T00:00:00.000Z`,
        endsAt: new Date(
          Date.parse(`${project.endDate}T00:00:00Z`) + 86400000,
        ).toISOString(),
        attributionPolicy: "first-party-last-click-v1",
        attributionWindowDays: 7,
        permissions: {
          instagram: {
            state: "allowed",
            approver: "Fixture owner",
            evidence: "Fictional local campaign",
          },
        },
        combinations: [
          { channel: "instagram", placement: "feed", paid: !!options.paid },
        ],
        destinations: [`/campaigns/${project.id}/give`],
        budgetPayer: options.paid ? options.payer || "owner" : "unassigned",
        mediaBudget: options.paid
          ? {
              campaignLifetimeCapCents: options.cap || 10000,
              distributionCapCents: options.distributionCap || 10000,
              dailyCapCents: options.dailyCap || null,
              payerId:
                options.payer === "creator"
                  ? f.store.read().creators[0].id
                  : options.payer === "sponsor"
                    ? "fictional-finance-sponsor"
                    : project.ownerOrganizationId,
            }
          : null,
        guarantee: null,
        appUseAllocationCents: null,
        refundHoldPolicy: "Hold disputed gifts; cumulative refunds",
        gradingConfigId: null,
      },
      { role: "admin" },
      at,
    ),
  );
  const creatorId = f.store.read().creators[0].id;
  f.store.update((s, r) =>
    consent(s, r, project.id, terms.id, { role: "creator", creatorId }, at),
  );
  const result = await f.request(`/projects/${project.id}/posts`, {
    method: "POST",
    role: "creator",
    body: {
      title: "Finance creative",
      caption: "Fictional trees",
      format: "photo",
      media: "/images/forest.jpg",
      mediaType: "image",
      rights: true,
      channel: "instagram",
      destination: `/campaigns/${project.id}/give`,
      acceptedTermsVersion: terms.id,
      disclosures: {
        compensation: COMPENSATION,
        beneficiary: "Beneficiary: One Tree Collective.",
      },
      factualClaims: [],
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const post = result.data;
  const d = await f.request(`/campaigns/${project.id}/distributions`, {
    method: "POST",
    role: "creator",
    body: {
      postId: post.id,
      snapshotId: post.snapshotId,
      revision: post.revision,
      termsId: terms.id,
      channel: "instagram",
      placement: "feed",
      paid: !!options.paid,
      destination: `/campaigns/${project.id}/give`,
      payer: options.paid ? options.payer || "owner" : "unassigned",
      mode: "simulated",
    },
  });
  assert.equal(d.status, 201, JSON.stringify(d.data));
  const distribution = d.data;
  const gift = (amountCents = 10000, changes = {}) =>
    f.store.update((s, r) => {
      const intent = freezeIntent(s, r, project.id, randomUUID(), {
        amountCents,
        distributionId: distribution.id,
      });
      return createContribution(s, r, project.id, {
        source: "fixture",
        sourceAccountId: "account",
        originalTransactionId: randomUUID(),
        originalEvidenceId: "original evidence",
        currency: "USD",
        amountCents,
        contributorType: "public_supporter",
        purpose: "public",
        consent: "10% creator / 90% beneficiary before fees",
        intentId: intent.id,
        effectiveAt: intent.effectiveAt,
        ...changes,
      });
    });
  const support = (
    amountCents = 10000,
    allocations = [
      { purpose: "seed", use: "guarantee", amountCents: 6000 },
      { purpose: "media", use: "ad_budget", amountCents: 4000 },
    ],
    changes = {},
  ) =>
    f.store.update((s, r) =>
      createContribution(s, r, project.id, {
        source: "fixture",
        sourceAccountId: "business-account",
        originalTransactionId: randomUUID(),
        originalEvidenceId: "sponsor evidence",
        currency: "USD",
        amountCents,
        contributorType: "business",
        purpose: "restricted",
        consent: "Restricted purposes explicitly accepted",
        effectiveAt: new Date().toISOString(),
        allocations,
        ...changes,
      }),
    );
  const eventData = (c, type, amountCents = c.amountCents, changes = {}) => ({
    contributionId: c.id,
    source: c.source,
    sourceAccountId: c.sourceAccountId,
    originalTransactionId: c.originalTransactionId,
    sourceEventId: randomUUID(),
    type,
    amountCents,
    effectiveAt: new Date().toISOString(),
    evidenceRef: "Fictional simulated source evidence",
    ...changes,
  });
  const send = (c, type, n = c.amountCents, changes = {}) =>
    f.store.update((s, r) => ingestEvent(s, r, eventData(c, type, n, changes)));
  const rows = (table) =>
    f.store.records.page(table, { campaignId: project.id, limit: 100 }).items;
  return {
    ...f,
    project,
    terms,
    post,
    distribution,
    creatorId,
    gift,
    support,
    eventData,
    send,
    rows,
  };
}
