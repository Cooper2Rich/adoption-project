import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { clickLink, freezeIntent, issueLink } from "../server/attribution.ts";
import { economicsReport } from "../server/economics.ts";
import {
  adjudicateContribution,
  createContribution,
} from "../server/finance.ts";
import {
  evaluateGrade,
  gradeBoard,
  gradeComponents,
  publishGrade,
  publishGradingConfig,
  recordMetricEvidence,
  rejectGradeObligation,
} from "../server/grading.ts";
import { reserveMedia, spendMedia } from "../server/media-budgets.ts";
import { financeFixture } from "./finance-helpers.ts";

const admin = { role: "admin" };
const evidence = { disclosure: "Fictional isolated simulated fixtures only" };
const iso = (n) => new Date(n).toISOString();
async function analyticsFixture(t, options = {}) {
  const f = await financeFixture(t, options),
    now = Date.now();
  const basis = {
    channel: "instagram",
    placement: "feed",
    paid: !!options.paid,
    cohortId: "fictional-initial-opportunity",
    source: "fictional-platform-export",
    mode: "simulated",
    definitionVersion: "platform-counts-v1",
    viewDefinition: "fictional-three-second-video-view-v1",
    startsAt: iso(now - 60000),
    endsAt: iso(now + 60000),
  };
  const input = {
    idempotencyKey: "fictional-config",
    policy: "grading-v2",
    period: "final",
    basis,
    audienceExposurePlan:
      "Fictional equal initial opportunity; actual delivery independently measured",
    comparableAllowanceCents: options.paid ? 30000 : null,
    ctrTarget: 0.02,
    viewTarget: 400,
    voteTarget: 100,
    amountTargetCents: 10000,
    priorCTR: 0.012,
    priorStrength: 100,
    minimumImpressions: 1000,
    minimumViews: 20,
    reconciliationCutoff: iso(now + 120000),
  };
  const config = f.store.update((s, r) =>
    publishGradingConfig(s, r, f.project.id, input, admin, iso(now - 120000)),
  );
  const at = iso(now + 180000);
  const metric = (changes = {}) =>
    f.store.update((s, r) =>
      recordMetricEvidence(
        s,
        r,
        f.project.id,
        {
          idempotencyKey: randomUUID(),
          configId: config.id,
          creatorId: f.creatorId,
          basis,
          counts: {
            validImpressions: 10000,
            validOutboundClicks: 150,
            validViews: 100,
            allClicks: 220,
            eligibleLandingVisits: 100,
          },
          coverage: "complete",
          financialCoverage: "complete",
          evidenceRefs: [
            "fictional complete metric export and reconciled contribution inventory",
          ],
          distributionIds: [f.distribution.id],
          exposure: {
            plan: config.audienceExposurePlan,
            comparable: true,
            allowanceCents: config.comparableAllowanceCents,
            evidenceRef: "fictional exposure inventory",
          },
          supersedesId: null,
          correctionReason: null,
          ...changes,
        },
        admin,
        at,
      ),
    );
  const grade = (m, changes = {}) =>
    f.store.update((s, r) =>
      publishGrade(
        s,
        r,
        f.project.id,
        {
          idempotencyKey: randomUUID(),
          configId: config.id,
          creatorId: f.creatorId,
          evidenceId: m?.id || null,
          supersedesId: null,
          correctionReason: null,
          correctionCutoff: null,
          ...changes,
        },
        admin,
        at,
      ),
    );
  return { ...f, basis, input, config, at, metric, grade };
}
test("named economics separates platform/redirect clicks and actual payer costs: 1.5% CTR, $2 CPC, -$120 creator net", async (t) => {
  const f = await analyticsFixture(t, {
    paid: true,
    payer: "creator",
    cap: 100000,
    distributionCap: 100000,
  });
  const gift = f.gift(180000);
  f.send(gift, "capture");
  f.send(gift, "settlement");
  const reservation = f.store.update((s, r) =>
    reserveMedia(
      s,
      r,
      f.distribution.id,
      { idempotencyKey: "own-media", amountCents: 30000 },
      admin,
    ),
  );
  f.store.update((s, r) =>
    spendMedia(
      s,
      r,
      reservation.id,
      {
        idempotencyKey: "invoice",
        amountCents: 30000,
        effectiveAt: iso(Date.now()),
        evidenceRef: "fictional creator media bill",
      },
      admin,
    ),
  );
  f.store.update((s, r) => {
    const link = issueLink(s, r, f.distribution.id, admin);
    clickLink(s, r, link.path.slice(3), "fictional-visitor");
  });
  const m = f.metric(),
    report = economicsReport(
      f.store.read(),
      f.store.records,
      f.project.id,
      m.id,
      admin,
      f.at,
    );
  assert.equal(report.metrics.outboundCTR, 0.015);
  assert.equal(report.metrics.cpcCents, 200);
  assert.equal(report.metrics.cpmCents, 3000);
  assert.equal(report.metrics.firstPartyRedirectClicks, 1);
  assert.equal(report.metrics.outboundClicks, 150);
  assert.equal(report.metrics.allClicks, 220);
  assert.equal(report.metrics.donationConversionRate, 0.01);
  assert.equal(report.metrics.acquisitionCostCents, 30000);
  assert.equal(report.finances.creditedCommissionCents, 18000);
  assert.equal(report.finances.creatorExpenseCents, 30000);
  assert.equal(report.finances.creatorNetBeforeOtherCostsCents, -12000);
  assert.equal(report.finances.campaignFundedMediaSpendCents, 0);
  assert.deepEqual(report.finances.fees, {
    status: "unknown",
    amountCents: null,
  });
  assert.equal(report.finances.costsByPayer[0].payerId, f.creatorId);
  evidence.economics = report;
});
test("N/A denominators and organization-paid expenses never become creator costs", async (t) => {
  const f = await analyticsFixture(t, { paid: true });
  const support = f.support(10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  f.send(support, "capture");
  f.send(support, "settlement");
  const reservation = f.store.update((s, r) =>
    reserveMedia(
      s,
      r,
      f.distribution.id,
      { idempotencyKey: "owner-media", amountCents: 5000 },
      admin,
    ),
  );
  f.store.update((s, r) =>
    spendMedia(
      s,
      r,
      reservation.id,
      {
        idempotencyKey: "invoice",
        amountCents: 3000,
        effectiveAt: iso(Date.now()),
        evidenceRef: "fictional owner bill",
      },
      admin,
    ),
  );
  const m = f.metric({
    counts: {
      validImpressions: null,
      validOutboundClicks: 0,
      validViews: null,
      allClicks: 4,
      eligibleLandingVisits: 0,
    },
  });
  const report = economicsReport(
    f.store.read(),
    f.store.records,
    f.project.id,
    m.id,
    admin,
    f.at,
  );
  for (const key of [
    "outboundCTR",
    "cpcCents",
    "cpmCents",
    "donationConversionRate",
    "acquisitionCostCents",
  ])
    assert.equal(report.metrics[key], null);
  assert.equal(report.finances.creatorExpenseCents, 0);
  assert.equal(report.finances.actualMediaSpendCents, 3000);
  assert.equal(report.finances.campaignFundedMediaSpendCents, 3000);
  assert.equal(f.grade(m).status, "provisional");
});
test("official fixed target formula stores exact components .6/.5/.9/.8 = 77.5 and boundary scores", () => {
  const config = {
    ctrTarget: 0.02,
    viewTarget: 400,
    voteTarget: 100,
    amountTargetCents: 10000,
    priorCTR: 0.012,
    priorStrength: 100,
  };
  const input = {
    validImpressions: 10000,
    validOutboundClicks: 120,
    validViews: 100,
    eligibleSettledGiftCount: 81,
    netSettledEligibleGrossCents: 6400,
  };
  const result = gradeComponents(config, input);
  assert.deepEqual(result.components, {
    ctr: 0.6,
    views: 0.5,
    votes: 0.9,
    amount: 0.8,
  });
  assert.equal(result.score, 77.5);
  assert.deepEqual(result, gradeComponents(config, input));
  assert.equal(
    gradeComponents(
      { ...config, priorCTR: 0 },
      {
        validImpressions: 0,
        validOutboundClicks: 0,
        validViews: 0,
        eligibleSettledGiftCount: 0,
        netSettledEligibleGrossCents: 0,
      },
    ).score,
    0,
  );
  assert.equal(
    gradeComponents(config, {
      validImpressions: 10000,
      validOutboundClicks: 10000,
      validViews: 400,
      eligibleSettledGiftCount: 100,
      netSettledEligibleGrossCents: 10000,
    }).score,
    100,
  );
  evidence.formula = { config, input, result };
});
test("configuration is published before its window, immutable, strictly validated and cannot select old policy", async (t) => {
  const f = await analyticsFixture(t);
  for (const change of [
    { priorStrength: 0 },
    { priorCTR: 1.1 },
    { priorCTR: -0.1 },
    { minimumViews: 0 },
    { amountTargetCents: 0 },
    { ctrTarget: 0 },
    { voteTarget: 0 },
    { viewTarget: NaN },
    { policy: "old-weights" },
    { weights: { ctr: 40 } },
  ])
    assert.throws(() =>
      f.store.update((s, r) =>
        publishGradingConfig(
          s,
          r,
          f.project.id,
          { ...f.input, ...change, idempotencyKey: randomUUID() },
          admin,
          iso(Date.parse(f.basis.startsAt) - 1000),
        ),
      ),
    );
  assert.throws(
    () =>
      f.store.update((s, r) =>
        publishGradingConfig(
          s,
          r,
          f.project.id,
          { ...f.input, idempotencyKey: "late" },
          admin,
          f.at,
        ),
      ),
    /PRECEDE_WINDOW/,
  );
  assert.throws(
    () =>
      f.store.update((s, r) =>
        publishGradingConfig(
          s,
          r,
          f.project.id,
          { ...f.input, idempotencyKey: "rewrite", voteTarget: 40 },
          admin,
          iso(Date.parse(f.basis.startsAt) - 1000),
        ),
      ),
    /ALREADY_CONFIGURED/,
  );
  assert.deepEqual(
    f.store.records.get("grading_configs", f.config.id),
    f.config,
  );
  assert.deepEqual(evaluateGrade(null, null, null, f.at).reasons, [
    "GRADING_CONFIGURATION_MISSING",
  ]);
});
test("missing inputs, tiny samples, incomplete reconciliation and unknown/unequal opportunities remain provisional without commission effects", async (t) => {
  const f = await analyticsFixture(t),
    g = f.gift(5);
  f.send(g, "capture");
  f.send(g, "settlement");
  let previous;
  for (const change of [
    {
      counts: {
        validImpressions: 1,
        validOutboundClicks: 1,
        validViews: 1,
        allClicks: 1,
        eligibleLandingVisits: null,
      },
    },
    { coverage: "partial" },
    { financialCoverage: "unknown" },
    {
      exposure: {
        plan: f.config.audienceExposurePlan,
        comparable: null,
        allowanceCents: null,
        evidenceRef: "unknown",
      },
    },
    {
      exposure: {
        plan: f.config.audienceExposurePlan,
        comparable: true,
        allowanceCents: 30000,
        evidenceRef: "unequal budget",
      },
    },
  ]) {
    const m = f.metric({
      ...change,
      supersedesId: previous?.id || null,
      correctionReason: previous ? "fictional adversarial case" : null,
    });
    previous = m;
    const financial = {
      eligibleSettledGiftCount: 1,
      netSettledEligibleGrossCents: 5,
      reasons: [],
    };
    const result = evaluateGrade(f.config, m, financial, f.at);
    assert.equal(result.status, "provisional");
    assert.equal(result.score, null);
    assert.ok(result.reasons.length);
  }
  assert.equal(f.store.records.position(g.id).creatorCents, 1);
  assert.equal(f.terms.creatorCommissionBps, 1000);
  assert.equal(f.terms.guarantee, null);
  assert.throws(rejectGradeObligation, /SEPARATELY_CONFIGURED_FUNDED/);
  const pending = f.gift(10);
  f.send(pending, "capture");
  const m = f.metric({
    supersedesId: previous.id,
    correctionReason: "known metrics but unsettled gift",
  });
  const result = f.grade(m);
  assert.equal(result.status, "provisional");
  assert.ok(result.reasons.includes("DONATION_RECONCILIATION_PENDING"));
  evidence.provisional = result;
});
test("known complete zero gifts can finalize; missing metrics cannot; ties share competition rank and empty cohort has no winner", async (t) => {
  const f = await analyticsFixture(t);
  assert.deepEqual(
    gradeBoard(f.store.read(), f.store.records, f.config.id, admin).winnerIds,
    [],
  );
  const m = f.metric();
  const result = f.grade(m);
  assert.equal(result.status, "final");
  assert.equal(result.inputs.eligibleSettledGiftCount, 0);
  assert.equal(result.components.votes, 0);
  const secondId = f.store.read().creators[1].id;
  // An empty second creator's measured evidence uses its own immutable distribution.
  const own = f.store.update((s, r) =>
    r.append("distributions", {
      ...f.distribution,
      id: "fictional-second-distribution",
      creatorId: secondId,
    }),
  );
  const secondMetric = f.metric({
    creatorId: secondId,
    distributionIds: [own.id],
  });
  f.grade(secondMetric, { creatorId: secondId });
  const board = gradeBoard(f.store.read(), f.store.records, f.config.id, admin);
  assert.deepEqual(
    board.items.map((i) => i.rank),
    [1, 1],
  );
  assert.equal(board.winnerIds.length, 2);
  const retry = f.store.update((s, r) =>
    publishGrade(
      s,
      r,
      f.project.id,
      {
        idempotencyKey: result.idempotencyKey,
        configId: f.config.id,
        creatorId: f.creatorId,
        evidenceId: m.id,
        supersedesId: null,
        correctionReason: null,
        correctionCutoff: null,
      },
      admin,
      f.at,
    ),
  );
  assert.deepEqual(retry, result);
  assert.throws(
    () =>
      economicsReport(
        f.store.read(),
        f.store.records,
        f.project.id,
        secondMetric.id,
        { role: "creator", creatorId: f.creatorId },
        f.at,
      ),
    /unavailable/,
  );
  evidence.ties = board;
});
test("split gifts and dominant donor remain visible risks, retain genuine tiny-gift commission, never activate bonuses", async (t) => {
  const f = await analyticsFixture(t),
    split = [];
  for (let i = 0; i < 5; i++) {
    const g = f.gift(5);
    f.send(g, "capture");
    f.send(g, "settlement");
    f.send(g, "settlement");
    split.push(g);
  }
  const dominant = f.gift(100000);
  f.send(dominant, "capture");
  f.send(dominant, "settlement");
  const result = f.grade(f.metric());
  assert.equal(result.inputs.eligibleSettledGiftCount, 6);
  assert.equal(result.inputs.netSettledEligibleGrossCents, 100025);
  assert.equal(result.components.amount, 1);
  for (const g of split)
    assert.equal(f.store.records.position(g.id).creatorCents, 1);
  assert.throws(rejectGradeObligation, /FUNDED_BONUS/);
  assert.equal(f.rows("finance_operations").length, 0);
  evidence.abuse = { splitGiftCount: 5, dominantGiftCents: 100000, result };
});
test("refund/dispute and invalid traffic append linked snapshots, retain raw/source evidence and historical results", async (t) => {
  const f = await analyticsFixture(t),
    g = f.gift(10000);
  f.send(g, "capture");
  f.send(g, "settlement");
  const m = f.metric(),
    first = f.grade(m);
  assert.equal(first.inputs.eligibleSettledGiftCount, 1);
  f.send(g, "refund");
  const correctedMetric = f.metric({
    supersedesId: m.id,
    correctionReason: "invalid traffic excluded by fictional source export",
    counts: { ...m.counts, validOutboundClicks: 100, validImpressions: 9000 },
  });
  const corrected = f.grade(correctedMetric, {
    supersedesId: first.id,
    correctionReason: "full refund and invalid traffic",
    correctionCutoff: f.at,
  });
  assert.equal(corrected.inputs.eligibleSettledGiftCount, 0);
  assert.equal(corrected.inputs.netSettledEligibleGrossCents, 0);
  assert.equal(corrected.status, "final");
  assert.ok(corrected.score < first.score);
  assert.deepEqual(f.store.records.get("grade_snapshots", first.id), first);
  assert.equal(
    f.store.records.get("metric_evidence", m.id).counts.validOutboundClicks,
    150,
  );
  assert.equal(
    gradeBoard(f.store.read(), f.store.records, f.config.id, admin).items
      .length,
    1,
  );
  const p = f.gift(20);
  f.send(p, "capture");
  f.send(p, "settlement");
  f.send(p, "dispute");
  const held = f.grade(correctedMetric, {
    supersedesId: corrected.id,
    correctionReason: "dispute hold",
    correctionCutoff: f.at,
  });
  assert.equal(held.status, "provisional");
  assert.ok(held.reasons.includes("DONATION_RECONCILIATION_PENDING"));
  evidence.corrections = {
    config: f.config,
    metricBefore: m,
    metricAfter: correctedMetric,
    first,
    corrected,
    held,
  };
});
test("suspense adjudication is included from authoritative journal attribution while ambiguous gifts hold finality", async (t) => {
  const f = await analyticsFixture(t);
  const c = f.store.update((s, r) => {
    const intent = freezeIntent(s, r, f.project.id, "fictional-untracked", {
      amountCents: 100,
    });
    return createContribution(s, r, f.project.id, {
      source: "fixture",
      sourceAccountId: "account",
      originalTransactionId: randomUUID(),
      originalEvidenceId: "untracked gift",
      currency: "USD",
      amountCents: 100,
      contributorType: "public_supporter",
      purpose: "public",
      consent: "10%/90%",
      intentId: intent.id,
      effectiveAt: intent.effectiveAt,
    });
  });
  f.send(c, "capture");
  f.send(c, "settlement");
  const m = f.metric(),
    before = f.grade(m);
  assert.equal(before.status, "provisional");
  assert.ok(
    before.reasons.includes("UNALLOCATED_DONATION_RECONCILIATION_PENDING"),
  );
  f.store.update((s, r) =>
    adjudicateContribution(s, r, c.id, {
      distributionId: f.distribution.id,
      evidence: "Audited fictional direct-selection evidence",
    }),
  );
  const after = f.grade(m, {
    supersedesId: before.id,
    correctionReason: "audited suspense resolution",
    correctionCutoff: f.at,
  });
  assert.equal(after.status, "final");
  assert.equal(after.inputs.eligibleSettledGiftCount, 1);
  assert.equal(after.inputs.netSettledEligibleGrossCents, 100);
  assert.ok(after.financial.gifts[0].sourceIds.length >= 3);
  evidence.adjudication = { before, after };
});
test("channel, view definition, organic/paid and mode evidence cannot be merged; owner/creator HTTP scope is enforced", async (t) => {
  const f = await analyticsFixture(t);
  for (const change of [
    { channel: "youtube" },
    { paid: true },
    { viewDefinition: "one-second" },
    { mode: "live" },
    { cohortId: "other-cohort" },
  ])
    assert.throws(() => f.metric({ basis: { ...f.basis, ...change } }));
  const res = await f.request(`/campaigns/${f.project.id}/metric-evidence`, {
    method: "POST",
    role: "creator",
    body: {},
  });
  assert.equal(res.status, 403);
  const m = f.metric();
  const r = await f.request(
    `/campaigns/${f.project.id}/economics?evidenceId=${m.id}`,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.metrics.outboundCTR, 0.015);
  evidence.queryPlans = f.store.records.analyticsQueryPlans();
  for (const plan of Object.values(evidence.queryPlans))
    assert.match(JSON.stringify(plan), /USING (COVERING )?INDEX/);
  if (process.env.SLANDER_ANALYTICS_EVIDENCE)
    writeFileSync(
      process.env.SLANDER_ANALYTICS_EVIDENCE,
      JSON.stringify(evidence, null, 2),
    );
});
