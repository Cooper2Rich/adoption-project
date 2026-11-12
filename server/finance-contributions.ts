import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DemoRecords, DemoState } from "./demo-types.ts";
import { AppError, getProject } from "./domain.ts";
import { initialPosition, positionProjection } from "./finance-money.ts";

const text = z.string().trim().min(1).max(200);
const money = z.number().int().nonnegative().safe();
const instant = z.iso
  .datetime({ offset: true })
  .transform((v: any) => new Date(v).toISOString());
const hash = (v: any) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const contributionInput = z
  .object({
    source: text,
    sourceAccountId: text,
    originalTransactionId: text,
    originalEvidenceId: text,
    mode: z.literal("simulated").default("simulated"),
    currency: z.literal("USD"),
    amountCents: money.refine((v: any) => v > 0),
    contributorType: z.enum(["public_supporter", "nonprofit", "business"]),
    purpose: z.enum(["public", "restricted"]),
    consent: text,
    intentId: text.optional(),
    effectiveAt: instant,
    allocations: z
      .array(
        z
          .object({
            purpose: z.enum(["seed", "media"]),
            use: z.enum(["guarantee", "app_use", "ad_budget"]),
            amountCents: money.refine((v: any) => v > 0),
          })
          .strict(),
      )
      .max(3)
      .default([]),
  })
  .strict();
export function createContribution(
  state: DemoState,
  records: DemoRecords,
  campaignId: any,
  input: any,
  at: any = new Date().toISOString(),
) {
  getProject(state, campaignId);
  const d = contributionInput.parse(input);
  if (d.effectiveAt > at)
    throw new AppError("Future funding evidence is invalid.");
  if (d.purpose === "public") {
    if (
      d.allocations.length ||
      d.contributorType !== "public_supporter" ||
      !d.intentId
    )
      throw new AppError(
        "Public gifts require a fixed intent and public purpose consent.",
      );
    const intent = records.get("gift_intents", d.intentId);
    if (
      !intent ||
      intent.campaignId !== campaignId ||
      intent.mode !== d.mode ||
      intent.amountCents !== d.amountCents
    )
      throw new AppError("FIXED_INTENT_AMOUNT_REQUIRED", 409);
  } else {
    if (d.intentId || !d.allocations.length)
      throw new AppError("Explicit restricted allocations required.");
    const keys = new Set();
    for (const a of d.allocations) {
      const key = `${a.purpose}:${a.use}`;
      if (
        keys.has(key) ||
        !(a.purpose === "seed"
          ? ["guarantee", "app_use"].includes(a.use)
          : a.use === "ad_budget")
      )
        throw new AppError("Invalid purpose allocation.");
      keys.add(key);
    }
    if (
      d.allocations.reduce(
        (n: any, a: any) => n + BigInt(a.amountCents),
        0n,
      ) !== BigInt(d.amountCents)
    )
      throw new AppError("Allocations must equal the contribution amount.");
  }
  const existing = records.contributionByTransaction(
    d.mode,
    d.source,
    d.sourceAccountId,
    d.originalTransactionId,
  );
  if (existing) {
    if (
      existing.campaignId !== campaignId ||
      existing.definitionDigest !== hash(d)
    )
      throw new AppError("ORIGINAL_TRANSACTION_CONFLICT", 409);
    return existing;
  }
  if (d.intentId && records.contributionByIntent(d.intentId))
    throw new AppError("ORIGINAL_TRANSACTION_CONFLICT", 409);
  const row = records.append("contributions", {
    ...d,
    id: randomUUID(),
    campaignId,
    definitionDigest: hash(d),
    recordedAt: at,
  });
  records.putPosition(positionProjection(row, initialPosition(row)));
  return row;
}
