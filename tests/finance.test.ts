import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { freezeIntent } from "../server/attribution.ts";
import {
  recoveryBalance,
  refundSplit,
  remainingAllocations,
  splitGift,
} from "../server/finance-money.ts";
import {
  createContribution,
  ingestEvent,
  rebuildPosition,
  reconcile,
} from "../server/finance.ts";
import { changeOfferState, publishTerms } from "../server/marketplace.ts";
import {
  cancelMedia,
  mediaBalance,
  reserveMedia,
  spendMedia,
} from "../server/media-budgets.ts";
import { chargeAppUse, seedCapacity } from "../server/seed-commitments.ts";
import {
  approveBatch,
  creatorStatement,
  definePeriod,
  executeBatch,
  exportBatch,
} from "../server/settlements.ts";
import { createStore } from "../server/store.ts";
import { financeFixture } from "./finance-helpers.ts";

const admin = { role: "admin" };
function financeEvidence(name, value) {
  const destination = process.env.SLANDER_FINANCE_EVIDENCE;
  if (!destination) return;
  let evidence = {};
  try {
    evidence = JSON.parse(readFileSync(destination, "utf8"));
  } catch {
    /* New evidence file. */
  }
  evidence[name] = value;
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + "\n");
}
const mutateFinance = (f, fn) => f.store.update((s, r) => fn(s, r));
const settleSupport = (f, cents, allocations) => {
  const c = f.support(cents, allocations);
  f.send(c, "capture");
  f.send(c, "settlement");
  return c;
};
function fictionalWeek(f) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const startsAt = start.toISOString(),
    endsAt = new Date(+start + 7 * 86400000).toISOString();
  return mutateFinance(f, (s, r) =>
    definePeriod(
      s,
      r,
      f.project.id,
      { startsAt, endsAt, cutoff: endsAt },
      admin,
    ),
  );
}
function newTerms(f, changes) {
  const keys = [
    "currency",
    "creatorCommissionBps",
    "effectiveAt",
    "startsAt",
    "endsAt",
    "attributionPolicy",
    "attributionWindowDays",
    "permissions",
    "combinations",
    "destinations",
    "budgetPayer",
    "guarantee",
    "appUseAllocationCents",
    "appUse",
    "mediaBudget",
    "refundHoldPolicy",
    "gradingConfigId",
  ];
  const body = {
    ...Object.fromEntries(keys.map((k) => [k, f.terms[k]])),
    effectiveAt: new Date().toISOString(),
    ...changes,
  };
  return mutateFinance(f, (s, r) =>
    publishTerms(s, r, f.project.id, body, admin, body.effectiveAt),
  );
}
function promiseFor(f, p, floorCents = 2500) {
  return {
    floorCents,
    creatorIds: [f.creatorId],
    periodStart: p.startsAt,
    periodEnd: p.endsAt,
    cutoff: p.cutoff,
    maxTotalLiabilityCents: floorCents,
  };
}

test("USD BigInt fixed 1000bps handles cent boundaries and cumulative refunds without floating multiplication", () => {
  assert.deepEqual(splitGift(10000), {
    creatorCents: 1000,
    beneficiaryCents: 9000,
  });
  assert.deepEqual(splitGift(5), { creatorCents: 1, beneficiaryCents: 4 });
  assert.deepEqual(splitGift(1), { creatorCents: 0, beneficiaryCents: 1 });
  assert.deepEqual(refundSplit(15, 10), {
    creatorCents: 1,
    beneficiaryCents: 4,
  });
  for (const n of [0, 4, 5, 14, 15, 10000, Number.MAX_SAFE_INTEGER]) {
    const split = splitGift(n);
    assert.equal(
      BigInt(split.creatorCents),
      (BigInt(n) * 1000n + 5000n) / 10000n,
    );
    assert.equal(split.creatorCents + split.beneficiaryCents, n);
  }
  for (const n of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => splitGift(n));
  assert.throws(() => refundSplit(5, 6), /REFUND_EXCEEDS_CAPTURE/);
  assert.equal(recoveryBalance(1000, 2500), 1500);
});

test("captured gifts accrue exact immutable terms/snapshots and balanced liabilities; settlement adds cash without another commission", async (t) => {
  const f = await financeFixture(t);
  for (const n of [10000, 5, 1]) {
    const c = f.gift(n);
    const captured = f.send(c, "capture").position;
    assert.equal(captured.state, "captured");
    assert.equal(captured.settledCents, 0);
    assert.equal(captured.availableCreatorCents, 0);
    assert.equal(captured.availableBeneficiaryCents, 0);
    assert.equal(captured.votes, 1);
    assert.equal(captured.settledVotes, 0);
    assert.deepEqual(
      {
        creatorCents: captured.creatorCents,
        beneficiaryCents: captured.beneficiaryCents,
      },
      splitGift(n),
    );
    const settled = f.send(c, "settlement").position;
    assert.equal(settled.state, "settled");
    assert.equal(settled.settledVotes, 1);
  }
  const entries = f.rows("journal_entries"),
    transactions = f.rows("journal_transactions");
  assert.equal(transactions.length, 6);
  for (const tx of transactions) {
    const lines = entries.filter((e) => e.transactionId === tx.id);
    assert.equal(
      lines.reduce(
        (n, e) => n + BigInt(e.debitCents) - BigInt(e.creditCents),
        0n,
      ),
      0n,
    );
    assert(f.store.records.get("source_events", tx.sourceRecordId));
    assert.deepEqual(tx.terms, f.terms);
    assert.equal(tx.attribution.binding.snapshotId, f.post.snapshotId);
    assert.equal(tx.attribution.binding.evaluationId, f.post.eligibility.id);
    assert.equal(tx.creatorCommissionBps, 1000);
    assert.equal(tx.currency, "USD");
    assert.match(tx.feeAssumption, /fixture assumption/);
  }
  const count = transactions.length;
  f.store.update((s) => {
    s.projects[0].ctr = 99;
    s.projects[0].tier = "platinum";
    s.projects[0].adSpendCents = 999999;
  });
  assert.equal(f.rows("journal_transactions").length, count);
  assert.equal(f.store.records.financeTotals(f.project.id).creatorCents, 1001);
  assert.throws(
    () => f.store.records.append("journal_entries", {}),
    /transaction owner/,
  );
});

test("restricted multipurpose consent conserves $100=$60 seed+$40 media; pending/captured/failed support is unavailable and public progress excludes it", async (t) => {
  const f = await financeFixture(t);
  const c = f.support();
  let p = f.store.records.position(c.id);
  assert.equal(p.state, "pending");
  assert.equal(p.availableMediaCents, 0);
  p = f.send(c, "capture").position;
  assert.equal(p.seedGuaranteeCents, 6000);
  assert.equal(p.mediaCents, 4000);
  assert.equal(p.availableSeedGuaranteeCents + p.availableMediaCents, 0);
  p = f.send(c, "settlement").position;
  assert.equal(p.availableSeedGuaranteeCents, 6000);
  assert.equal(p.availableMediaCents, 4000);
  assert.equal(p.availableSeedGuaranteeCents + p.availableMediaCents, 10000);
  assert(p.availableSeedGuaranteeCents + p.availableMediaCents < 11000);
  assert.equal(p.creatorCents, 0);
  assert.equal(p.votes, 0);
  const fail = f.support(100, [
    { purpose: "seed", use: "app_use", amountCents: 100 },
  ]);
  assert.equal(f.send(fail, "failed").position.availableSeedAppUseCents, 0);
  const before = f.rows("contributions").length;
  assert.throws(
    () =>
      f.support(10000, [
        ...c.allocations,
        { purpose: "seed", use: "app_use", amountCents: 1000 },
      ]),
    /Allocations must equal/,
  );
  assert.throws(
    () =>
      f.support(10000, [
        { purpose: "media", use: "guarantee", amountCents: 10000 },
      ]),
    /Invalid purpose/,
  );
  assert.throws(() =>
    f.support(1, [{ purpose: "seed", use: "guarantee", amountCents: 1 }], {
      mode: "live",
    }),
  );
  assert.throws(() =>
    f.support(1, [{ purpose: "seed", use: "guarantee", amountCents: 1 }], {
      currency: "EUR",
    }),
  );
  assert.equal(f.rows("contributions").length, before);
  const publicView = (await f.request(`/giving/${f.project.id}/progress`)).data;
  assert.equal(publicView.netProgressCents, 0);
  assert.equal(publicView.pendingCents, 0);
  assert.equal(publicView.unallocatedCents, 0);
  const gift = f.gift(100);
  f.send(gift, "capture");
  f.send(gift, "refund", 50);
  const progress = (await f.request(`/giving/${f.project.id}/progress`)).data;
  assert.equal(progress.eligibleGrossCents, 100);
  assert.equal(progress.refundCents, 50);
  assert.equal(progress.netProgressCents, 50);
});

test("late financial evidence uses exact historical completion/terms rather than arrival time or currently edited offer policy", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(100);
  const event = f.eventData(c, "capture");
  const after = new Date(Date.parse(event.effectiveAt) + 1000).toISOString();
  f.store.update((s, r) => {
    changeOfferState(s, r, f.project.id, "closed", { role: "admin" }, after);
    s.projects[0].eligibilityPolicy.version = "future edited policy";
  });
  const captured = f.store.update((s, r) =>
    ingestEvent(s, r, event, new Date(Date.parse(after) + 1000).toISOString()),
  ).position;
  assert.equal(captured.creatorCents, 10);
  assert.equal(captured.votes, 1);
  assert.equal(f.rows("journal_transactions")[0].terms.id, f.terms.id);
  const closed = f.gift(100);
  const result = f.store.update((s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(closed, "capture", 100, { effectiveAt: after }),
      new Date(Date.parse(after) + 1000).toISOString(),
    ),
  ).position;
  assert.equal(result.creatorCents, 0);
  assert.equal(result.unallocatedCents, 100);
  const before = f.rows("source_events").length;
  assert.throws(() =>
    f.send(c, "capture", 100, { creatorCommissionBps: 2000 }),
  );
  assert.equal(f.rows("source_events").length, before);
});

test("ten capture/settlement replays and differently named cumulative events create one gift/one vote; source account and intent binding cannot change", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(15);
  const capture = f.eventData(c, "capture"),
    settlement = f.eventData(c, "settlement");
  for (let i = 0; i < 10; i++)
    for (const e of [capture, settlement])
      f.store.update((s, r) => ingestEvent(s, r, e));
  for (let i = 0; i < 10; i++) {
    f.send(c, "capture");
    f.send(c, "settlement");
  }
  assert.equal(f.rows("contributions").length, 1);
  assert.equal(f.rows("journal_transactions").length, 2);
  assert.equal(f.store.records.position(c.id).votes, 1);
  assert.equal(f.store.records.position(c.id).creatorCents, 2);
  const input = Object.fromEntries(
    Object.entries(c).filter(
      ([k]) =>
        !["id", "campaignId", "definitionDigest", "recordedAt"].includes(k),
    ),
  );
  for (const change of [
    { source: "another" },
    { sourceAccountId: "another" },
    { originalTransactionId: "another" },
    { amountCents: 16 },
  ])
    assert.throws(
      () =>
        f.store.update((s, r) =>
          createContribution(s, r, f.project.id, { ...input, ...change }),
        ),
      /CONFLICT|FIXED_INTENT/,
    );
  assert.throws(
    () => f.send(c, "capture", 15, { originalTransactionId: "replacement" }),
    /ORIGINAL_TRANSACTION_CONFLICT/,
  );
  assert.throws(() => f.send(c, "capture", 16), /AMOUNT_EXCEEDS_INTENT/);
  assert.equal(f.rows("contributions").length, 1);
  const otherAccount = f.gift(5, {
    sourceAccountId: "another-account",
    originalTransactionId: c.originalTransactionId,
  });
  f.send(otherAccount, "capture", 5, { sourceEventId: capture.sourceEventId });
  assert.equal(f.store.records.position(otherAccount.id).creatorCents, 1);
  assert.equal(f.store.records.financeTotals(f.project.id).votes, 2);
});

test("changed source digest is immutable evidence held for review; affected liability availability and votes are held", async (t) => {
  const f = await financeFixture(t),
    c = f.support();
  const e = f.eventData(c, "capture");
  f.store.update((s, r) => ingestEvent(s, r, e));
  f.send(c, "settlement");
  const original = f
    .rows("source_events")
    .find((row) => row.sourceEventId === e.sourceEventId);
  const conflict = f.store.update((s, r) =>
    ingestEvent(s, r, { ...e, evidenceRef: "Changed payload" }),
  );
  assert.equal(conflict.state, "held");
  assert.equal(conflict.position.availableMediaCents, 0);
  assert.equal(conflict.position.heldCents, 10000);
  assert.deepEqual(f.store.records.get("source_events", original.id), original);
  assert.equal(f.rows("source_conflicts").length, 1);
  f.store.update((s, r) =>
    ingestEvent(s, r, { ...e, evidenceRef: "Changed payload" }),
  );
  assert.equal(f.rows("source_conflicts").length, 1);
  assert.equal(f.rows("journal_transactions").length, 2);
  const g = f.gift();
  const ce = f.eventData(g, "capture");
  f.store.update((s, r) => ingestEvent(s, r, ce));
  assert.equal(
    f.store.update((s, r) => ingestEvent(s, r, { ...ce, amountCents: 9999 }))
      .position.votes,
    0,
  );
});

test("out-of-order refund and settlement wait for capture; cumulative partial refunds conserve cents and remove the vote only on full refund", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(15);
  assert.equal(f.send(c, "refund", 5).state, "pending");
  assert.equal(f.send(c, "settlement").state, "pending");
  assert.equal(f.rows("journal_transactions").length, 0);
  const captured = f.send(c, "capture").position;
  assert.equal(captured.refundedCents, 5);
  assert.equal(captured.settledCents, 15);
  assert.equal(captured.creatorCents, 1);
  assert.equal(captured.votes, 1);
  const second = f.send(c, "refund", 10).position;
  assert.equal(second.creatorCents, 1);
  assert.equal(second.beneficiaryCents, 4);
  assert.equal(second.votes, 1);
  for (let i = 0; i < 3; i++) f.send(c, "refund", 10);
  assert.equal(f.store.records.position(c.id).refundedCents, 10);
  const full = f.send(c, "refund", 15).position;
  assert.equal(full.votes, 0);
  assert.equal(full.creatorCents, 0);
  assert.equal(full.beneficiaryCents, 0);
  f.send(c, "pending", 0);
  f.send(c, "failed", 0);
  f.send(c, "capture", 5);
  f.send(c, "settlement", 5);
  assert.equal(f.store.records.position(c.id).state, "refunded");
  assert.equal(f.store.records.position(c.id).settledCents, 15);
  const installments = f.gift(15);
  f.send(installments, "capture", 5);
  f.send(installments, "capture", 15);
  assert.equal(f.store.records.position(installments.id).creatorCents, 2);
  assert.equal(f.store.records.position(installments.id).votes, 1);
});

test("excess refunds and injected cross-workspace/journal failure roll back every fact and projection", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(100);
  f.send(c, "capture", 50);
  const before = {
    state: f.store.read(),
    p: f.store.records.position(c.id),
    events: f.rows("source_events"),
    journal: f.rows("journal_transactions"),
    entries: f.rows("journal_entries"),
  };
  assert.throws(
    () =>
      f.store.update((s, r) => {
        s.projects[0].name = "Must roll back";
        ingestEvent(s, r, f.eventData(c, "refund", 51));
      }),
    /REFUND_EXCEEDS_CAPTURE/,
  );
  assert.throws(
    () =>
      f.store.update((s, r) => {
        s.projects[0].name = "Must also roll back";
        ingestEvent(s, r, f.eventData(c, "capture", 100));
        throw new Error("Injected after journal writes");
      }),
    /Injected/,
  );
  assert.deepEqual(f.store.read(), before.state);
  assert.deepEqual(f.store.records.position(c.id), before.p);
  assert.deepEqual(f.rows("source_events"), before.events);
  assert.deepEqual(f.rows("journal_transactions"), before.journal);
  assert.deepEqual(f.rows("journal_entries"), before.entries);
  const uncaptured = f.gift(5),
    count = f.rows("source_events").length;
  assert.throws(
    () => f.send(uncaptured, "refund", 6),
    /REFUND_EXCEEDS_CAPTURE/,
  );
  assert.equal(f.rows("source_events").length, count);
});

test("disputes hold liabilities and confirmed loss reverses them; recovery seam represents post-payment shortfall without a debit", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(10000);
  f.send(c, "capture");
  f.send(c, "settlement");
  const disputed = f.send(c, "dispute").position;
  assert.equal(disputed.heldCents, 10000);
  assert.equal(disputed.votes, 0);
  assert.equal(disputed.creatorCents, 1000);
  assert.equal(f.send(c, "dispute_release").position.votes, 1);
  f.send(c, "dispute");
  const lost = f.send(c, "dispute_loss").position;
  assert.equal(lost.refundedCents, 10000);
  assert.equal(lost.creatorCents, 0);
  assert.equal(lost.votes, 0);
  const tx = f.rows("journal_transactions").at(-1);
  assert.equal(tx.type, "dispute_loss");
  assert(tx.correctingTransactionId);
  assert.equal(recoveryBalance(lost.creatorCents, 1000), 1000);
  assert(
    !f
      .rows("journal_entries")
      .some((e) => e.account.includes("external_debit")),
  );
});

test("unattributed captured money remains explicit suspense and never creates protected commission or progress", async (t) => {
  const f = await financeFixture(t);
  const intent = f.store.update((s, r) =>
    freezeIntent(s, r, f.project.id, "unattributed visitor", {
      amountCents: 100,
    }),
  );
  const c = f.gift(100, { intentId: intent.id });
  const p = f.send(c, "capture").position;
  assert.equal(p.unallocatedCents, 100);
  assert.equal(p.creatorCents, 0);
  assert.equal(p.publicGrossCents, 0);
  assert.equal(p.votes, 0);
  assert(
    f
      .rows("journal_entries")
      .some((e) => e.account === "suspense" && e.creditCents === 100),
  );
  const publicView = (await f.request(`/giving/${f.project.id}/progress`)).data;
  assert.equal(publicView.unallocatedCents, 100);
});

test("Admin adjudication resolves captured suspense at its original completion time with an immutable balanced correction and no second cash/gift", async (t) => {
  const f = await financeFixture(t);
  const intent = f.store.update((s, r) =>
    freezeIntent(s, r, f.project.id, "suspense visitor", { amountCents: 100 }),
  );
  const c = f.gift(100, { intentId: intent.id });
  f.send(c, "capture");
  f.send(c, "settlement");
  const original = f.store.records.position(c.id);
  const url = `/contributions/${c.id}/attribution-adjudications`;
  const body = {
    distributionId: f.distribution.id,
    evidence: "Admin verified fictional original-time distribution evidence",
  };
  assert.equal(
    (await f.request(url, { method: "POST", role: "creator", body })).status,
    403,
  );
  assert.equal(
    (
      await f.request(url, {
        method: "POST",
        body: { ...body, distributionId: "missing" },
      })
    ).status,
    409,
  );
  assert.equal(f.rows("journal_transactions").length, 2);
  assert.throws(
    () =>
      f.send(c, "attribution_resolution", 100, {
        distributionId: f.distribution.id,
        effectiveAt: new Date(
          Date.parse(original.eligibility.effectiveAt) - 1,
        ).toISOString(),
      }),
    /ORIGINAL_COMPLETION_TIME_REQUIRED/,
  );
  const result = await f.request(url, { method: "POST", body });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const p = result.data.position;
  assert.equal(p.unallocatedCents, 0);
  assert.equal(p.creatorCents, 10);
  assert.equal(p.beneficiaryCents, 90);
  assert.equal(p.votes, 1);
  assert.equal(p.capturedCents, 100);
  assert.equal(p.settledCents, 100);
  const tx = f
    .rows("journal_transactions")
    .find((tx) => tx.type === "attribution_resolution");
  assert(tx.correctingTransactionId);
  assert.deepEqual(tx.terms, f.terms);
  const entries = f
    .rows("journal_entries")
    .filter((e) => e.transactionId === tx.id);
  assert.deepEqual(entries.map((e) => e.account).sort(), [
    "beneficiary",
    "creator",
    "suspense",
  ]);
  assert.equal(
    entries.reduce((n, e) => n + e.debitCents - e.creditCents, 0),
    0,
  );
  assert.equal(
    (await f.request(url, { method: "POST", body })).data.state,
    "duplicate",
  );
  assert.throws(
    () =>
      f.send(c, "attribution_resolution", 100, {
        distributionId: f.distribution.id,
        effectiveAt: original.eligibility.effectiveAt,
      }),
    /ATTRIBUTION_ALREADY_ALLOCATED/,
  );
  assert.equal(f.rows("journal_transactions").length, 3);
  assert.equal(f.rows("contributions").length, 1);
  const rebuilt = f.store.update((s, r) => rebuildPosition(s, r, c.id));
  assert.deepEqual(rebuilt.position, p);
  const restart = createStore(join(f.dir, "test.sqlite"));
  assert.deepEqual(restart.records.position(c.id), p);
  restart.close();
});

test("Admin financial fixtures are scoped; public confirmation owns an immutable intent and emits trusted local evidence only once", async (t) => {
  const f = await financeFixture(t),
    c = f.gift();
  for (const role of ["creator", "nonprofit"]) {
    assert.equal(
      (
        await f.request("/admin/finance-events", {
          method: "POST",
          role,
          body: f.eventData(c, "capture"),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(`/campaigns/${f.project.id}/contributions`, {
          method: "POST",
          role,
          body: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (await f.request(`/campaigns/${f.project.id}/finance/events`, { role }))
        .status,
      403,
    );
  }
  const start = await fetch(`${f.baseURL}/api/giving/${f.project.id}/intents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amountCents: 5, distributionId: f.distribution.id }),
  });
  assert.equal(start.status, 201);
  const cookie = start.headers.get("set-cookie").split(";")[0],
    intent = await start.json();
  const url = `${f.baseURL}/api/giving/${f.project.id}/intents/${intent.id}/confirm`;
  const call = (headers = {}, body = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await call()).status, 404);
  assert.equal((await call({ cookie }, { amountCents: 100000 })).status, 400);
  let confirmation;
  for (let i = 0; i < 2; i++) {
    const res = await call({ cookie });
    assert.equal(res.status, 200);
    confirmation = await res.json();
  }
  assert.equal(confirmation.amountCents, 5);
  assert.equal(confirmation.creatorCents, 1);
  assert.equal(confirmation.votes, 1);
  assert.equal(f.rows("journal_transactions").length, 2);
  const owner = (
    await f.request(`/campaigns/${f.project.id}/finance`, { role: "nonprofit" })
  ).data;
  const publicView = (await f.request(`/giving/${f.project.id}/progress`)).data;
  for (const view of [owner, publicView, confirmation])
    for (const key of [
      "sourceAccountId",
      "visitorId",
      "payloadDigest",
      "sourceEventId",
      "payoutId",
      "termsId",
    ])
      assert(!JSON.stringify(view).includes(key));
  const workspace = (await f.request("/workspace")).data;
  for (const key of ["source_events", "journal_entries", "contributions"])
    assert(!Object.hasOwn(workspace, key));
  assert.equal(
    (await f.request(`/campaigns/${f.project.id}/finance?mode=live`)).data
      .capturedCents,
    0,
  );
  assert.equal(
    (
      await f.request(`/campaigns/seat-at-the-table/finance`, {
        role: "nonprofit",
      })
    ).status,
    404,
  );
});

test("bounded reconciliation checkpoints at 100 and declared source/journal/queue indexes support scoped capped pages", async (t) => {
  const f = await financeFixture(t),
    c = f.gift(100);
  for (let i = 0; i < 105; i++) f.send(c, "refund", 1);
  const first = f.store.update((s, r) =>
    reconcile(s, r, { campaignId: f.project.id }),
  );
  assert.equal(first.processed, 100);
  assert(first.nextCursor);
  assert.equal(first.applied, 0);
  assert(first.durationMs >= 0);
  const second = f.store.update((s, r) =>
    reconcile(s, r, { campaignId: f.project.id, cursor: first.nextCursor }),
  );
  assert.equal(second.processed, 5);
  assert.equal(second.nextCursor, null);
  f.send(c, "capture");
  assert.equal(
    f.store.records.pendingPage({ campaignId: f.project.id }).items.length,
    5,
  );
  const last = f.store.update((s, r) =>
    reconcile(s, r, { campaignId: f.project.id }),
  );
  assert.equal(last.processed, 5);
  assert.equal(last.applied, 5);
  assert.equal(f.store.records.position(c.id).refundedCents, 1);
  const expected = f.store.records.position(c.id);
  let rebuilt;
  do {
    rebuilt = f.store.update((s, r) =>
      rebuildPosition(s, r, c.id, rebuilt?.checkpoint),
    );
    assert(rebuilt.processed <= 100);
  } while (rebuilt.checkpoint);
  assert.deepEqual(rebuilt.position, expected);
  for (const [name, plan] of Object.entries(
    f.store.records.financeQueryPlans(),
  ))
    assert.match(
      plan.map((row) => row.detail).join(" "),
      new RegExp(
        name === "source"
          ? "source_evidence_unique"
          : name === "journal"
            ? "journal_subject"
            : "finance_pending_page",
      ),
    );
  const page = f.store.records.page("source_events", {
    campaignId: f.project.id,
    limit: 1000,
  });
  assert.equal(page.items.length, 100);
  assert(page.nextCursor);
  const next = f.store.records.page("source_events", {
    campaignId: f.project.id,
    cursor: page.nextCursor,
    limit: 100,
  });
  assert.equal(next.items.length, 6);
  assert(!next.items.some((r) => page.items.some((p) => p.id === r.id)));
  assert.throws(
    () =>
      f.store.records.page("source_events", {
        campaignId: "different",
        cursor: page.nextCursor,
      }),
    /Invalid scoped cursor/,
  );
});

test("restart, immutable SQL facts, and full-directory backup/restore preserve source IDs, media, and every per-purpose total", async (t) => {
  const f = await financeFixture(t),
    publicGift = f.gift(10000),
    support = f.support();
  for (const c of [publicGift, support]) {
    f.send(c, "capture");
    f.send(c, "settlement");
  }
  f.send(publicGift, "refund", 500);
  const totals = f.store.records.financeTotals(f.project.id),
    ids = f.rows("source_events").map((e) => e.id),
    media = f.store.read().posts.map((p) => p.media);
  const purposeTotals = (r) =>
    r
      .page("journal_entries", { campaignId: f.project.id, limit: 100 })
      .items.reduce((totals, e) => {
        const key = `${e.purpose}:${e.account}`;
        totals[key] = (totals[key] || 0) + e.debitCents - e.creditCents;
        return totals;
      }, {});
  const journalTotals = purposeTotals(f.store.records);
  const db = new DatabaseSync(join(f.dir, "test.sqlite"));
  for (const table of [
    "source_events",
    "contributions",
    "journal_transactions",
    "journal_entries",
  ]) {
    assert.throws(
      () => db.exec(`UPDATE ${table} SET effective_at='changed'`),
      /Immutable financial fact/,
    );
    assert.throws(
      () => db.exec(`DELETE FROM ${table}`),
      /Immutable financial fact/,
    );
  }
  const backup = mkdtempSync(join(tmpdir(), "slander-finance-backup-"));
  t.after(() => rmSync(backup, { recursive: true, force: true }));
  writeFileSync(
    join(f.dir, "uploads", "fictional-media.txt"),
    "retained media",
  );
  db.prepare("VACUUM INTO ?").run(join(backup, "test.sqlite"));
  db.close();
  cpSync(join(f.dir, "uploads"), join(backup, "uploads"), { recursive: true });
  const restarted = createStore(join(f.dir, "test.sqlite"));
  assert.deepEqual(restarted.records.financeTotals(f.project.id), totals);
  restarted.close();
  for (let i = 0; i < 2; i++) {
    const restored = createStore(join(backup, "test.sqlite"));
    assert.deepEqual(restored.records.financeTotals(f.project.id), totals);
    assert.deepEqual(purposeTotals(restored.records), journalTotals);
    assert.deepEqual(
      restored.records
        .page("source_events", { campaignId: f.project.id })
        .items.map((e) => e.id),
      ids,
    );
    assert.deepEqual(
      restored.read().posts.map((p) => p.media),
      media,
    );
    restored.close();
  }
  assert.equal(
    readFileSync(join(backup, "uploads", "fictional-media.txt"), "utf8"),
    "retained media",
  );
  const reversed = remainingAllocations(support.allocations, 10000, 9999);
  assert.equal(
    reversed.reduce((n, a) => n + a.amountCents, 0),
    9999,
  );
});

test("commit-time invariants reject unbalanced journals and appending to closed transactions; goal is a scoped integer-cent campaign setting", async (t) => {
  const f = await financeFixture(t),
    c = f.gift();
  f.send(c, "capture");
  const tx = f.rows("journal_transactions")[0],
    before = f.rows("journal_entries");
  const entry = {
    id: randomUUID(),
    campaignId: f.project.id,
    mode: "simulated",
    effectiveAt: tx.effectiveAt,
    currency: "USD",
    transactionId: tx.id,
    sourceRecordId: tx.sourceRecordId,
    contributionId: c.id,
    account: "creator",
    purpose: "public",
    debitCents: 1,
    creditCents: 0,
  };
  assert.throws(
    () => f.store.update((s, r) => r.append("journal_entries", entry)),
    /already closed/,
  );
  const uncaptured = f.gift();
  const pending = f.send(uncaptured, "settlement").event;
  assert.throws(
    () =>
      f.store.update((s, r) => {
        const bad = {
          ...tx,
          id: randomUUID(),
          sourceRecordId: pending.id,
          contributionId: uncaptured.id,
        };
        r.append("journal_transactions", bad);
        r.append("journal_entries", {
          ...entry,
          id: randomUUID(),
          transactionId: bad.id,
          sourceRecordId: pending.id,
          contributionId: uncaptured.id,
        });
        r.append("source_event_results", {
          id: randomUUID(),
          campaignId: f.project.id,
          mode: "simulated",
          effectiveAt: tx.effectiveAt,
          sourceRecordId: pending.id,
          contributionId: uncaptured.id,
          state: "applied",
          lastTransactionId: bad.id,
        });
      }),
    /Unbalanced/,
  );
  assert.deepEqual(f.rows("journal_entries"), before);
  const project = f.store.read().projects[0];
  assert.equal(
    (
      await f.request(`/projects/${project.id}`, {
        method: "PUT",
        body: { ...project, goalCents: 100000 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request(`/giving/${project.id}/progress`)).data.goalCents,
    100000,
  );
  assert.equal(
    (
      await f.request(`/projects/${project.id}`, {
        method: "PUT",
        body: { ...project, goalCents: 1.5 },
      })
    ).status,
    400,
  );
});

test("v2 migration failure rolls back and an existing v1 upgrade backs up committed state before schema changes", async (t) => {
  const f = await financeFixture(t),
    c = f.support();
  f.send(c, "capture");
  f.send(c, "settlement");
  const raw = new DatabaseSync(join(f.dir, "test.sqlite"));
  raw.exec("DELETE FROM schema_migrations WHERE version>=2");
  raw.close();
  const state = f.store.read(),
    totals = f.store.records.financeTotals(f.project.id);
  assert.throws(
    () =>
      createStore(join(f.dir, "test.sqlite"), true, {
        migrationHook(stage) {
          if (stage === "afterSchema")
            throw new Error("Injected v2 migration failure");
        },
      }),
    /Injected v2 migration/,
  );
  const afterFailure = new DatabaseSync(join(f.dir, "test.sqlite"));
  assert.equal(
    afterFailure
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get().version,
    1,
  );
  afterFailure.close();
  const reopened = createStore(join(f.dir, "test.sqlite"));
  assert(reopened.migrationBackup.includes("backup-v2"));
  t.after(() =>
    rmSync(reopened.migrationBackup, { recursive: true, force: true }),
  );
  assert.deepEqual(reopened.read(), state);
  assert.deepEqual(reopened.records.financeTotals(f.project.id), totals);
  reopened.close();
});

test("fictional competing $60 reserves against $100 serialize; $40 bill consumes once, $20 cancel releases only unused", async (t) => {
  const f = await financeFixture(t, {
    paid: true,
    cap: 20000,
    distributionCap: 20000,
  });
  settleSupport(f, 10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  const results = await Promise.all(
    ["a", "b"].map((idempotencyKey) =>
      f.request(`/distributions/${f.distribution.id}/reservations`, {
        method: "POST",
        body: { idempotencyKey, amountCents: 6000 },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.match(
    results.find((r) => r.status === 409).data.error,
    /MEDIA_FUNDING_SHORTFALL/,
  );
  const reservation = results.find((r) => r.status === 201).data;
  const input = {
    idempotencyKey: "request1",
    amountCents: 4000,
    effectiveAt: new Date().toISOString(),
    evidenceRef: "fictional invoice 1",
  };
  const spent = mutateFinance(f, (s, r) =>
    spendMedia(s, r, reservation.id, input, admin),
  );
  assert.equal(
    mediaBalance(f.store.records, f.project.id).reservedMediaCents,
    2000,
  );
  assert.equal(
    mediaBalance(f.store.records, f.project.id).availableCents,
    4000,
  );
  financeEvidence("reserve60Spend40", {
    fiction: true,
    reservationId: reservation.id,
    spendSourceId: spent.sourceRecordId,
    balance: mediaBalance(f.store.records, f.project.id),
    queryPlans: f.store.records.settlementQueryPlans(),
  });
  const replay = mutateFinance(f, (s, r) =>
    spendMedia(
      s,
      r,
      reservation.id,
      { ...input, idempotencyKey: "renamed-request" },
      admin,
    ),
  );
  assert.equal(replay.id, spent.id);
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        spendMedia(
          s,
          r,
          reservation.id,
          { ...input, amountCents: 5000 },
          admin,
        ),
      ),
    /IDEMPOTENCY_CONFLICT/,
  );
  const exported = await f.request(
    `/distributions/${f.distribution.id}/state`,
    { method: "POST", body: { state: "exported" } },
  );
  assert.equal(exported.status, 200, JSON.stringify(exported.data));
  mutateFinance(f, (s, r) => cancelMedia(s, r, reservation.id, admin));
  mutateFinance(f, (s, r) => cancelMedia(s, r, reservation.id, admin));
  const balance = mediaBalance(f.store.records, f.project.id);
  assert.equal(balance.spentMediaCents, 4000);
  assert.equal(balance.reservedMediaCents, 0);
  assert.equal(balance.availableCents, 6000);
  assert.equal(f.store.records.financeTotals(f.project.id).creatorCents, 0);
  assert.equal(
    f.rows("finance_operations").filter((o) => o.kind === "media_spend").length,
    1,
  );
});

test("fictional $70 bill on $60 reserve is retained in full and blocks commitments even with remaining cash", async (t) => {
  const f = await financeFixture(t, { paid: true });
  settleSupport(f, 10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  const r = mutateFinance(f, (s, r) =>
    reserveMedia(
      s,
      r,
      f.distribution.id,
      { idempotencyKey: "reserve", amountCents: 6000 },
      admin,
    ),
  );
  mutateFinance(f, (s, repo) =>
    spendMedia(
      s,
      repo,
      r.id,
      {
        idempotencyKey: "bill",
        amountCents: 7000,
        effectiveAt: new Date().toISOString(),
        evidenceRef: "fictional overdelivery bill",
      },
      admin,
    ),
  );
  const balance = mediaBalance(f.store.records, f.project.id);
  assert.equal(balance.spentMediaCents, 7000);
  assert.equal(balance.overrunCents, 1000);
  assert.equal(balance.held, true);
  assert.equal(balance.availableCents, 3000);
  financeEvidence("overrun70On60", { fiction: true, balance });
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        reserveMedia(
          s,
          r,
          f.distribution.id,
          { idempotencyKey: "extra", amountCents: 1 },
          admin,
        ),
      ),
    /DEFICIT_HOLD/,
  );
  mutateFinance(f, (s, repo) => cancelMedia(s, repo, r.id, admin));
  assert.equal(
    mediaBalance(f.store.records, f.project.id).spentMediaCents,
    7000,
  );
  const bills = f
    .rows("journal_entries")
    .filter((e) => e.account === "media:spend_expense");
  assert.equal(bills[0].debitCents, 7000);
});

test("legacy creative export shares marketplace pause, matching distribution and funded paid-plan gates", async (t) => {
  const f = await financeFixture(t, { paid: true });
  const path = `/posts/${f.post.id}/export?distributionId=${f.distribution.id}`;
  assert.equal((await f.request(`/posts/${f.post.id}/export`)).status, 409);
  const unreserved = await f.request(path);
  assert.equal(unreserved.status, 409);
  assert.match(unreserved.data.error, /MEDIA_RESERVATION_REQUIRED/);
  settleSupport(f, 10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  mutateFinance(f, (s, r) =>
    reserveMedia(
      s,
      r,
      f.distribution.id,
      { idempotencyKey: "export", amountCents: 6000 },
      admin,
    ),
  );
  mutateFinance(f, (s, r) =>
    changeOfferState(s, r, f.project.id, "paused", admin),
  );
  assert.equal((await f.request(path)).status, 409);
  assert.equal(f.store.read().exports.length, 0);
  mutateFinance(f, (s, r) =>
    changeOfferState(s, r, f.project.id, "open", admin),
  );
  const exported = await f.request(path);
  assert.equal(exported.status, 200, JSON.stringify(exported.data));
  assert.equal(exported.data.distributionId, f.distribution.id);
  assert.equal(exported.data.termsId, f.terms.id);
  assert.equal(f.store.read().exports.length, 1);
});

test("media requires settled purpose, named payer, independent caps and owner scope; pause blocks new reserves and creator external spend creates no Slander cash", async (t) => {
  const f = await financeFixture(t, {
    paid: true,
    distributionCap: 6000,
    dailyCap: 5000,
  });
  const c = f.support(10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  const reserve = (amountCents, key = randomUUID(), access = admin) =>
    mutateFinance(f, (s, r) =>
      reserveMedia(
        s,
        r,
        f.distribution.id,
        { idempotencyKey: key, amountCents },
        access,
      ),
    );
  assert.throws(() => reserve(100), /FUNDING_SHORTFALL/);
  f.send(c, "capture");
  assert.throws(() => reserve(100), /FUNDING_SHORTFALL/);
  f.send(c, "settlement");
  assert.throws(
    () => reserve(100, "creator", { role: "creator", creatorId: f.creatorId }),
    /settings/,
  );
  assert.throws(
    () =>
      reserve(100, "foreign", {
        role: "owner",
        organizationId: "another-owner",
      }),
    /not available/,
  );
  assert.throws(() => reserve(6500), /CAP_EXCEEDED/);
  assert.throws(() => reserve(5500), /DAILY_CAP_EXCEEDED/);
  reserve(5000);
  mutateFinance(f, (s, r) =>
    changeOfferState(s, r, f.project.id, "paused", admin),
  );
  assert.throws(() => reserve(1), /PAUSED/);
  assert.equal(
    (
      await f.request(`/reservations/unknown/spend`, {
        method: "POST",
        role: "creator",
        body: {},
      })
    ).status,
    403,
  );
  const external = await financeFixture(t, { paid: true, payer: "creator" });
  const creator = { role: "creator", creatorId: external.creatorId };
  const r = mutateFinance(external, (s, repo) =>
    reserveMedia(
      s,
      repo,
      external.distribution.id,
      { idempotencyKey: "own", amountCents: 6000 },
      creator,
    ),
  );
  mutateFinance(external, (s, repo) =>
    spendMedia(
      s,
      repo,
      r.id,
      {
        idempotencyKey: "externalbill",
        amountCents: 4000,
        effectiveAt: new Date().toISOString(),
        evidenceRef: "fictional creator receipt",
      },
      admin,
    ),
  );
  const balance = mediaBalance(external.store.records, external.project.id);
  assert.equal(balance.spentMediaCents, 0);
  assert.equal(balance.availableCents, 0);
  assert.equal(balance.creatorMediaCostCents, 4000);
  assert.equal(
    external.rows("journal_entries").filter((e) => e.account === "available")
      .length,
    0,
  );
  mutateFinance(external, (s, repo) => cancelMedia(s, repo, r.id, creator));
  assert.equal(
    external.store.records.creatorMediaReserved(external.project.id),
    0,
  );
});

test("opening finite seed promises is atomic and purpose-specific; same promise across new terms is not reserved twice", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f);
  const c = f.support();
  const promise = promiseFor(f, p, 6000);
  const before = f.rows("offer_versions").length;
  assert.throws(() => newTerms(f, { guarantee: promise }), /SEED_SHORTFALL/);
  f.send(c, "capture");
  assert.throws(() => newTerms(f, { guarantee: promise }), /SEED_SHORTFALL/);
  f.send(c, "settlement");
  assert.throws(
    () =>
      newTerms(f, {
        guarantee: promise,
        appUseAllocationCents: 1000,
        appUse: {
          obligationId: "fee",
          amountCents: 1000,
          recipientId: f.project.ownerOrganizationId,
          trigger: "open",
        },
      }),
    /SEED_SHORTFALL/,
  );
  assert.equal(f.rows("offer_versions").length, before);
  assert.equal(f.rows("reservations").length, 0);
  assert.deepEqual(seedCapacity(f.store.records, f.project.id), {
    guaranteeCents: 6000,
    appUseCents: 0,
  });
  assert.equal(
    mediaBalance(f.store.records, f.project.id).availableCents,
    4000,
  );
  newTerms(f, { guarantee: promise });
  newTerms(f, { guarantee: promise });
  assert.equal(f.rows("reservations").length, 1);
  assert.equal(seedCapacity(f.store.records, f.project.id).guaranteeCents, 0);
  assert.throws(
    () =>
      newTerms(f, {
        guarantee: {
          ...promise,
          floorCents: 6500,
          maxTotalLiabilityCents: 6500,
        },
      }),
    /COMMITMENT_CONFLICT/,
  );
  assert.throws(() => newTerms(f, { appUseAllocationCents: 1 }), /recipient/);
  assert.throws(() =>
    newTerms(f, { guarantee: { ...promise, maxTotalLiabilityCents: 5000 } }),
  );
});

test("fictional $25 floor and $10 base yields separate $15 top-up; app-use charges once and never votes or changes 1000bps", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    gift = f.gift();
  f.send(gift, "capture");
  f.send(gift, "settlement");
  settleSupport(f, 3000, [
    { purpose: "seed", use: "guarantee", amountCents: 2500 },
    { purpose: "seed", use: "app_use", amountCents: 500 },
  ]);
  const terms = newTerms(f, {
    guarantee: promiseFor(f, p),
    appUseAllocationCents: 500,
    appUse: {
      obligationId: "fictional-app-use",
      amountCents: 500,
      recipientId: f.project.ownerOrganizationId,
      trigger: "fixture_open",
    },
  });
  const charge = {
    obligationId: "fictional-app-use",
    trigger: "fixture_open",
    evidenceRef: "fictional charge trigger",
  };
  const first = mutateFinance(f, (s, r) =>
    chargeAppUse(s, r, f.project.id, charge, admin),
  );
  const again = mutateFinance(f, (s, r) =>
    chargeAppUse(s, r, f.project.id, charge, admin),
  );
  assert.equal(first.id, again.id);
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        chargeAppUse(
          s,
          r,
          f.project.id,
          { ...charge, trigger: "wrong" },
          admin,
        ),
      ),
    /TRIGGER/,
  );
  const statement = creatorStatement(
    f.store.records,
    f.project.id,
    f.creatorId,
    p,
  );
  assert.equal(statement.capturedAccrualCents, 1000);
  assert.equal(statement.topUpCents, 1500);
  assert.equal(statement.payableCents, 2500);
  assert.equal(statement.creatorCommissionBps, 1000);
  const batch = mutateFinance(f, (s, r) =>
    approveBatch(
      s,
      r,
      f.project.id,
      {
        idempotencyKey: "floor-week",
        periodId: p.id,
        creatorIds: [f.creatorId],
      },
      admin,
      p.cutoff,
    ),
  );
  assert.equal(batch.manifest.lines[0].baseCents, 1000);
  assert.equal(batch.manifest.lines[0].topUpCents, 1500);
  assert.equal(f.store.records.financeTotals(f.project.id).votes, 1);
  assert.equal(terms.creatorCommissionBps, 1000);
  const totals = f.store.records.operationTotals(f.project.id);
  assert.equal(totals.usedGuaranteeCents, 1500);
  assert.equal(totals.reservedGuaranteeCents, 1000);
  assert.equal(totals.usedAppUseCents, 500);
  assert.equal(totals.reservedAppUseCents, 0);
  financeEvidence("floorAndAppUse", {
    fiction: true,
    statement,
    batch: batch.manifest,
    appUseCharge: first,
    totals,
  });
  assert(
    f
      .rows("journal_entries")
      .some(
        (e) => e.account === "seed:app_use_expense" && e.debitCents === 500,
      ),
  );
});

test("pending commission, eligibility or later seed refund holds a promised floor rather than premature top-up or underpayment", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    gift = f.gift();
  f.send(gift, "capture");
  const seed = settleSupport(f, 2500, [
    { purpose: "seed", use: "guarantee", amountCents: 2500 },
  ]);
  newTerms(f, { guarantee: promiseFor(f, p) });
  let statement = creatorStatement(
    f.store.records,
    f.project.id,
    f.creatorId,
    p,
  );
  assert.equal(statement.guaranteePending, true);
  assert.equal(statement.payableCents, 0);
  assert.equal(statement.topUpCents, 0);
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        approveBatch(
          s,
          r,
          f.project.id,
          {
            idempotencyKey: "pending",
            periodId: p.id,
            creatorIds: [f.creatorId],
          },
          admin,
          p.cutoff,
        ),
      ),
    /SETTLEMENT_HOLD/,
  );
  f.send(gift, "settlement");
  f.send(seed, "refund", 100);
  statement = creatorStatement(f.store.records, f.project.id, f.creatorId, p);
  assert.equal(statement.payableCents, 0);
  assert(statement.heldReasons.includes("SEED_SHORTFALL_HOLD"));
  assert.equal(f.rows("settlement_manifests").length, 0);
});

test("exact UTC weeks, immutable approval manifests and stable intent retries never double allocate or report real payment", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    gift = f.gift();
  assert.throws(() =>
    mutateFinance(f, (s, r) =>
      definePeriod(
        s,
        r,
        f.project.id,
        {
          startsAt: p.startsAt,
          endsAt: new Date(Date.parse(p.endsAt) - 1).toISOString(),
          cutoff: p.cutoff,
        },
        admin,
      ),
    ),
  );
  f.send(gift, "capture");
  assert.equal(
    creatorStatement(f.store.records, f.project.id, f.creatorId, p)
      .payableCents,
    0,
  );
  f.send(gift, "settlement");
  const data = {
    idempotencyKey: "week",
    periodId: p.id,
    creatorIds: [f.creatorId],
  };
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        approveBatch(
          s,
          r,
          f.project.id,
          data,
          { role: "creator", creatorId: f.creatorId },
          p.cutoff,
        ),
      ),
    /Admin/,
  );
  assert.throws(
    () =>
      mutateFinance(f, (s, r) => approveBatch(s, r, f.project.id, data, admin)),
    /CUTOFF/,
  );
  const batch = mutateFinance(f, (s, r) =>
    approveBatch(s, r, f.project.id, data, admin, p.cutoff),
  );
  assert.equal(
    mutateFinance(f, (s, r) =>
      approveBatch(s, r, f.project.id, data, admin, p.cutoff),
    ).id,
    batch.id,
  );
  assert.throws(
    () =>
      mutateFinance(f, (s, r) =>
        approveBatch(
          s,
          r,
          f.project.id,
          { ...data, idempotencyKey: "another" },
          admin,
          p.cutoff,
        ),
      ),
    /NO_RECONCILED/,
  );
  assert.equal(
    f.store.records.operationTotals(f.project.id).reservedBaseCents,
    1000,
  );
  const exported = exportBatch(
    f.store.read(),
    f.store.records,
    batch.id,
    admin,
    "csv",
  );
  assert.equal(
    exported.content,
    exportBatch(f.store.read(), f.store.records, batch.id, admin, "csv")
      .content,
  );
  assert(exported.content.includes(batch.id));
  assert(exported.content.includes("journalSourceIds"));
  assert(!exported.content.includes("sourceAccountId"));
  assert(!exported.content.includes("donor"));
  const execute = (outcome, key) =>
    mutateFinance(f, (s, r) =>
      executeBatch(
        s,
        r,
        batch.id,
        {
          idempotencyKey: key,
          outcome,
          evidenceRef: "fictional transfer fixture",
        },
        admin,
        p.cutoff,
      ),
    );
  const unknown = execute("unknown", "try1"),
    failed = execute("failed", "try2");
  assert.equal(
    unknown.intents[0].transferIntentId,
    failed.intents[0].transferIntentId,
  );
  assert.equal(
    f.store.records.operationTotals(f.project.id).reservedBaseCents,
    1000,
  );
  assert.throws(() => execute("paid", "live"));
  const paid = execute("simulated_paid", "try3");
  assert.equal(paid.status, "simulated_paid");
  execute("simulated_paid", "try3");
  execute("simulated_paid", "try4");
  const totals = f.store.records.operationTotals(f.project.id);
  assert.equal(totals.reservedBaseCents, 0);
  assert.equal(totals.paidBaseCents, 1000);
  const raw = new DatabaseSync(join(f.dir, "test.sqlite"));
  assert.throws(
    () =>
      raw
        .prepare("UPDATE settlement_manifests SET document=? WHERE id=?")
        .run(JSON.stringify({ status: "paid" }), batch.id),
    /Immutable/,
  );
  raw.close();
  const refused = await f.request(`/settlements/${batch.id}/execute`, {
    method: "POST",
    role: "creator",
    body: { status: "paid" },
  });
  assert.equal(refused.status, 403);
});

test("refund after approval blocks stale payment; refund after simulated payment creates recovery and linked next-week correction without editing batch", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    gift = f.gift();
  f.send(gift, "capture");
  f.send(gift, "settlement");
  const batch = mutateFinance(f, (s, r) =>
    approveBatch(
      s,
      r,
      f.project.id,
      { idempotencyKey: "original", periodId: p.id, creatorIds: [f.creatorId] },
      admin,
      p.cutoff,
    ),
  );
  const manifestBefore = exportBatch(
    f.store.read(),
    f.store.records,
    batch.id,
    admin,
  ).content;
  const result = mutateFinance(f, (s, r) =>
    executeBatch(
      s,
      r,
      batch.id,
      {
        idempotencyKey: "pay",
        outcome: "simulated_paid",
        evidenceRef: "fictional transfer",
      },
      admin,
      p.cutoff,
    ),
  );
  assert.equal(result.status, "simulated_paid");
  const next = mutateFinance(f, (s, r) =>
    definePeriod(
      s,
      r,
      f.project.id,
      {
        startsAt: p.endsAt,
        endsAt: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
        cutoff: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
      },
      admin,
    ),
  );
  const lateAt = new Date(Date.parse(p.cutoff) + 1000).toISOString();
  const refund = mutateFinance(f, (s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(gift, "refund", 10000, { effectiveAt: lateAt }),
      lateAt,
    ),
  );
  let statement = creatorStatement(
    f.store.records,
    f.project.id,
    f.creatorId,
    next,
  );
  assert.equal(statement.recoveryCents, 1000);
  assert.equal(statement.recoveryHold, true);
  assert.equal(statement.payableCents, 0);
  financeEvidence("postPaymentRecovery", {
    fiction: true,
    statement,
    transfer: result,
    refundSourceId: refund.event.id,
    recoveryOperations: f
      .rows("finance_operations")
      .filter((o) => o.kind === "recovery_hold"),
  });
  assert(
    statement.adjustments.some(
      (a) =>
        a.sourceRecordId === refund.event.id && a.originalPeriodId === p.id,
    ),
  );
  assert.equal(
    exportBatch(f.store.read(), f.store.records, batch.id, admin).content,
    manifestBefore,
  );
  assert.equal(
    f.rows("finance_operations").find((o) => o.kind === "recovery_hold")
      .originalPeriodId,
    p.id,
  );
  mutateFinance(f, (s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(gift, "refund", 10000, { effectiveAt: lateAt }),
      lateAt,
    ),
  );
  assert.equal(
    f.rows("finance_operations").filter((o) => o.kind === "recovery_hold")
      .length,
    1,
  );
  const stale = await financeFixture(t),
    week = fictionalWeek(stale),
    c = stale.gift();
  stale.send(c, "capture");
  stale.send(c, "settlement");
  const pendingBatch = mutateFinance(stale, (s, r) =>
    approveBatch(
      s,
      r,
      stale.project.id,
      {
        idempotencyKey: "pending",
        periodId: week.id,
        creatorIds: [stale.creatorId],
      },
      admin,
      week.cutoff,
    ),
  );
  stale.send(c, "refund");
  assert.throws(
    () =>
      mutateFinance(stale, (s, r) =>
        executeBatch(
          s,
          r,
          pendingBatch.id,
          {
            idempotencyKey: "pay",
            outcome: "simulated_paid",
            evidenceRef: "fictional stale payment",
          },
          admin,
          week.cutoff,
        ),
      ),
    /STALE_BATCH/,
  );
  assert.equal(
    stale.store.records.operationTotals(stale.project.id).reservedBaseCents,
    1000,
  );
  assert.equal(
    stale.store.records.operationTotals(stale.project.id).paidBaseCents,
    0,
  );
});

test("late in-window capture/settlement receipts enter the next exact week linked to the closed original period", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    early = f.gift();
  f.send(early, "capture");
  f.send(early, "settlement");
  const batch = mutateFinance(f, (s, r) =>
    approveBatch(
      s,
      r,
      f.project.id,
      { idempotencyKey: "oldweek", periodId: p.id, creatorIds: [f.creatorId] },
      admin,
      p.cutoff,
    ),
  );
  mutateFinance(f, (s, r) =>
    executeBatch(
      s,
      r,
      batch.id,
      {
        idempotencyKey: "oldpay",
        outcome: "simulated_paid",
        evidenceRef: "fictional original payment",
      },
      admin,
      p.cutoff,
    ),
  );
  const originalExport = exportBatch(
    f.store.read(),
    f.store.records,
    batch.id,
    admin,
  ).content;
  const late = f.gift(20000);
  const receiptAt = new Date(Date.parse(p.endsAt) + 1000).toISOString();
  const effectiveAt = new Date().toISOString();
  mutateFinance(f, (s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(late, "capture", 20000, { effectiveAt }),
      receiptAt,
    ),
  );
  const settled = mutateFinance(f, (s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(late, "settlement", 20000, { effectiveAt }),
      receiptAt,
    ),
  );
  const next = mutateFinance(f, (s, r) =>
    definePeriod(
      s,
      r,
      f.project.id,
      {
        startsAt: p.endsAt,
        endsAt: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
        cutoff: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
      },
      admin,
    ),
  );
  const statement = creatorStatement(
    f.store.records,
    f.project.id,
    f.creatorId,
    next,
  );
  assert.equal(statement.payableCents, 2000);
  assert.equal(statement.priorPaymentsCents, 1000);
  assert(
    statement.adjustments.some(
      (a) =>
        a.sourceRecordId === settled.event.id &&
        a.originalPeriodId === p.id &&
        a.adjustmentPeriodId === next.id,
    ),
  );
  assert.equal(
    exportBatch(f.store.read(), f.store.records, batch.id, admin).content,
    originalExport,
  );
  const nextBatch = mutateFinance(f, (s, r) =>
    approveBatch(
      s,
      r,
      f.project.id,
      {
        idempotencyKey: "late-adjustment",
        periodId: next.id,
        creatorIds: [f.creatorId],
      },
      admin,
      next.cutoff,
    ),
  );
  assert.equal(nextBatch.manifest.lines[0].amountCents, 2000);
  assert(
    nextBatch.manifest.lines[0].adjustments.every(
      (a) => a.originalPeriodId === p.id,
    ),
  );
  financeEvidence("lateReceiptAdjustment", {
    fiction: true,
    originalBatchId: batch.id,
    nextBatch: nextBatch.manifest,
  });
});

test("sponsor costs name the business, immutable internal source/journal facts share rollback, restart and indexed capped pages", async (t) => {
  const f = await financeFixture(t, { paid: true, payer: "sponsor" });
  settleSupport(f, 10000, [
    { purpose: "media", use: "ad_budget", amountCents: 10000 },
  ]);
  const before = {
    reservations: f.rows("reservations").length,
    operations: f.rows("finance_operations").length,
    journal: f.rows("journal_transactions").length,
    sources: f.rows("source_events").length,
  };
  assert.throws(
    () =>
      mutateFinance(f, (s, r) => {
        reserveMedia(
          s,
          r,
          f.distribution.id,
          { idempotencyKey: "rollback", amountCents: 6000 },
          admin,
        );
        s.projects[0].title = "must roll back";
        throw new Error("Injected reservation failure");
      }),
    /Injected/,
  );
  assert.deepEqual(
    {
      reservations: f.rows("reservations").length,
      operations: f.rows("finance_operations").length,
      journal: f.rows("journal_transactions").length,
      sources: f.rows("source_events").length,
    },
    before,
  );
  assert.notEqual(f.store.read().projects[0].title, "must roll back");
  const reservation = mutateFinance(f, (s, r) =>
    reserveMedia(
      s,
      r,
      f.distribution.id,
      { idempotencyKey: "sponsor", amountCents: 6000 },
      admin,
    ),
  );
  assert.equal(reservation.payerId, "fictional-finance-sponsor");
  const spend = mutateFinance(f, (s, r) =>
    spendMedia(
      s,
      r,
      reservation.id,
      {
        idempotencyKey: "bill",
        amountCents: 4000,
        effectiveAt: new Date().toISOString(),
        evidenceRef: "fictional sponsor invoice",
      },
      admin,
    ),
  );
  assert.equal(spend.payer, "sponsor");
  assert.equal(spend.payerId, "fictional-finance-sponsor");
  const source = f.store.records.get("source_events", spend.sourceRecordId);
  assert.equal(source.sourceKind, "finance_operation");
  assert.equal(source.contributionId, spend.id);
  const tx = f.store.records.get("journal_transactions", spend.transactionId);
  assert.equal(tx.sourceRecordId, source.id);
  assert.equal(
    f.store.records.operationTotals(f.project.id).creatorMediaCostCents,
    0,
  );
  const report = await f.request(`/campaigns/${f.project.id}/finance`);
  assert.equal(report.data.availableMediaCents, 4000);
  assert.equal(report.data.settledBeforeCommitments.availableMediaCents, 10000);
  const plans = f.store.records.settlementQueryPlans();
  for (const plan of Object.values(plans))
    assert(
      plan.some((r) => /USING (COVERING )?INDEX/.test(r.detail)),
      JSON.stringify(plan),
    );
  const raw = new DatabaseSync(join(f.dir, "test.sqlite"));
  for (const table of ["finance_operations", "reservations"]) {
    assert.throws(
      () => raw.exec(`UPDATE ${table} SET effective_at='2000'`),
      /Immutable/,
    );
    assert.throws(() => raw.exec(`DELETE FROM ${table}`), /Immutable/);
  }
  raw.close();
  const restarted = createStore(join(f.dir, "test.sqlite"));
  assert.equal(restarted.migrationBackup, null);
  assert.deepEqual(
    mediaBalance(restarted.records, f.project.id),
    mediaBalance(f.store.records, f.project.id),
  );
  restarted.close();
  assert(!JSON.stringify(f.store.read()).includes(spend.id));
});

test("v3 migration backs up v2 rows and rolls back new tables and triggers on failure", async (t) => {
  const f = await financeFixture(t),
    c = f.support();
  f.send(c, "capture");
  f.send(c, "settlement");
  const filename = join(f.dir, "test.sqlite"),
    raw = new DatabaseSync(filename);
  raw.exec(
    "DELETE FROM schema_migrations WHERE version>=3; DROP TABLE finance_operations; DROP TABLE settlement_periods; DROP TABLE settlement_results;",
  );
  raw.close();
  const oldState = f.store.read(),
    oldTotals = f.store.records.financeTotals(f.project.id);
  assert.throws(
    () =>
      createStore(filename, true, {
        migrationHook(stage) {
          if (stage === "afterSchema") throw new Error("Injected v3 failure");
        },
      }),
    /Injected v3/,
  );
  const failed = new DatabaseSync(filename);
  assert.equal(
    failed.prepare("SELECT MAX(version) AS n FROM schema_migrations").get().n,
    2,
  );
  assert.equal(
    failed
      .prepare("SELECT name FROM sqlite_master WHERE name='finance_operations'")
      .get(),
    undefined,
  );
  failed.close();
  const restored = createStore(filename);
  assert(restored.migrationBackup.includes("backup-v3"));
  t.after(() =>
    rmSync(restored.migrationBackup, { recursive: true, force: true }),
  );
  assert.deepEqual(restored.read(), oldState);
  assert.deepEqual(restored.records.financeTotals(f.project.id), oldTotals);
  assert.equal(restored.records.position(c.id).settledCents, c.amountCents);
  restored.close();
});

test("late guarantee correction retains its original finite week and holds a stale approved intent", async (t) => {
  const f = await financeFixture(t),
    p = fictionalWeek(f),
    gift = f.gift();
  f.send(gift, "capture");
  f.send(gift, "settlement");
  settleSupport(f, 2500, [
    { purpose: "seed", use: "guarantee", amountCents: 2500 },
  ]);
  newTerms(f, { guarantee: promiseFor(f, p) });
  const old = mutateFinance(f, (s, r) =>
    approveBatch(
      s,
      r,
      f.project.id,
      { idempotencyKey: "oldfloor", periodId: p.id, creatorIds: [f.creatorId] },
      admin,
      p.cutoff,
    ),
  );
  const next = mutateFinance(f, (s, r) =>
    definePeriod(
      s,
      r,
      f.project.id,
      {
        startsAt: p.endsAt,
        endsAt: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
        cutoff: new Date(Date.parse(p.endsAt) + 7 * 86400000).toISOString(),
      },
      admin,
    ),
  );
  const receivedAt = new Date(Date.parse(p.cutoff) + 1000).toISOString();
  mutateFinance(f, (s, r) =>
    ingestEvent(
      s,
      r,
      f.eventData(gift, "refund", 5000, {
        effectiveAt: new Date().toISOString(),
      }),
      receivedAt,
    ),
  );
  const statement = creatorStatement(
    f.store.records,
    f.project.id,
    f.creatorId,
    next,
  );
  const adjustment = statement.guaranteeAdjustments.find(
    (g) => g.originalPeriodId === p.id,
  );
  assert.equal(adjustment.topUpCents, 2000);
  assert.equal(adjustment.newTopUpCents, 500);
  assert.equal(statement.payableCents, 0);
  assert(statement.heldReasons.includes("APPROVED_BATCH_RECONCILIATION_HOLD"));
  assert.equal(
    f.store.records.get("settlement_manifests", old.id).manifest.lines[0]
      .amountCents,
    2500,
  );
});
