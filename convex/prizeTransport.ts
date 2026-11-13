import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { stableRequest } from "./access.ts";

export const prizeSignature = (secret: string, value: unknown) =>
  bytesToHex(
    hmac(
      sha256,
      new TextEncoder().encode(secret),
      new TextEncoder().encode(stableRequest(value as never)),
    ),
  );
// This wire contract belongs only to the controlled peer, not to Stripe or a
// claimed real transfer route. Production dispatch is fenced by prizeFunds:claim.
export async function controlledPrizeTransfer(work: {
  origin: string;
  secret: string;
  reconcile: boolean;
  transfer: {
    key: string;
    nonprofitId: string;
    campaignSlug: string;
    amountCents: number;
    currency: "USD";
    account: string;
    route: string;
    sourcePurpose: "fundraising";
    destinationPurpose: "prize";
    beneficiary: string;
    destination: string;
    authorityRevision: string;
    transportBinding: string;
  };
}) {
  const { transfer: t } = work;
  const binding = {
    key: t.key,
    nonprofitId: t.nonprofitId,
    campaignId: t.campaignSlug,
    amountCents: t.amountCents,
    currency: t.currency,
    account: t.account,
    route: t.route,
    sourcePurpose: t.sourcePurpose,
    destinationPurpose: t.destinationPurpose,
    beneficiary: t.beneficiary,
    destination: t.destination,
    authorityRevision: t.authorityRevision,
    transportBinding: t.transportBinding,
  };
  const request = { method: work.reconcile ? "GET" : "POST", binding };
  try {
    const response = await fetch(
      `${work.origin}/owned/prize-transfers/${t.key}`,
      {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "X-Owned-Signature": prizeSignature(work.secret, request),
          "X-Owned-Binding": JSON.stringify(binding),
        },
        ...(work.reconcile ? {} : { body: JSON.stringify(binding) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      return {
        outcome: "unknown" as const,
        digest: prizeSignature(work.secret, {
          request,
          status: response.status,
        }),
      };
    const raw = await response.text();
    if (raw.length > 16000) throw new Error("PRIZE_RESPONSE_SIZE");
    const body = JSON.parse(raw);
    if (
      response.headers.get("X-Owned-Signature") !==
        prizeSignature(work.secret, body) ||
      stableRequest(body.binding) !== stableRequest(binding) ||
      !["pending", "settled"].includes(body.state) ||
      typeof body.providerId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(body.providerId) ||
      (body.state === "settled" &&
        (typeof body.settlementReference !== "string" ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(body.settlementReference)))
    )
      throw new Error("PRIZE_RESPONSE_BINDING");
    return {
      outcome: body.state as "pending" | "settled",
      providerId: body.providerId as string,
      ...(body.state === "settled"
        ? { settlementReference: body.settlementReference as string }
        : {}),
      digest: prizeSignature(work.secret, body),
    };
  } catch {
    return {
      outcome: "unknown" as const,
      digest: prizeSignature(work.secret, { request, outcome: "unknown" }),
    };
  }
}
