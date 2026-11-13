import assert from "node:assert/strict";
import { campaignRules } from "./fixtures.ts";
import { mutation, preparePublicCreator } from "./public-fixtures.ts";
import { pngBytes } from "./photo-fixtures.ts";

export const donationRules = {
  ...campaignRules,
  campaignStart: "2026-01-05T06:00:00.000Z",
  campaignEnd: "2026-11-09T06:00:00.000Z",
  earningStart: "2026-01-01T06:00:00.000Z",
  earningEnd: "2026-11-10T06:00:00.000Z",
};
export async function fundraisingEntry(
  backend: any,
  base: string,
  prefix = "fundraising",
  campaignId = "adoption",
) {
  const manager = backend.client(
      campaignId === "adoption" ? "manager-a" : "manager-b",
    ),
    creator = backend.client("public-creator"),
    scope = { campaignId };
  await mutation(manager, "campaignSetup:create", {
    ...scope,
    operationId: `${prefix}-rules`,
    rules: donationRules,
  });
  await backend.command(
    "run",
    "fixtures:terms",
    JSON.stringify({ campaignSlug: campaignId, synthetic: true }),
  );
  await preparePublicCreator(
    manager,
    creator,
    `${prefix}-participant`,
    campaignId,
  );
  const bytes = await pngBytes(),
    upload = await mutation(creator, "photos:reserve", {
      ...scope,
      operationId: `${prefix}-upload`,
      filename: "source.png",
      size: bytes.length,
      type: "image/png",
    });
  const headers = {
    Authorization: `Bearer ${backend.token("public-creator")}`,
  };
  for (const [action, init] of [
    ["local-upload", { method: "PUT", body: bytes, headers }],
    ["verify", { method: "POST", headers }],
  ] as const) {
    const response = await fetch(
      `${base}/api/photos?action=${action}&uploadId=${upload._id}&campaignId=${campaignId}`,
      init,
    );
    assert.equal(response.status, 200, await response.clone().text());
  }
  const entry = await mutation(creator, "photos:submit", {
    ...scope,
    operationId: `${prefix}-submit`,
    title: "Families together",
    description: "Approved fundraising creative.",
    publicCreatorName: "River Studio",
    photos: [upload._id],
  });
  await mutation(manager, "photos:review", {
    ...scope,
    entryId: entry._id,
    expectedVersion: 1,
    operationId: `${prefix}-approve`,
    decision: "approved",
    reason: "",
  });
  await backend.runOwnedInternal("fixtures:fundraisingControl", {
    entryId: entry._id,
    approvedAt: Date.parse(donationRules.earningStart),
  });
  return entry;
}
