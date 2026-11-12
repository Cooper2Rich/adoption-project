import { query, mutation } from "./functions.ts";
import { v } from "convex/values";
import { authorizedCampaign, operationIdentity } from "./access.ts";
import { money, integer } from "./allocation/money.ts";

export const state = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    return {
      reservedSlots: campaign.reservedSlots,
      reservedCents: campaign.reservedCents,
      capacity: campaign.authority.capacity,
      fundingCents: campaign.reservationFundingCents,
    };
  },
});

// The preview UI never calls this operation. It is the intended atomic
// reservation primitive, independently verified against isolated test records.
export const reserve = mutation({
  args: {
    campaignId: v.string(),
    operationId: v.string(),
    entryId: v.string(),
    authorityRevision: v.string(),
    financeRevision: v.string(),
  },
  handler: async (ctx, args) => {
    const { campaign, subject } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    operationIdentity(args.operationId);
    const existing = await ctx.db
      .query("reservations")
      .withIndex("by_operation", (q) =>
        q
          .eq("campaignSlug", args.campaignId)
          .eq("operationId", args.operationId),
      )
      .unique();
    if (existing) {
      if (
        existing.entryId !== args.entryId ||
        existing.authorityRevision !== args.authorityRevision ||
        existing.financeRevision !== args.financeRevision
      )
        throw new Error("OPERATION_CONFLICT: Changed reservation request");
      return existing;
    }
    if (
      campaign.authority.revision !== args.authorityRevision ||
      campaign.reservationFinanceRevision !== args.financeRevision
    )
      throw new Error("REVISION_CHANGED: Revalidate authority and finance");
    const candidate = await ctx.db
      .query("reservationCandidates")
      .withIndex("by_entry", (q) =>
        q.eq("campaignSlug", args.campaignId).eq("entryId", args.entryId),
      )
      .unique();
    if (!candidate?.authorized)
      throw new Error("ENTRY_NOT_AUTHORIZED: Approved candidate required");
    const duplicate = await ctx.db
      .query("reservations")
      .withIndex("by_entry", (q) =>
        q.eq("campaignSlug", args.campaignId).eq("entryId", args.entryId),
      )
      .unique();
    if (duplicate) throw new Error("ENTRY_ALREADY_RESERVED");
    const amount = money(candidate.amountCents);
    if (amount <= 0n) throw new Error("Invalid reserved funding amount");
    const slots = campaign.reservedSlots + 1;
    const committed = money(campaign.reservedCents) + amount;
    if (
      !Number.isSafeInteger(slots) ||
      slots > campaign.authority.capacity ||
      committed > money(campaign.reservationFundingCents)
    )
      throw new Error("CAPACITY_OR_FUNDING_UNAVAILABLE: Reservation rejected");
    const id = await ctx.db.insert("reservations", {
      campaignSlug: args.campaignId,
      operationId: args.operationId,
      entryId: args.entryId,
      amountCents: integer(amount),
      authorityRevision: args.authorityRevision,
      financeRevision: args.financeRevision,
      actor: subject,
    });
    await ctx.db.patch(campaign._id, {
      reservedSlots: slots,
      reservedCents: integer(committed),
    });
    return await ctx.db.get(id);
  },
});
