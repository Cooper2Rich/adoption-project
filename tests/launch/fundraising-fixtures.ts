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
  creatorSubject = "public-creator",
  publicCreatorName = "River Studio",
  onStage: (stage: string) => void = () => {},
) {
  const manager = backend.client(
      campaignId === "adoption" ? "manager-a" : "manager-b",
    ),
    creator = backend.client(creatorSubject),
    scope = { campaignId };
  let existingCampaign = false;
  onStage("before-campaign-rules");
  try {
    await mutation(manager, "campaignSetup:create", {
      ...scope,
      operationId: `${prefix}-rules`,
      rules: donationRules,
    });
  } catch (error) {
    if (!String(error).includes("RULES_LOCKED")) throw error;
    existingCampaign = true;
  }
  onStage("after-campaign-rules");
  if (!existingCampaign)
    await backend.runOwnedInternal("fixtures:terms", {
      campaignSlug: campaignId,
      synthetic: true,
    });
  onStage("after-owned-terms");
  await preparePublicCreator(
    manager,
    creator,
    `${prefix}-participant`,
    campaignId,
    creatorSubject,
    onStage,
  );
  onStage("after-authenticated-creator-participation");
  const bytes = await pngBytes(),
    upload = await mutation(creator, "photos:reserve", {
      ...scope,
      operationId: `${prefix}-upload`,
      filename: "source.png",
      size: bytes.length,
      type: "image/png",
    });
  onStage("after-photo-reserve");
  const headers = {
    Authorization: `Bearer ${backend.token(creatorSubject)}`,
  };
  for (const [action, init] of [
    ["local-upload", { method: "PUT", body: bytes, headers }],
    ["verify", { method: "POST", headers }],
  ] as const) {
    onStage(`before-photo-${action}`);
    const response = await fetch(
      `${base}/api/photos?action=${action}&uploadId=${upload._id}&campaignId=${campaignId}`,
      init,
    );
    assert.equal(response.status, 200, await response.clone().text());
    onStage(`after-photo-${action}`);
  }
  const entry = await mutation(creator, "photos:submit", {
    ...scope,
    operationId: `${prefix}-submit`,
    title: "Families together",
    description: "Approved fundraising creative.",
    publicCreatorName,
    photos: [upload._id],
  });
  onStage("after-photo-submit");
  await mutation(manager, "photos:review", {
    ...scope,
    entryId: entry._id,
    expectedVersion: 1,
    operationId: `${prefix}-approve`,
    decision: "approved",
    reason: "",
  });
  onStage("after-manager-approval");
  await backend.runOwnedInternal("fixtures:fundraisingControl", {
    entryId: entry._id,
    approvedAt: Date.parse(donationRules.earningStart),
  });
  onStage("after-owned-approval-time-control");
  return entry;
}
