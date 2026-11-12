import type { MutationCtx, Doc } from "../functions.ts";
import type { GenericId } from "convex/values";
import type { AllocationResult } from "./planner.ts";

export async function recordSimulatedIncidents(
  ctx: MutationCtx,
  scope: {
    campaignSlug: string;
    nonprofitId: string;
    previewId: GenericId<"previews">;
  },
  result: AllocationResult,
  at: number,
) {
  const managers = await ctx.db
    .query("memberships")
    .filter((q) =>
      q.and(
        q.eq(q.field("nonprofitId"), scope.nonprofitId),
        q.eq(q.field("role"), "manager"),
        q.eq(q.field("active"), true),
      ),
    )
    .collect();
  const administrators = await ctx.db
    .query("operators")
    .filter((q) => q.eq(q.field("active"), true))
    .collect();
  const recipients = [
    ...new Set(
      [...managers, ...administrators].map((member) => member.subject),
    ),
  ].sort();
  const incompleteEntryIds = result.targets
    .filter((entry) => entry.score === null)
    .map((entry) => entry.entryId);
  for (const kind of ["score-coverage", "financial-plan"] as const) {
    const incident = await ctx.db
      .query("notifications")
      .withIndex("by_kind", (q) =>
        q.eq("campaignSlug", scope.campaignSlug).eq("kind", kind),
      )
      .unique();
    const active =
      kind === "score-coverage"
        ? result.status === "boosts-held"
        : result.status === "blocked";
    // A financially blocked calculation cannot certify score recovery.
    const resolved =
      incident?.status === "open" &&
      !active &&
      (kind === "financial-plan" || result.status === "ready");
    if (!active && !resolved) continue;
    const state = active
      ? incident?.status === "open"
        ? "updated"
        : "opened"
      : "resolved";
    const record: Omit<
      Doc<"notifications">,
      "_id" | "_creationTime" | "kind" | "createdAt"
    > = {
      ...scope,
      simulated: true,
      recipients,
      reasons: active ? result.reasons : [],
      incompleteEntryIds: active ? incompleteEntryIds : [],
      status: active ? "open" : "resolved",
      history: [
        ...(incident?.history ?? []),
        { previewId: scope.previewId, state, at },
      ],
    };
    if (incident) await ctx.db.patch(incident._id, record);
    else
      await ctx.db.insert("notifications", { ...record, kind, createdAt: at });
  }
}
