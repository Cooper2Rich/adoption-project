import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import { internalMutation, type MutationCtx, type Doc } from "./functions.ts";
import {
  emailJob,
  emailWatchdog,
  routing,
  RETRY_DELAYS,
  IDEMPOTENCY_WINDOW,
  EMAIL_REPLAY_MARGIN_MS,
} from "./operatorIncidents.ts";

export async function emailClock(
  ctx: MutationCtx,
  incident: Doc<"operatorIncidents">,
) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", incident.campaignSlug))
    .unique();
  // Only the run-owned fixture can move this clock. Production uses wall time.
  return {
    campaign,
    now:
      incident.synthetic &&
      campaign?.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
        ? (campaign?.fixtureIncidentNow ?? Date.now())
        : Date.now(),
  };
}
export function transportConfiguration(
  synthetic: boolean,
  fixtureRunId?: string,
) {
  if (synthetic) {
    const url = process.env.OPERATOR_EMAIL_FIXTURE_URL;
    if (
      !fixtureRunId ||
      fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID ||
      !url
    )
      return null;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return {
      url: parsed.origin,
      source: "unvalidated-owned-fixture",
      token: "owned-fixture",
    };
  }
  // T39 must provide real reviewed sender/domain/contact/API evidence. No
  // fixture fallback and no evidence boolean can grant production authority.
  let evidence: any;
  try {
    evidence = JSON.parse(
      process.env.OPERATOR_EMAIL_REVIEWED_EVIDENCE ?? "null",
    );
  } catch {
    return null;
  }
  if (
    !evidence ||
    evidence.provider !== "resend" ||
    !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? "") ||
    !/^https:\/\//.test(evidence.reviewUrl ?? "") ||
    typeof evidence.reviewedBy !== "string" ||
    !evidence.reviewedBy.trim() ||
    evidence.sender !== process.env.OPERATOR_EMAIL_FROM ||
    evidence.verifiedSender !== true ||
    evidence.verifiedClerkContacts !== true ||
    !process.env.RESEND_API_KEY ||
    !process.env.OPERATOR_EMAIL_FROM
  )
    return null;
  return {
    url: "https://api.resend.com",
    source: "resend-reviewed-candidate",
    token: process.env.RESEND_API_KEY,
  };
}
export const claim = internalMutation({
  args: { emailId: v.id("incidentEmails") },
  handler: async (ctx, { emailId }) => {
    const email = await ctx.db.get(emailId);
    if (!email || ["delivered", "failed", "held"].includes(email.state))
      return null;
    const incident = (await ctx.db.get(email.incidentId))!;
    const { campaign, now } = await emailClock(ctx, incident);
    const notice = await ctx.db.get(email.noticeId);
    if (
      notice?.kind === "detection" &&
      incident.status === "resolved" &&
      ["pending", "held"].includes(email.state)
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Resolved; unsent detection notice superseded by recovery",
      });
      return null;
    }
    const route = await routing(ctx, incident);
    if (
      !route.recipients.some(
        (p) => p.subject === email.subject && p.email === email.email,
      )
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Recipient authority or contact changed; review required",
      });
      return null;
    }
    const transport = transportConfiguration(
      incident.synthetic,
      campaign?.fixtureRunId,
    );
    if (
      !transport ||
      email.from === "unconfigured" ||
      email.from !== process.env.OPERATOR_EMAIL_FROM
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Email provider approval/configuration required",
      });
      return null;
    }
    if (
      incident.synthetic &&
      (!email.email.endsWith(".example") || !email.from.endsWith(".example"))
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Controlled fixture addresses required",
      });
      return null;
    }
    const payload = JSON.stringify({
      from: email.from,
      to: [email.email],
      subject: email.title,
      text: email.text,
    });
    const binding = bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify({
            url: transport.url,
            token: transport.token,
            source: transport.source,
            evidence: incident.synthetic
              ? campaign?.fixtureRunId
              : process.env.OPERATOR_EMAIL_REVIEWED_EVIDENCE,
            from: email.from,
          }),
        ),
      ),
    );
    let attempt = email.activeAttempt
      ? await ctx.db.get(email.activeAttempt)
      : null;
    if (
      attempt &&
      (attempt.providerBinding !== binding || attempt.payload !== payload)
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Journaled provider configuration changed; reconciliation required",
      });
      return null;
    }
    const work = email.state === "accepted" ? "retrieve" : "send";
    if (
      attempt &&
      work === "send" &&
      attempt.state !== "failed" &&
      now >= attempt.sendStartedAt + IDEMPOTENCY_WINDOW - EMAIL_REPLAY_MARGIN_MS
    ) {
      await ctx.db.patch(emailId, {
        state: "held",
        hold: "Unknown send reached conservative idempotency window cutoff; reconciliation required",
      });
      return null;
    }
    if (now < email.nextAt || (attempt && attempt.leaseUntil > now))
      return null;
    if (!attempt || attempt.state === "failed") {
      const ordinal = email.failures;
      const attemptId = await ctx.db.insert("incidentEmailAttempts", {
        emailId,
        ordinal,
        key: `operator/${emailId}/${ordinal}`,
        payload,
        providerBinding: binding,
        state: "sending",
        journaledAt: now,
        sendStartedAt: now,
        lastTransportAt: now,
        transportCalls: 0,
        leaseUntil: 0,
        source: transport.source,
        version: 1,
      });
      attempt = (await ctx.db.get(attemptId))!;
    }
    await ctx.db.patch(attempt._id, {
      state: work === "send" ? "sending" : "accepted",
      lastTransportAt: now,
      transportCalls: attempt.transportCalls + 1,
      leaseUntil: now + 30_000,
    });
    await ctx.db.patch(emailId, {
      state: work === "send" ? "sending" : "accepted",
      activeAttempt: attempt._id,
    });
    // The durable mutation watchdog remains queued independently of this
    // at-most-once action, including crashes before or after this claim.
    return {
      emailId,
      attemptId: attempt._id,
      ordinal: attempt.ordinal,
      key: attempt.key,
      transportCall: attempt.transportCalls + 1,
      providerId: attempt.providerId ?? null,
      work,
      url: transport.url,
      token: transport.token,
      payload: {
        from: email.from,
        to: [email.email],
        subject: email.title,
        text: email.text,
      },
    };
  },
});
export const settle = internalMutation({
  args: {
    emailId: v.id("incidentEmails"),
    attemptId: v.id("incidentEmailAttempts"),
    transportCall: v.number(),
    work: v.union(v.literal("send"), v.literal("retrieve")),
    outcome: v.union(
      v.literal("unknown"),
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    providerId: v.optional(v.string()),
    providerEvent: v.optional(
      v.union(
        ...[
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
        ].map((event) => v.literal(event)),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId),
      attempt = await ctx.db.get(args.attemptId);
    if (
      !email ||
      !attempt ||
      attempt.transportCalls !== args.transportCall ||
      email.activeAttempt !== attempt._id ||
      ["delivered", "failed", "held"].includes(email.state) ||
      ["delivered", "failed"].includes(attempt.state)
    )
      return { ignored: true };
    if (
      args.providerId &&
      (args.providerId.length > 128 ||
        !/^[a-zA-Z0-9_-]+$/.test(args.providerId) ||
        (attempt.providerId && args.providerId !== attempt.providerId))
    )
      throw new Error("EMAIL_PROVIDER_REFERENCE_CONFLICT");
    const incident = (await ctx.db.get(email.incidentId))!;
    const { now } = await emailClock(ctx, incident);
    // A stale timeout may follow a successful claim/retrieval. Never regress it.
    if (
      (args.outcome === "unknown" ||
        (args.work === "send" && args.outcome === "failed")) &&
      (attempt.state === "accepted" || email.state === "accepted")
    )
      return { ignored: true };
    let state = args.outcome,
      nextAt = now;
    const failures = email.failures + (state === "failed" ? 1 : 0);
    if (state === "failed" && failures <= RETRY_DELAYS.length)
      nextAt = now + RETRY_DELAYS[failures - 1]!;
    else if (state === "unknown") nextAt = now + 60_000;
    else if (state === "accepted") nextAt = now + 30_000;
    await ctx.db.patch(attempt._id, {
      state,
      leaseUntil: 0,
      ...(args.providerId ? { providerId: args.providerId } : {}),
      ...(args.providerEvent ? { providerEvent: args.providerEvent } : {}),
      ...(["failed", "delivered"].includes(state) ? { finishedAt: now } : {}),
    });
    await ctx.db.patch(email._id, {
      state:
        state === "failed" && failures <= RETRY_DELAYS.length
          ? "pending"
          : state,
      failures,
      nextAt,
      wakeVersion: email.wakeVersion + 1,
    });
    if (
      state !== "delivered" &&
      !(state === "failed" && failures > RETRY_DELAYS.length)
    )
      await ctx.scheduler.runAfter(nextAt - now, emailWatchdog, {
        emailId: email._id,
        generation: email.wakeVersion + 1,
      });
    return { ignored: false };
  },
});
// Scheduled mutations retry transactionally. Each pulse commits its successor
// independently of the at-most-once action, so a failure before action claim
// cannot strand an intent. Generation invalidates superseded retry/resume pulses.
export async function watchEmail(
  ctx: MutationCtx,
  args: {
    emailId: import("convex/values").GenericId<"incidentEmails">;
    generation: number;
  },
  skipAction = false,
) {
  const email = await ctx.db.get(args.emailId);
  if (
    !email ||
    email.wakeVersion !== args.generation ||
    ["held", "failed", "delivered"].includes(email.state)
  )
    return { ignored: true, generation: args.generation };
  const incident = (await ctx.db.get(email.incidentId))!;
  const { now } = await emailClock(ctx, incident);
  const attempt = email.activeAttempt
    ? await ctx.db.get(email.activeAttempt)
    : null;
  const due = Math.max(email.nextAt, attempt?.leaseUntil ?? 0);
  const generation = email.wakeVersion + 1;
  await ctx.db.patch(email._id, { wakeVersion: generation });
  await ctx.scheduler.runAfter(Math.max(30_000, due - now), emailWatchdog, {
    emailId: email._id,
    generation,
  });
  if (now >= due && !skipAction)
    await ctx.scheduler.runAfter(0, emailJob, { emailId: email._id });
  return { ignored: false, generation };
}
export const watchdog = internalMutation({
  args: { emailId: v.id("incidentEmails"), generation: v.number() },
  handler: async (ctx, args) => watchEmail(ctx, args),
});
