import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mutation, query } from "./public-fixtures.ts";
export const standingsDay = {
  start: Date.parse("2026-02-01T06:00:00Z"),
  end: Date.parse("2026-02-02T06:00:00Z"),
};
export async function certify(
  backend: any,
  entryId: string,
  metric: string,
  value: number,
  range = standingsDay,
) {
  const client = backend.client("manager-a"),
    scope = { campaignId: "adoption", entryId, metric, ...range },
    prior = await query(client, "paidCorrections:inspect", scope),
    read = await query(client, "paidMetrics:read", { campaignId: "adoption" });
  return mutation(client, "paidCorrections:save", {
    ...scope,
    value,
    certified: true,
    reason: "Reviewed exact competition input",
    source: "Owned manager worksheet",
    evidence: "owned-exact-source-v1",
    expectedInputFingerprint: prior.inputFingerprint,
    expectedRevision: read.correctionState.revision,
    operationId: randomUUID(),
  });
}
export async function emptyFundraising(
  backend: any,
  entryId: string,
  kind = "daily",
  period = "2026-02-01",
  range = standingsDay,
) {
  return backend.runOwnedInternal("fixtures:standingsZero", {
    entryId,
    kind,
    period,
    ...range,
  });
}
export async function donate(
  backend: any,
  base: string,
  entryId: string,
  amountCents: number,
  at = standingsDay.start,
) {
  const r = await fetch(base + "/api/fundraising?action=checkout", {
    method: "POST",
    body: JSON.stringify({
      operationId: randomUUID(),
      token:
        randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
      amountCents,
      entryId,
    }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  const sid = new URL((await r.json()).url).pathname.split("/").at(-1)!,
    event = backend.stripe.complete(sid, { at, fee: 32 });
  const delivered = await backend.stripe.deliver(
    event,
    base + "/api/fundraising?action=webhook",
  );
  assert.equal(delivered.status, 200, await delivered.clone().text());
  return sid;
}
