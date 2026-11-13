import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./functions.ts";
import { controlledPrizeTransfer } from "./prizeTransport.ts";
const claim = makeFunctionReference<"mutation", any, any>("prizeFunds:claim");
const settle = makeFunctionReference<"mutation", any, any>("prizeFunds:settle");
export const run = internalAction({
  args: { transferId: v.id("prizeTransfers"), generation: v.number() },
  handler: async (ctx, args) => {
    const work = await ctx.runMutation(claim, args);
    if (!work) return { dispatched: false };
    const result = await controlledPrizeTransfer(work);
    await ctx.runMutation(settle, { ...args, ...result });
    return { dispatched: true, outcome: result.outcome };
  },
});
