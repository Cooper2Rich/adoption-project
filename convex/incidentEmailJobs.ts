import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { EMAIL_TRANSPORT_TIMEOUT_MS } from "./operatorIncidents.ts";
import { internalAction } from "./functions.ts";

const claim = makeFunctionReference<"mutation", { emailId: string }, any>(
  "incidentEmail:claim",
);
const settle = makeFunctionReference<"mutation", any, any>(
  "incidentEmail:settle",
);
export const run = internalAction({
  args: { emailId: v.id("incidentEmails") },
  handler: async (ctx, args) => {
    const work = await ctx.runMutation(claim, args);
    if (!work) return { dispatched: false };
    let outcome: "unknown" | "accepted" | "delivered" | "failed" = "unknown";
    let providerId: string | undefined;
    let providerEvent: string | undefined;
    try {
      const response = await fetch(
        work.work === "send"
          ? `${work.url}/emails`
          : `${work.url}/emails/${encodeURIComponent(work.providerId)}`,
        {
          method: work.work === "send" ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${work.token}`,
            ...(work.work === "send"
              ? {
                  "Content-Type": "application/json",
                  "Idempotency-Key": work.key,
                }
              : {}),
          },
          ...(work.work === "send"
            ? { body: JSON.stringify(work.payload) }
            : {}),
          signal: AbortSignal.timeout(EMAIL_TRANSPORT_TIMEOUT_MS),
          redirect: "error",
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (
          typeof data.id === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(data.id) &&
          (work.work === "send" || data.id === work.providerId)
        ) {
          providerId = data.id;
          if (
            work.work === "retrieve" &&
            [
              "sent",
              "delivered",
              "opened",
              "clicked",
              "complained",
              "bounced",
              "failed",
              "suppressed",
              "delivery_delayed",
              "scheduled",
            ].includes(data.last_event)
          )
            providerEvent = data.last_event;
          outcome =
            work.work === "send"
              ? "accepted"
              : ["delivered", "opened", "clicked", "complained"].includes(
                    data.last_event,
                  )
                ? "delivered"
                : ["bounced", "failed", "suppressed"].includes(data.last_event)
                  ? "failed"
                  : "accepted";
        }
      } else if (
        work.work === "send" &&
        work.transportCall === 1 &&
        [400, 401, 403, 404, 422, 429].includes(response.status)
      )
        outcome = "failed";
      // A rejection on a replay proves nothing about the original request.
      // It remains unknown with the SAME key, even for 401/422/429.
      // 5xx, conflicts, malformed bodies and network loss leave the request
      // unknown. Retrieval failure never creates a replacement message.
      else if (work.work === "retrieve") outcome = "accepted";
    } catch {
      if (work.work === "retrieve") outcome = "accepted";
    }
    await ctx.runMutation(settle, {
      ...args,
      attemptId: work.attemptId,
      transportCall: work.transportCall,
      work: work.work,
      outcome,
      ...(providerId ? { providerId } : {}),
      ...(providerEvent ? { providerEvent } : {}),
    });
    return { dispatched: true, outcome };
  },
});
