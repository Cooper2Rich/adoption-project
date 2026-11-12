import { v } from "convex/values";
import { query, mutation, type QueryCtx, type Doc } from "./functions.ts";
import {
  authorizedCampaign,
  operationIdentity,
  stableRequest,
} from "./access.ts";

const scope = { campaignId: v.string() };
const invitationArgs = { ...scope, invitationId: v.id("creatorInvitations") };
function denied(): never {
  throw new Error("FORBIDDEN: Creator access denied");
}
function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_EMAIL: Enter the invited email address");
  return email;
}
async function creator(
  ctx: QueryCtx,
  campaignId: string,
  invitationId?: Doc<"creatorInvitations">["_id"],
) {
  const identity = await ctx.auth.getUserIdentity();
  // OIDC maps the standard claim; custom-JWT verification retains its signed name.
  const verified = identity?.emailVerified ?? identity?.["email_verified"];
  if (!identity || verified !== true || !identity.email) denied();
  const email = normalizeEmail(identity.email);
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", campaignId))
    .unique();
  if (
    !campaign ||
    (campaign.fixtureRunId &&
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    denied();
  const invitation = invitationId
    ? await ctx.db.get(invitationId)
    : await ctx.db
        .query("creatorInvitations")
        .withIndex("by_campaign_email", (q) =>
          q.eq("campaignSlug", campaignId).eq("email", email),
        )
        .unique();
  if (
    !invitation ||
    invitation.campaignSlug !== campaignId ||
    invitation.nonprofitId !== campaign.nonprofitId ||
    !invitation.active ||
    invitation.providerState !== "confirmed" ||
    invitation.email !== email ||
    (invitation.subject && invitation.subject !== identity.subject)
  )
    denied();
  // Pre-signup invitations may lack membership; any existing revocation still wins.
  {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q
          .eq("subject", identity.subject)
          .eq("nonprofitId", campaign.nonprofitId),
      )
      .unique();
    if (
      (invitation.subject && !member) ||
      (member && (!member.active || member.role !== "creator"))
    )
      denied();
  }
  return { campaign, invitation, subject: identity.subject };
}
async function applicableTerms(ctx: QueryCtx, campaign: Doc<"campaigns">) {
  const terms = await ctx.db
    .query("participationTerms")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .unique();
  if (
    !terms ||
    terms.nonprofitId !== campaign.nonprofitId ||
    !terms.version.trim() ||
    !terms.title.trim() ||
    !terms.body.trim() ||
    !terms.approvedBy.trim() ||
    !(terms.approvedAt > 0)
  )
    return null;
  if (
    terms.synthetic &&
    (!campaign.fixtureRunId ||
      campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
  )
    return null;
  return terms;
}
export async function acceptedCreator(ctx: QueryCtx, campaignId: string) {
  const result = await creator(ctx, campaignId);
  const acceptance = await ctx.db
    .query("participationAcceptances")
    .withIndex("by_invitation", (q) =>
      q.eq("invitationId", result.invitation._id),
    )
    .unique();
  if (
    !acceptance ||
    acceptance.subject !== result.subject ||
    !result.invitation.subject
  )
    throw new Error(
      "ACCEPTANCE_REQUIRED: Complete participation signup before submission",
    );
  return { ...result, acceptance };
}
export const managerWorkspace = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const invitations = await ctx.db
      .query("creatorInvitations")
      .withIndex("by_campaign_email", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    return invitations.filter(
      (invitation) => invitation.nonprofitId === campaign.nonprofitId,
    );
  },
});
export const invite = mutation({
  args: { ...scope, email: v.string(), operationId: v.string() },
  handler: async (ctx, { campaignId, email: input, operationId }) => {
    const { campaign, subject } = await authorizedCampaign(ctx, campaignId);
    operationIdentity(operationId);
    const settings = await ctx.db
      .query("campaignSettings")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .unique();
    if (!settings)
      throw new Error(
        "RULES_REQUIRED: Lock campaign rules before inviting creators",
      );
    const email = normalizeEmail(input);
    const fingerprint = stableRequest({ action: "invited", email });
    const prior = await ctx.db
      .query("creatorAudit")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", campaignId)
          .eq("actor", subject)
          .eq("operationId", operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT");
      return await ctx.db.get(prior.invitationId);
    }
    if (
      await ctx.db
        .query("creatorInvitations")
        .withIndex("by_campaign_email", (q) =>
          q.eq("campaignSlug", campaignId).eq("email", email),
        )
        .unique()
    )
      throw new Error("ALREADY_INVITED: Inspect the existing invitation");
    const at = Date.now();
    const invitationId = await ctx.db.insert("creatorInvitations", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      email,
      providerState: "proposed",
      active: true,
      actor: subject,
      createdAt: at,
    });
    await ctx.db.insert("creatorAudit", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "creatorAccess:invite",
      at,
      version: "1",
      operationId,
      fingerprint,
      invitationId,
      action: "invited",
    });
    return await ctx.db.get(invitationId);
  },
});
export const revoke = mutation({
  args: { ...invitationArgs, operationId: v.string() },
  handler: async (ctx, { campaignId, invitationId, operationId }) => {
    const { campaign, subject } = await authorizedCampaign(ctx, campaignId);
    operationIdentity(operationId);
    const invitation = await ctx.db.get(invitationId);
    if (
      !invitation ||
      invitation.campaignSlug !== campaignId ||
      invitation.nonprofitId !== campaign.nonprofitId
    )
      denied();
    const fingerprint = stableRequest({ action: "revoked", invitationId });
    const prior = await ctx.db
      .query("creatorAudit")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", campaignId)
          .eq("actor", subject)
          .eq("operationId", operationId),
      )
      .unique();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new Error("OPERATION_CONFLICT");
      return { revoked: true };
    }
    await ctx.db.patch(invitationId, { active: false });
    if (invitation.subject) {
      const member = await ctx.db
        .query("memberships")
        .withIndex("by_subject_nonprofit", (q) =>
          q
            .eq("subject", invitation.subject!)
            .eq("nonprofitId", campaign.nonprofitId),
        )
        .unique();
      if (member?.role === "creator")
        await ctx.db.patch(member._id, { active: false });
    }
    await ctx.db.insert("creatorAudit", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "creatorAccess:revoke",
      at: Date.now(),
      version: "1",
      operationId,
      fingerprint,
      invitationId,
      action: "revoked",
    });
    return { revoked: true };
  },
});
export const workspace = query({
  args: { ...scope, invitationId: v.optional(v.id("creatorInvitations")) },
  handler: async (ctx, { campaignId, invitationId }) => {
    const { campaign, invitation, subject } = await creator(
      ctx,
      campaignId,
      invitationId,
    );
    const terms = await applicableTerms(ctx, campaign);
    const acceptance = await ctx.db
      .query("participationAcceptances")
      .withIndex("by_invitation", (q) => q.eq("invitationId", invitation._id))
      .unique();
    return {
      name: campaign.name,
      subject,
      invitation,
      terms,
      acceptance: acceptance?.subject === subject ? acceptance : null,
    };
  },
});
export const accept = mutation({
  args: {
    ...invitationArgs,
    termsId: v.id("participationTerms"),
    version: v.string(),
    operationId: v.string(),
    confirmed: v.boolean(),
  },
  handler: async (
    ctx,
    { campaignId, invitationId, termsId, version, operationId, confirmed },
  ) => {
    const { campaign, invitation, subject } = await creator(
      ctx,
      campaignId,
      invitationId,
    );
    operationIdentity(operationId);
    if (!confirmed) throw new Error("CONFIRMATION_REQUIRED");
    const currentTerms = await applicableTerms(ctx, campaign);
    if (
      !currentTerms ||
      currentTerms._id !== termsId ||
      currentTerms.version !== version
    )
      throw new Error(
        "TERMS_UNAVAILABLE: Actual applicable terms are required before signup or submission",
      );
    const prior = await ctx.db
      .query("participationAcceptances")
      .withIndex("by_invitation", (q) => q.eq("invitationId", invitationId))
      .unique();
    if (prior) {
      if (
        prior.subject !== subject ||
        prior.termsId !== termsId ||
        prior.version !== version
      )
        throw new Error(
          "OPERATION_CONFLICT: Accepted terms cannot be replaced",
        );
      return prior;
    }
    const terms = currentTerms;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_subject_nonprofit", (q) =>
        q.eq("subject", subject).eq("nonprofitId", campaign.nonprofitId),
      )
      .unique();
    if (membership && (membership.role !== "creator" || !membership.active))
      denied();
    const fingerprint = stableRequest({
      action: "accepted",
      invitationId,
      termsId,
      version,
    });
    const operation = await ctx.db
      .query("creatorAudit")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", campaignId)
          .eq("actor", subject)
          .eq("operationId", operationId),
      )
      .unique();
    if (operation) throw new Error("OPERATION_CONFLICT");
    const acceptedAt = Date.now();
    const id = await ctx.db.insert("participationAcceptances", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      invitationId,
      subject,
      termsId,
      version,
      termsTitle: terms.title,
      termsBody: terms.body,
      synthetic: terms.synthetic,
      acceptedAt,
      source: "creatorAccess:accept",
      operationId,
    });
    await ctx.db.patch(invitation._id, { subject });
    if (!membership)
      await ctx.db.insert("memberships", {
        subject,
        nonprofitId: campaign.nonprofitId,
        role: "creator",
        active: true,
      });
    await ctx.db.insert("creatorAudit", {
      campaignSlug: campaignId,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "creatorAccess:accept",
      at: acceptedAt,
      version,
      operationId,
      fingerprint,
      invitationId,
      action: "accepted",
    });
    return await ctx.db.get(id);
  },
});
export async function requireSubmissionParticipant(
  ctx: QueryCtx,
  campaignId: string,
) {
  const result = await acceptedCreator(ctx, campaignId);
  const terms = await applicableTerms(ctx, result.campaign);
  if (!terms || terms._id !== result.acceptance.termsId)
    throw new Error("TERMS_UNAVAILABLE: Submission is blocked");
  return result;
}
// This gate is shared with future submission intake; it grants no upload or publication.
export const submissionAccess = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { acceptance } = await requireSubmissionParticipant(ctx, campaignId);
    return {
      permitted: true,
      acceptanceId: acceptance._id,
      version: acceptance.version,
    };
  },
});
export const privateRecord = query({
  args: { ...scope, recordId: v.id("creatorPrivateRecords") },
  handler: async (ctx, { campaignId, recordId }) => {
    const { campaign, subject } = await acceptedCreator(ctx, campaignId);
    const record = await ctx.db.get(recordId);
    if (
      !record ||
      record.subject !== subject ||
      record.campaignSlug !== campaignId ||
      record.nonprofitId !== campaign.nonprofitId
    )
      denied();
    return { kind: record.kind, summary: record.summary };
  },
});
export const privateRecords = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { subject, campaign } = await acceptedCreator(ctx, campaignId);
    const records = await ctx.db
      .query("creatorPrivateRecords")
      .withIndex("by_owner", (q) =>
        q.eq("campaignSlug", campaignId).eq("subject", subject),
      )
      .collect();
    return records
      .filter((record) => record.nonprofitId === campaign.nonprofitId)
      .map((record) => ({
        _id: record._id,
        kind: record.kind,
        summary: record.summary,
      }));
  },
});
export const audit = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    await authorizedCampaign(ctx, campaignId);
    return await ctx.db
      .query("creatorAudit")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
      .collect();
  },
});
export const publicCampaign = query({
  args: {},
  handler: async (ctx) => {
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", "adoption"))
      .unique();
    return campaign ? { name: campaign.name, slug: campaign.slug } : null;
  },
});

export const providerHistory = query({
  args: scope,
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const invitations = await ctx.db
      .query("creatorInvitations")
      .withIndex("by_campaign_email", (q) => q.eq("campaignSlug", campaignId))
      .collect();
    const rows = await Promise.all(
      invitations
        .filter((i) => i.nonprofitId === campaign.nonprofitId)
        .map((i) =>
          ctx.db
            .query("clerkInvitationJournal")
            .withIndex("by_invitation_kind", (q) => q.eq("invitationId", i._id))
            .collect(),
        ),
    );
    return rows.flat().map((row) => ({
      invitationId: row.invitationId,
      kind: row.kind,
      state: row.state,
      actor: row.actor,
      source: row.source,
      version: row.version,
      at: row.at,
      updatedAt: row.updatedAt,
      history: row.history,
    }));
  },
});
