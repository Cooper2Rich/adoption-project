import { makeFunctionReference } from "convex/server";
import type { Doc } from "../../convex/functions.ts";
const campaign = { campaignId: "adoption" };
export { campaign };
export const creatorApi = {
  history: makeFunctionReference<
    "query",
    { campaignId: string },
    Pick<
      Doc<"clerkInvitationJournal">,
      | "invitationId"
      | "kind"
      | "state"
      | "actor"
      | "source"
      | "version"
      | "at"
      | "updatedAt"
      | "history"
    >[]
  >("creatorAccess:providerHistory"),
  manager: makeFunctionReference<
    "query",
    { campaignId: string },
    Doc<"creatorInvitations">[]
  >("creatorAccess:managerWorkspace"),
  invite: makeFunctionReference<
    "mutation",
    { campaignId: string; email: string; operationId: string },
    Doc<"creatorInvitations">
  >("creatorAccess:invite"),
  revoke: makeFunctionReference<
    "mutation",
    {
      campaignId: string;
      invitationId: Doc<"creatorInvitations">["_id"];
      operationId: string;
    },
    { revoked: boolean }
  >("creatorAccess:revoke"),
  workspace: makeFunctionReference<
    "query",
    { campaignId: string; invitationId?: Doc<"creatorInvitations">["_id"] },
    {
      name: string;
      subject: string;
      invitation: Doc<"creatorInvitations">;
      terms: Doc<"participationTerms"> | null;
      acceptance: Doc<"participationAcceptances"> | null;
    }
  >("creatorAccess:workspace"),
  accept: makeFunctionReference<
    "mutation",
    {
      campaignId: string;
      invitationId: Doc<"creatorInvitations">["_id"];
      termsId: Doc<"participationTerms">["_id"];
      version: string;
      operationId: string;
      confirmed: boolean;
    },
    Doc<"participationAcceptances">
  >("creatorAccess:accept"),
  dispatch: makeFunctionReference<
    "action",
    {
      campaignId: string;
      invitationId: Doc<"creatorInvitations">["_id"];
      kind: "create" | "revoke";
    },
    { state: string }
  >("clerkInvitations:dispatch"),
  records: makeFunctionReference<
    "query",
    { campaignId: string },
    Pick<Doc<"creatorPrivateRecords">, "_id" | "kind" | "summary">[]
  >("creatorAccess:privateRecords"),
};
