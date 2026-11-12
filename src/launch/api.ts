import { makeFunctionReference } from "convex/server";
import type {
  AllocationInput,
  AllocationResult,
} from "../../convex/allocation/planner.ts";
import type { CampaignRules } from "../../convex/campaignRules.ts";

export type CampaignSettings = {
  _id: string;
  rules: CampaignRules;
  version: 1;
  acceptedTermsVersion: string;
  actor: string;
  source: string;
  createdAt: number;
  operationId: string;
  batchPreparation: { weekday: 3; time: "12:00"; timezone: "America/Chicago" };
};
export type CampaignWorkspace = {
  name: string;
  slug: string;
  nonprofitId: string;
  subject: string;
  isAdministrator: boolean;
  settings: CampaignSettings | null;
};
export const setupApi = {
  workspace: makeFunctionReference<
    "query",
    { campaignId: string },
    CampaignWorkspace
  >("campaignSetup:workspace"),
  create: makeFunctionReference<
    "mutation",
    { campaignId: string; operationId: string; rules: CampaignRules },
    CampaignSettings
  >("campaignSetup:create"),
};

export type SavedPreview = {
  _id: string;
  campaignSlug: string;
  operationId: string;
  actor: string;
  createdAt: number;
  input: AllocationInput;
  result: AllocationResult;
};
export type Campaign = {
  name: string;
  slug: string;
  nonprofitId: string;
  subject: string;
  authority: AllocationInput["authority"];
};
export type Incident = {
  _id: string;
  status: "open" | "resolved";
  simulated: true;
  recipients: string[];
  reasons: string[];
  incompleteEntryIds: string[];
  history: { state: string; at: number }[];
};
export const previewApi = {
  campaign: makeFunctionReference<"query", { campaignId: string }, Campaign>(
    "preview:campaign",
  ),
  list: makeFunctionReference<"query", { campaignId: string }, SavedPreview[]>(
    "preview:list",
  ),
  save: makeFunctionReference<
    "mutation",
    { campaignId: string; operationId: string; input: AllocationInput },
    SavedPreview
  >("preview:save"),
  incidents: makeFunctionReference<"query", { campaignId: string }, Incident[]>(
    "preview:notifications",
  ),
};

export async function harnessSession(): Promise<{
  url: string;
  token: string;
}> {
  const response = await fetch("/__allocation/session", { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Start the isolated preview workspace with npm run dev:launch.",
    );
  const session = await response.json();
  const target = new URL(session.url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1")
    throw new Error(
      "The preview workspace requires its isolated local backend.",
    );
  return session;
}
