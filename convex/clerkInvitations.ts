import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalMutation, internalQuery } from "./functions.ts";
import type { Doc } from "./functions.ts";
import { authorizedCampaign } from "./access.ts";
const args = {
  campaignId: v.string(),
  invitationId: v.id("creatorInvitations"),
  kind: v.union(v.literal("create"), v.literal("revoke")),
};
type DispatchArgs = {
  campaignId: string;
  invitationId: Doc<"creatorInvitations">["_id"];
  kind: "create" | "revoke";
};
type Context = { invitation: Doc<"creatorInvitations">; fixture: boolean };
const contextRef = makeFunctionReference<"query", DispatchArgs, Context>(
  "clerkInvitations:context",
);
const beginRef = makeFunctionReference<
  "mutation",
  DispatchArgs,
  { reconcile: boolean; confirmed: boolean }
>("clerkInvitations:begin");
const finishRef = makeFunctionReference<
  "mutation",
  DispatchArgs & {
    state: "unknown" | "confirmed" | "failed";
    providerId?: string;
  },
  null
>("clerkInvitations:finish");

export const context = internalQuery({
  args,
  handler: async (ctx, { campaignId, invitationId, kind }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    const invitation = await ctx.db.get(invitationId);
    if (
      !invitation ||
      invitation.campaignSlug !== campaignId ||
      invitation.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN");
    if (kind === "revoke" && invitation.active)
      throw new Error("REVOKE_APPLICATION_ACCESS_FIRST");
    if (kind === "create" && !invitation.active)
      throw new Error("INVITATION_REVOKED");
    return {
      invitation,
      fixture:
        !!campaign.fixtureRunId &&
        campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID,
    };
  },
});
export const begin = internalMutation({
  args,
  handler: async (ctx, values) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      values.campaignId,
    );
    const invitation = await ctx.db.get(values.invitationId);
    if (
      !invitation ||
      invitation.campaignSlug !== campaign.slug ||
      invitation.nonprofitId !== campaign.nonprofitId ||
      (values.kind === "create" && !invitation.active) ||
      (values.kind === "revoke" && invitation.active)
    )
      throw new Error("FORBIDDEN");
    const prior = await ctx.db
      .query("clerkInvitationJournal")
      .withIndex("by_invitation_kind", (q) =>
        q.eq("invitationId", values.invitationId).eq("kind", values.kind),
      )
      .unique();
    if (prior && prior.state !== "failed")
      return { confirmed: prior.state === "confirmed", reconcile: true };
    const at = Date.now();
    if (prior)
      await ctx.db.patch(prior._id, {
        state: "dispatched",
        updatedAt: at,
        history: [
          ...prior.history,
          { state: "dispatched", actor: subject, at },
        ],
      });
    else
      await ctx.db.insert("clerkInvitationJournal", {
        campaignSlug: campaign.slug,
        nonprofitId: campaign.nonprofitId,
        invitationId: values.invitationId,
        kind: values.kind,
        state: "dispatched",
        actor: subject,
        source: "clerkInvitations:dispatch",
        version: 1,
        at,
        updatedAt: at,
        history: [{ state: "dispatched", actor: subject, at }],
      });
    return { confirmed: false, reconcile: false };
  },
});
export const finish = internalMutation({
  args: {
    ...args,
    state: v.union(
      v.literal("unknown"),
      v.literal("confirmed"),
      v.literal("failed"),
    ),
    providerId: v.optional(v.string()),
  },
  handler: async (ctx, values) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      values.campaignId,
    );
    const invitation = await ctx.db.get(values.invitationId);
    if (
      !invitation ||
      invitation.campaignSlug !== campaign.slug ||
      invitation.nonprofitId !== campaign.nonprofitId
    )
      throw new Error("FORBIDDEN");
    const journal = await ctx.db
      .query("clerkInvitationJournal")
      .withIndex("by_invitation_kind", (q) =>
        q.eq("invitationId", values.invitationId).eq("kind", values.kind),
      )
      .unique();
    if (!journal) throw new Error("JOURNAL_REQUIRED");
    // A later uncertain read must not replace a confirmed write from a concurrent request.
    if (journal.state === "confirmed") return null;
    const at = Date.now();
    await ctx.db.patch(journal._id, {
      state: values.state,
      ...(values.providerId ? { providerId: values.providerId } : {}),
      updatedAt: at,
      history: [
        ...journal.history,
        { state: values.state, actor: subject, at },
      ],
    });
    if (
      values.kind === "create" &&
      values.state === "confirmed" &&
      values.providerId
    )
      await ctx.db.patch(invitation._id, {
        providerState: "confirmed",
        providerId: values.providerId,
      });
    return null;
  },
});

// Clerk sends the actual invitation and owns its token/session/recovery behavior.
// Application permission is independent and remains denied until confirmation.
export const dispatch = action({
  args,
  handler: async (ctx, values): Promise<{ state: string }> => {
    const { invitation, fixture } = await ctx.runQuery(contextRef, values);
    const fixtureUrl = process.env.CLERK_INVITATION_FIXTURE_URL;
    let base = "https://api.clerk.com/v1";
    let key = process.env.CLERK_SECRET_KEY;
    if (fixtureUrl) {
      const url = new URL(fixtureUrl);
      if (
        !fixture ||
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("FIXTURE_ADAPTER_FORBIDDEN");
      base = fixtureUrl;
      key = "owned-synthetic-clerk-fixture";
    }
    const redirect = process.env.CLERK_CREATOR_REDIRECT_URL;
    if (
      !key ||
      (!fixture && (!redirect || new URL(redirect).protocol !== "https:"))
    )
      return { state: "configuration-required" };
    const { reconcile, confirmed } = await ctx.runMutation(beginRef, values);
    if (confirmed) return { state: "confirmed" };
    const request = async (path: string, method = "GET", body?: object) =>
      fetch(`${base}${path}`, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
    let state: "unknown" | "confirmed" | "failed" = "unknown";
    let providerId: string | undefined;
    try {
      if (reconcile || values.kind === "revoke") {
        // No assumed POST idempotency. Exact owned metadata identifies a previous create.
        const response = await request(
          `/invitations?query=${encodeURIComponent(invitation.email)}&limit=100`,
        );
        if (response.ok) {
          const data = await response.json();
          const rows = Array.isArray(data) ? data : data.data;
          const matches = Array.isArray(rows)
            ? rows.filter(
                (row) =>
                  row.email_address?.toLowerCase() === invitation.email &&
                  row.public_metadata?.slander_invitation === invitation._id,
              )
            : [];
          if (matches.length === 1) {
            const row = matches[0];
            providerId =
              typeof row.id === "string" && /^[A-Za-z0-9_-]+$/.test(row.id)
                ? row.id
                : undefined;
            if (
              providerId &&
              (values.kind === "create"
                ? ["pending", "accepted"].includes(row.status)
                : ["revoked", "accepted", "expired"].includes(row.status))
            )
              state = "confirmed";
            // A known pending invitation is safe to revoke once; uncertain revokes only reconcile.
            if (
              values.kind === "revoke" &&
              !reconcile &&
              providerId &&
              row.status === "pending"
            ) {
              const revoked = await request(
                `/invitations/${providerId}/revoke`,
                "POST",
              );
              if (revoked.ok) {
                const result = await revoked.json();
                if (result.id === providerId && result.status === "revoked")
                  state = "confirmed";
              }
            }
          }
        }
      } else {
        const response = await request("/invitations", "POST", {
          email_address: invitation.email,
          notify: true,
          ignore_existing: true,
          redirect_url: fixture ? "http://127.0.0.1/owned-creator" : redirect,
          public_metadata: { slander_invitation: invitation._id },
        });
        if (response.ok) {
          const result = await response.json();
          if (
            typeof result.id === "string" &&
            /^[A-Za-z0-9_-]+$/.test(result.id) &&
            result.email_address?.toLowerCase() === invitation.email &&
            result.status === "pending" &&
            result.public_metadata?.slander_invitation === invitation._id
          ) {
            providerId = result.id;
            state = "confirmed";
          }
        } else if ([400, 401, 403, 404, 422, 429].includes(response.status))
          state = "failed";
      }
    } catch {
      /* Do not log provider bodies, URLs or credentials. Unknown results remain held. */
    }
    await ctx.runMutation(finishRef, {
      ...values,
      state,
      ...(providerId ? { providerId } : {}),
    });
    return { state };
  },
});
