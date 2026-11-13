import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { campaignRules as rules } from "./fixtures.ts";

export const query = (client: ConvexHttpClient, name: string, args: any = {}) =>
  client.query(makeFunctionReference<"query">(name), args);
export const mutation = (client: ConvexHttpClient, name: string, args: any) =>
  client.mutation(makeFunctionReference<"mutation">(name), args);
export async function preparePublicCreator(
  manager: ConvexHttpClient,
  creator: ConvexHttpClient,
  prefix: string,
  campaignId = "adoption",
  subject = "public-creator",
  onStage: (stage: string) => void = () => {},
) {
  const scope = { campaignId };
  try {
    await mutation(manager, "campaignSetup:create", {
      ...scope,
      operationId: `${prefix}-rules`,
      rules,
    });
  } catch (error) {
    if (!String(error).includes("RULES_LOCKED")) throw error;
  }
  const invitation = await mutation(manager, "creatorAccess:invite", {
    ...scope,
    email: `${subject}@creators.example`,
    operationId: `${prefix}-invite`,
  });
  onStage("after-creator-invite");
  await manager.action("clerkInvitations:dispatch", {
    ...scope,
    invitationId: invitation._id,
    kind: "create",
  });
  onStage("after-clerk-invitation-dispatch");
  const workspace = await query(creator, "creatorAccess:workspace", scope);
  onStage("after-creator-workspace");
  await mutation(creator, "creatorAccess:accept", {
    ...scope,
    invitationId: invitation._id,
    termsId: workspace.terms._id,
    version: workspace.terms.version,
    confirmed: true,
    operationId: `${prefix}-accept`,
  });
  onStage("after-creator-terms-acceptance");
}
