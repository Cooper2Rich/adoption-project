import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import { authorizedCampaign, stableRequest } from "./access.ts";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
  type Doc,
} from "./functions.ts";
import { recordTrustedIncident } from "./operatorIncidents.ts";
import { prizeCoverage } from "./prizeFunds.ts";
import {
  readinessComponents,
  type ReadinessComponent,
} from "./readinessPolicy.ts";
import {
  readinessAccounts,
  readinessEvidenceValidator,
  readinessReleaseValidator,
} from "./readinessSchema.ts";

const digest = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
const isDigest = (value: string) => /^[a-f0-9]{64}$/.test(value);
const requiresRelease = (component: ReadinessComponent) =>
  [
    "blob-originals",
    "mux-playback",
    "operator-email",
    "production-behavior",
    "launch-review",
    "paid-workflow",
  ].includes(component.id);
const expirationJob = makeFunctionReference<
  "mutation",
  { campaignId: string; proofId: string }
>("readiness:expire");
async function scopeData(ctx: QueryCtx, campaign: Doc<"campaigns">) {
  const configuration = await ctx.db
    .query("readinessScopes")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .unique();
  const settings = await ctx.db
    .query("campaignSettings")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .unique();
  const terms = await ctx.db
    .query("participationTerms")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .collect();
  const releaseHistory = await ctx.db
    .query("readinessReleaseTargets")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaign.slug))
    .collect();
  const latestRelease = releaseHistory.sort(
    (a, b) => b.sequence - a.sequence,
  )[0];
  const release =
    latestRelease &&
    latestRelease.nonprofitId === campaign.nonprofitId &&
    latestRelease.synthetic === !!campaign.fixtureRunId &&
    latestRelease.source ===
      (latestRelease.synthetic
        ? "owned-release-controller"
        : "trusted-release-controller")
      ? latestRelease
      : null;
  const releaseTarget = release
    ? {
        ...release,
        binding: digest([
          release.environmentDigest,
          release.buildDigest,
          release.sequence,
        ]),
      }
    : null;
  // Bind every approval to current inputs. Fixture balances are deliberately absent.
  const revision = digest({
    campaign: campaign._id,
    nonprofit: campaign.nonprofitId,
    configuration,
    settings: settings?._id ?? null,
    terms: terms.map((t) => [t._id, t.version, t.synthetic]),
    authority: campaign.authority,
    finance: campaign.reservationFinanceRevision,
  });
  return { configuration, settings, terms, revision, releaseTarget };
}
async function reviewerAuthorized(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  component: ReadinessComponent,
  subject: string,
) {
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_subject", (q) => q.eq("subject", subject))
    .unique();
  if (operator?.active) return true;
  if (component.owner === "administrator") return false;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_subject_nonprofit", (q) =>
      q.eq("subject", subject).eq("nonprofitId", campaign.nonprofitId),
    )
    .unique();
  return membership?.active === true && membership.role === "manager";
}
function accountBinding(
  component: ReadinessComponent,
  data: Awaited<ReturnType<typeof scopeData>>,
) {
  return component.account === "campaign"
    ? data.revision
    : (data.configuration?.accounts[component.account] ?? "");
}
function evidenceFacts(
  component: ReadinessComponent,
  proof: Pick<Doc<"readinessProofs">, "values" | "safety">,
  checkCoverage = true,
  settings: Doc<"campaignSettings"> | null = null,
) {
  if (component.id === "safety-policy") {
    const safety = proof.safety;
    if (
      !safety ||
      !Number.isSafeInteger(safety.reserveCents) ||
      safety.reserveCents < 0 ||
      !Number.isSafeInteger(safety.freshnessMs) ||
      safety.freshnessMs <= 0 ||
      !isDigest(safety.releaseRuleDigest)
    )
      return "Actual reviewed reserve, freshness and release parameters are missing or invalid";
  }
  if (component.id === "prize-funding" || component.id === "full-run-funding") {
    const values = proof.values;
    if (
      !values ||
      !Number.isSafeInteger(values.availableCents) ||
      !Number.isSafeInteger(values.requiredCents) ||
      values.requiredCents < 0 ||
      (component.id === "full-run-funding" && values.requiredCents === 0)
    )
      return "Verified required and available funding amounts are missing or invalid";
    if (
      component.id === "prize-funding" &&
      values.requiredCents === 0 &&
      (!settings ||
        settings.rules.dailyPrizeCents !== 0 ||
        settings.rules.weeklyPrizeCents !== 0 ||
        settings.rules.weeklyReplenishmentCents !== 0)
    )
      return "A zero prize obligation requires current locked zero prize and replenishment rules";
    if (checkCoverage && values.availableCents < values.requiredCents)
      return "Verified funding does not cover the required commitment";
  }
  return null;
}
async function currentReadiness(ctx: QueryCtx, campaign: Doc<"campaigns">) {
  const data = await scopeData(ctx, campaign);
  const prizes = await prizeCoverage(ctx, campaign);
  const proofs = await ctx.db
    .query("readinessProofs")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaign.slug))
    .collect();
  const now =
    campaign.fixtureRunId &&
    campaign.fixtureRunId === process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
      ? (campaign.fixtureReadinessNow ?? Date.now())
      : Date.now();
  const components = await Promise.all(
    readinessComponents.map(async (component) => {
      const proof = proofs
        .filter((p) => p.component === component.id)
        .sort((a, b) => b.sequence - a.sequence)[0];
      const selected = data.configuration?.selectedProviders;
      const required = !(
        (component.account === "meta" || component.account === "tiktok") &&
        selected?.length &&
        !selected.includes(component.account)
      );
      let reason: string | null = null;
      if (!required) reason = null;
      else if (!data.configuration)
        reason = `Required account scope is unconfigured; trusted ${component.title.toLowerCase()} validation is missing`;
      else if (
        (component.account === "meta" || component.account === "tiktok") &&
        !selected?.length
      )
        reason =
          "Advertising provider selection is unconfigured; this advertising prerequisite remains required";
      else if (!accountBinding(component, data))
        reason = "Required account binding is missing";
      else if (requiresRelease(component) && !data.releaseTarget)
        reason = "Trusted current build and environment target is missing";
      else if (!proof)
        reason = `Trusted ${component.title.toLowerCase()} validation evidence has not been supplied`;
      else if (
        proof.synthetic !== !!campaign.fixtureRunId ||
        proof.source !==
          (proof.synthetic ? "owned-readiness-validator" : component.validator)
      )
        reason = "Evidence provenance is not valid for this production scope";
      else if (
        proof.revision !== data.revision ||
        proof.nonprofitId !== campaign.nonprofitId ||
        proof.account !== accountBinding(component, data)
      )
        reason =
          "Evidence belongs to an older revision or different account scope";
      else if (
        requiresRelease(component) &&
        proof.releaseTarget !== data.releaseTarget?.binding
      )
        reason =
          "Production evidence belongs to an older build or environment target";
      else if (
        !(await reviewerAuthorized(ctx, campaign, component, proof.reviewer))
      )
        reason = "The reviewed owner's current scoped authority is revoked";
      else if (proof.expiresAt <= now)
        reason = "Trusted evidence has expired; current validation is required";
      else if (proof.outcome !== "verified")
        reason = "Trusted validation reported an unmet prerequisite";
      else reason = evidenceFacts(component, proof, true, data.settings);
      if (component.id === "paid-workflow")
        reason =
          "Production paid admission and advertising dispatch are not implemented";
      if (
        required &&
        !reason &&
        component.id === "campaign-configuration" &&
        (!data.settings ||
          !data.terms.some((t) => campaign.fixtureRunId || !t.synthetic))
      )
        reason =
          "Locked campaign rules and approved current participation terms are required";
      if (
        required &&
        component.id === "prize-funding" &&
        !reason &&
        !prizes.covered
      )
        reason = prizes.coverageReason;
      const satisfied = !required || !reason;
      return {
        ...component,
        required: !!required,
        satisfied,
        status: !required
          ? "not-applicable"
          : reason
            ? "unmet"
            : proof?.synthetic
              ? "unvalidated"
              : "approved",
        reason,
        resolutionRole: component.owner,
        owner: proof?.reviewer ?? null,
        scope: {
          nonprofitId: campaign.nonprofitId,
          campaignId: campaign.slug,
          account: component.account,
          accountBinding: accountBinding(component, data) || null,
          revision: data.revision,
          releaseTarget: requiresRelease(component)
            ? (data.releaseTarget?.binding ?? null)
            : null,
        },
        evidence: proof
          ? {
              digest: proof.digest,
              reviewer: proof.reviewer,
              actor: proof.actor,
              source: proof.source,
              observedAt: proof.observedAt,
              expiresAt: proof.expiresAt,
              at: proof.at,
              version: proof.version,
              sequence: proof.sequence,
              synthetic: proof.synthetic,
              values: proof.values ?? null,
              safety: proof.safety ?? null,
            }
          : null,
      };
    }),
  );
  const safety = components.find((c) => c.id === "safety-policy")!;
  if (
    safety.satisfied &&
    components.some(
      (c) =>
        ["PG-01", "PG-02", "PG-03"].includes(c.gate) &&
        c.required &&
        !c.satisfied,
    )
  ) {
    safety.satisfied = false;
    safety.status = "unmet";
    safety.reason =
      "Current provider eligibility and financial/advertising contracts must be validated before safety values can be accepted";
  }
  const collectionIds = [
    "stripe-eligibility",
    "collection-eligibility",
    "funding-contract",
    "return-contract",
    "financial-read",
    "collection-funding",
  ];
  const collection = components.filter((c) => collectionIds.includes(c.id));
  return {
    revision: data.revision,
    prizeCoverage: prizes,
    releaseTarget: data.releaseTarget,
    configurationVersion: data.configuration?.version ?? 0,
    synthetic: !!campaign.fixtureRunId,
    components,
    // This repository has neither a production paid writer nor a collection writer.
    // Gate success is evidence only and cannot be converted into dispatch authority.
    paidAllowed: false as const,
    capability: "unavailable" as const,
    capabilityReason:
      "Production paid admission and advertising dispatch are not implemented",
    collection: {
      eligibility:
        collection.length === collectionIds.length &&
        collection.every((c) => c.satisfied)
          ? campaign.fixtureRunId
            ? "unvalidated"
            : "approved"
          : "held",
      available: false as const,
      reason:
        "Public advertising contribution checkout is unavailable pending its separate integration",
    },
    prelaunch:
      "Creator intake, review and public waiting creatives retain their existing terms, identity and media permission checks",
  };
}
// Transactional guard for every future paid writer: call in the SAME mutation,
// return the denied result before reserving/journaling/dispatching, and do not
// throw after detection (Convex would roll back blockers and incident intents).
export async function guardPaidActivation(
  ctx: MutationCtx,
  campaignId: string,
  expectedRevision?: string,
) {
  const { campaign, subject } = await authorizedCampaign(ctx, campaignId);
  const result = await evaluateCurrent(
    ctx,
    campaign,
    subject,
    "readiness:checkPaidActivation",
  );
  return {
    ...result,
    revisionMatches:
      expectedRevision === undefined || expectedRevision === result.revision,
    denial:
      expectedRevision !== undefined && expectedRevision !== result.revision
        ? "Readiness revision changed; reevaluate the current campaign scope"
        : campaign.fixtureRunId
          ? "Controlled evidence cannot authorize production paid activation"
          : result.capabilityReason,
  };
}
async function evaluateCurrent(
  ctx: MutationCtx,
  campaign: Doc<"campaigns">,
  actor: string,
  source: string,
) {
  const result = await currentReadiness(ctx, campaign);
  const blockers = await ctx.db
    .query("readinessBlockers")
    .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
    .collect();
  const at = Date.now();
  for (const component of result.components) {
    const previous = blockers.find((b) => b.component === component.id);
    const active = component.required && !component.satisfied;
    // Unchanged evaluations retain one stream/episode and do not duplicate mail.
    const reason =
      component.reason ??
      (component.status === "unvalidated"
        ? "Controlled validation recovered; actual provider approval remains unvalidated"
        : "Current trusted evidence satisfies this component");
    const record = {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      component: component.id,
      active,
      reason,
      revision: result.revision,
      sequence: (previous?.sequence ?? 0) + 1,
      firstDetectedAt: previous?.firstDetectedAt ?? at,
      updatedAt: at,
      actor,
      source,
      version: 1 as const,
    };
    if (previous) await ctx.db.patch(previous._id, record);
    else await ctx.db.insert("readinessBlockers", record);
    await recordTrustedIncident(
      ctx,
      {
        campaignId: campaign.slug,
        key: `readiness-${component.id}`,
        kind: "launch-blocker",
        sequence: record.sequence,
        observedAt: at,
        active,
        reason: `${component.gate}: ${component.title}: ${reason}`.slice(
          0,
          500,
        ),
        evidence: `readiness:${component.evidence?.digest ?? result.revision}`,
        resolutionRole: component.resolutionRole,
      },
      { producer: "launch-readiness", actor, synthetic: result.synthetic },
    );
  }
  await ctx.db.insert("readinessAudit", {
    campaignSlug: campaign.slug,
    nonprofitId: campaign.nonprofitId,
    actor,
    source,
    at,
    version: 1,
    action: "evaluated",
    revision: result.revision,
    details: JSON.stringify(
      result.components.map((c) => ({
        component: c.id,
        status: c.status,
        reason: c.reason,
        evidence: c.evidence?.digest ?? null,
      })),
    ),
  });
  return result;
}

export const read = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign } = await authorizedCampaign(ctx, campaignId);
    return {
      ...(await currentReadiness(ctx, campaign)),
      blockers: await ctx.db
        .query("readinessBlockers")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect(),
      evidenceHistory: await ctx.db
        .query("readinessProofs")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .collect(),
      audit: await ctx.db
        .query("readinessAudit")
        .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaignId))
        .collect(),
    };
  },
});
export const evaluate = mutation({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const { campaign, subject } = await authorizedCampaign(ctx, campaignId);
    return await evaluateCurrent(ctx, campaign, subject, "readiness:evaluate");
  },
});
// Trusted purpose producer/expiry refreshes the existing durable blocker stream.
export const refreshPrize = internalMutation({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", campaignId))
      .unique();
    if (campaign)
      await evaluateCurrent(
        ctx,
        campaign,
        "prize-producer",
        "prize-funding-current",
      );
  },
});
export const checkPaidActivation = mutation({
  args: { campaignId: v.string(), expectedRevision: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await guardPaidActivation(ctx, args.campaignId, args.expectedRevision),
});

export const configureScope = mutation({
  args: {
    campaignId: v.string(),
    expectedVersion: v.number(),
    accounts: readinessAccounts,
    selectedProviders: v.array(v.union(v.literal("meta"), v.literal("tiktok"))),
  },
  handler: async (ctx, args) => {
    const { campaign, subject, isAdministrator } = await authorizedCampaign(
      ctx,
      args.campaignId,
    );
    if (!isAdministrator)
      throw new Error("FORBIDDEN: Platform administrator permission required");
    const previous = await ctx.db
      .query("readinessScopes")
      .withIndex("by_campaign", (q) => q.eq("campaignSlug", campaign.slug))
      .unique();
    if (args.expectedVersion !== (previous?.version ?? 0))
      throw new Error("STALE_READINESS_CONFIGURATION");
    if (
      new Set(args.selectedProviders).size !== args.selectedProviders.length ||
      Object.values(args.accounts).some(
        (a) => a !== undefined && a !== "" && !isDigest(a),
      )
    )
      throw new Error("OPAQUE_ACCOUNT_DIGESTS_AND_UNIQUE_PROVIDERS_REQUIRED");
    const record = {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      version: (previous?.version ?? 0) + 1,
      accounts: args.accounts,
      selectedProviders: args.selectedProviders,
      actor: subject,
      source: "readiness:configureScope",
      at: Date.now(),
    };
    if (previous) await ctx.db.patch(previous._id, record);
    else await ctx.db.insert("readinessScopes", record);
    await ctx.db.insert("readinessAudit", {
      campaignSlug: campaign.slug,
      nonprofitId: campaign.nonprofitId,
      actor: subject,
      source: "readiness:configureScope",
      at: record.at,
      version: 1,
      action: "scope-configured",
      revision: String(record.version),
      details: JSON.stringify(record),
    });
    return await evaluateCurrent(
      ctx,
      campaign,
      subject,
      "readiness:configureScope",
    );
  },
});

// Backend-only validation/provenance seam. A provider-specific trusted adapter
// must actually validate its facts before calling this function. No public
// approval mutation, arbitrary URL, research closure, assent or balance input.
// There are deliberately no production callers until their provider slices land.
export async function recordValidatedReadiness(
  ctx: MutationCtx,
  input: Infer<typeof readinessEvidenceValidator>,
  provenance: { source: string; actor: string; synthetic: boolean },
) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", input.campaignId))
    .unique();
  const component = readinessComponents.find((c) => c.id === input.component);
  if (
    !campaign ||
    !component ||
    campaign.nonprofitId !== input.nonprofitId ||
    (provenance.synthetic
      ? !campaign.fixtureRunId ||
        campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
      : !!campaign.fixtureRunId)
  )
    throw new Error("READINESS_EVIDENCE_SCOPE_DENIED");
  if (
    provenance.source !==
    (provenance.synthetic ? "owned-readiness-validator" : component.validator)
  )
    throw new Error("TRUSTED_READINESS_VALIDATOR_REQUIRED");
  if (!(await reviewerAuthorized(ctx, campaign, component, input.reviewer)))
    throw new Error("REVIEWED_OWNER_AUTHORITY_REQUIRED");
  const data = await scopeData(ctx, campaign);
  if (
    !accountBinding(component, data) ||
    input.revision !== data.revision ||
    input.account !== accountBinding(component, data)
  )
    throw new Error("READINESS_EVIDENCE_REVISION_OR_ACCOUNT_MISMATCH");
  if (
    requiresRelease(component) &&
    (!data.releaseTarget || input.releaseTarget !== data.releaseTarget.binding)
  )
    throw new Error("READINESS_RELEASE_TARGET_MISMATCH");
  const now = Date.now();
  if (
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt < 0 ||
    input.observedAt > now ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= now ||
    input.expiresAt <= input.observedAt ||
    !isDigest(input.digest) ||
    !provenance.actor ||
    provenance.actor.length > 128
  )
    throw new Error("INVALID_READINESS_EVIDENCE");
  if (
    input.outcome === "verified" &&
    evidenceFacts(component, input, false, data.settings)
  )
    throw new Error("REQUIRED_VALIDATED_FACTS_MISSING");
  const history = await ctx.db
    .query("readinessProofs")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaign.slug))
    .collect();
  const previous = history
    .filter((p) => p.component === component.id)
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (previous && input.sequence <= previous.sequence) {
    const {
      _id,
      _creationTime,
      source,
      actor,
      synthetic,
      at,
      version,
      ...previousInput
    } = previous;
    if (
      stableRequest(input) === stableRequest(previousInput) &&
      source === provenance.source &&
      actor === provenance.actor &&
      synthetic === provenance.synthetic
    )
      return { accepted: false, duplicate: true };
    throw new Error("STALE_OR_REORDERED_READINESS_EVIDENCE");
  }
  if (previous && input.observedAt < previous.observedAt)
    throw new Error("STALE_OR_REORDERED_READINESS_EVIDENCE");
  const proofId = await ctx.db.insert("readinessProofs", {
    ...input,
    ...provenance,
    at: now,
    version: 1,
  });
  await ctx.scheduler.runAt(input.expiresAt, expirationJob, {
    campaignId: campaign.slug,
    proofId,
  });
  await evaluateCurrent(ctx, campaign, provenance.actor, provenance.source);
  return { accepted: true, duplicate: false };
}
// Trusted release pipeline context is scope, never approval. No public setter.
export async function recordCurrentReleaseTarget(
  ctx: MutationCtx,
  input: Infer<typeof readinessReleaseValidator>,
  provenance: { source: string; actor: string; synthetic: boolean },
) {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", input.campaignId))
    .unique();
  if (
    !campaign ||
    campaign.nonprofitId !== input.nonprofitId ||
    (provenance.synthetic
      ? !campaign.fixtureRunId ||
        campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID
      : !!campaign.fixtureRunId) ||
    provenance.source !==
      (provenance.synthetic
        ? "owned-release-controller"
        : "trusted-release-controller")
  )
    throw new Error("TRUSTED_RELEASE_SCOPE_REQUIRED");
  if (
    !isDigest(input.environmentDigest) ||
    !isDigest(input.buildDigest) ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !Number.isSafeInteger(input.observedAt) ||
    input.observedAt < 0 ||
    input.observedAt > Date.now()
  )
    throw new Error("INVALID_RELEASE_TARGET");
  const history = await ctx.db
    .query("readinessReleaseTargets")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaign.slug))
    .collect();
  const previous = history.sort((a, b) => b.sequence - a.sequence)[0];
  if (
    previous &&
    (input.sequence <= previous.sequence ||
      input.observedAt < previous.observedAt)
  )
    throw new Error("STALE_RELEASE_TARGET");
  await ctx.db.insert("readinessReleaseTargets", {
    ...input,
    ...provenance,
    at: Date.now(),
    version: 1,
  });
  return await evaluateCurrent(
    ctx,
    campaign,
    provenance.actor,
    provenance.source,
  );
}
export const expire = internalMutation({
  args: { campaignId: v.string(), proofId: v.string() },
  handler: async (ctx, args) => {
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", args.campaignId))
      .unique();
    if (
      !campaign ||
      (campaign.fixtureRunId &&
        campaign.fixtureRunId !== process.env.ALLOCATION_PREVIEW_FIXTURE_RUN_ID)
    )
      return;
    const proofs = await ctx.db
      .query("readinessProofs")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign.slug))
      .collect();
    const proof = proofs.find((p) => p._id === args.proofId);
    if (!proof || proof.expiresAt > Date.now()) return;
    await evaluateCurrent(
      ctx,
      campaign,
      "trusted-expiry-monitor",
      "readiness:expire",
    );
  },
});
