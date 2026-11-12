import { chicagoDay, firstDayBaseline } from "./chicago.ts";
import {
  integer,
  money,
  percentOf,
  percentage,
  providerSplit,
} from "./money.ts";

export type AllocationInput = {
  at: number;
  authority: {
    revision: string;
    dailyLimitCents: number;
    totalLimitCents: number;
    dailyCommittedCents: number;
    campaignCommittedCents: number;
    capacity: number;
  };
  settings: {
    baselineCents: number;
    boostPercent: number;
    topCount: number;
    metaPercent: number;
    tiktokPercent: number;
    targets: { impressions: number; clicks: number; raisedCents: number };
  };
  finance: {
    status: "verified" | "unknown";
    source: string;
    asOf: number;
    availableCents: number;
    remainingBaselineReserveCents: number;
    obligations: {
      id: string;
      amountCents: number;
      coverage: "provider" | "local";
    }[];
    safety: {
      revision: string;
      reserveCents: number;
      maximumAgeMs: number;
    } | null;
  };
  scoreCoverage: "complete" | "startup" | "incomplete";
  providers: { meta: "available" | "blocked"; tiktok: "available" | "blocked" };
  entries: {
    id: string;
    createdAt: number;
    admittedAt: number;
    state: "funded" | "paused" | "stopping" | "waiting" | "cut";
    metrics: {
      impressions: number | null;
      clicks: number | null;
      raisedCents: number | null;
    };
  }[];
};

export type AllocationResult = {
  status: "ready" | "boosts-held" | "blocked";
  reasons: string[];
  day: string;
  occupiedSlots: number;
  eligibleEntries: number;
  baselineCents: number;
  boostCents: number;
  headroomCents: number;
  uncommittedCents: number;
  selectedCount: number;
  targets: {
    entryId: string;
    baselineCents: number;
    boostCents: number;
    metaCents: number;
    tiktokCents: number;
    heldMetaCents: number;
    heldTiktokCents: number;
    score: number | null;
  }[];
};

export function planAllocation(input: AllocationInput): AllocationResult {
  const result: AllocationResult = {
    status: "blocked",
    reasons: [],
    day: "",
    occupiedSlots: 0,
    eligibleEntries: 0,
    baselineCents: 0,
    boostCents: 0,
    headroomCents: 0,
    uncommittedCents: 0,
    selectedCount: 0,
    targets: [],
  };
  try {
    const { authority, settings, finance } = input;
    if (!Number.isSafeInteger(input.at) || input.at < 0)
      throw new Error("Invalid calculation timestamp");
    const day = chicagoDay(input.at);
    result.day = day.label;
    const baseline = money(settings.baselineCents);
    if (baseline <= 0n) throw new Error("Daily baseline must be positive");
    if (!Number.isSafeInteger(settings.topCount) || settings.topCount <= 0)
      throw new Error("Boost count must be a positive integer");
    percentage(settings.boostPercent);
    const [metaN, metaD] = percentage(settings.metaPercent);
    const [tiktokN, tiktokD] = percentage(settings.tiktokPercent);
    if (metaN * tiktokD + tiktokN * metaD !== metaD * tiktokD)
      throw new Error("Provider shares must total 100%");
    for (const target of Object.values(settings.targets))
      if (!Number.isSafeInteger(target) || target <= 0)
        throw new Error("Scoring targets must be positive safe integers");
    if (!Number.isSafeInteger(authority.capacity) || authority.capacity < 0)
      throw new Error("Invalid campaign capacity");
    if (!authority.revision.trim())
      throw new Error("Authority revision is required");
    for (const entry of input.entries)
      if (
        !entry.id.trim() ||
        !Number.isSafeInteger(entry.createdAt) ||
        entry.createdAt < 0
      )
        throw new Error("Stable entry identity and creation time are required");
    if (
      new Set(input.entries.map((entry) => entry.id)).size !==
      input.entries.length
    )
      throw new Error("Duplicate entry identity");
    result.occupiedSlots = input.entries.filter((entry) =>
      ["funded", "paused", "stopping"].includes(entry.state),
    ).length;
    if (result.occupiedSlots > authority.capacity)
      throw new Error("Campaign capacity is exceeded");
    const eligible = input.entries.filter((entry) => entry.state === "funded");
    result.eligibleEntries = eligible.length;
    const baselines = new Map(
      eligible.map((entry) => [
        entry.id,
        firstDayBaseline(baseline, entry.admittedAt, input.at, day),
      ]),
    );
    const baselineTotal = [...baselines.values()].reduce(
      (sum, amount) => sum + amount,
      0n,
    );
    const daily =
      money(authority.dailyLimitCents) - money(authority.dailyCommittedCents);
    const total =
      money(authority.totalLimitCents) -
      money(authority.campaignCommittedCents);
    const protectedBaseline = money(finance.remainingBaselineReserveCents);
    if (!finance.safety)
      throw new Error("Financial safety configuration is required");
    if (!finance.safety.revision.trim())
      throw new Error("Financial safety revision is required");
    const safety = money(finance.safety.reserveCents);
    if (
      !Number.isSafeInteger(finance.safety.maximumAgeMs) ||
      finance.safety.maximumAgeMs <= 0
    )
      throw new Error("Financial freshness limit must be positive");
    if (
      !Number.isSafeInteger(finance.asOf) ||
      finance.asOf > input.at ||
      input.at - finance.asOf > finance.safety.maximumAgeMs
    )
      throw new Error("Financial evidence is stale or invalid");
    if (finance.status !== "verified" || !finance.source.trim())
      throw new Error("Reliable financial evidence is required");
    const available = money(finance.availableCents, true);
    if (
      new Set(finance.obligations.map((row) => row.id)).size !==
      finance.obligations.length
    )
      throw new Error("Duplicate obligation identity");
    let additional = 0n;
    for (const obligation of finance.obligations) {
      const amount = money(obligation.amountCents);
      if (obligation.coverage === "local") additional += amount;
    }
    if (
      protectedBaseline < baselineTotal ||
      available < protectedBaseline + safety + additional ||
      daily < baselineTotal ||
      total < protectedBaseline
    )
      throw new Error(
        "Insufficient coverage for protected full-run baseline and obligations",
      );
    const cashHeadroom = available - protectedBaseline - safety - additional;
    const dailyHeadroom = daily - baselineTotal;
    const totalHeadroom = total - protectedBaseline;
    const headroom = [cashHeadroom, dailyHeadroom, totalHeadroom].reduce(
      (a, b) => (a < b ? a : b),
    );
    const pool = percentOf(headroom, settings.boostPercent);
    const scored = eligible.map((entry) => {
      const m = entry.metrics;
      const usable = Object.values(m).every(
        (value) => value !== null && Number.isSafeInteger(value) && value >= 0,
      );
      const component = (value: number, target: number) =>
        Math.min(1, Math.sqrt(value / target));
      const score = usable
        ? 40 * component(m.impressions!, settings.targets.impressions) +
          30 * component(m.clicks!, settings.targets.clicks) +
          30 * component(m.raisedCents!, settings.targets.raisedCents)
        : null;
      return { entry, score };
    });
    const compare = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
      b.score! - a.score! ||
      b.entry.metrics.clicks! - a.entry.metrics.clicks! ||
      b.entry.metrics.raisedCents! - a.entry.metrics.raisedCents! ||
      b.entry.metrics.impressions! - a.entry.metrics.impressions!;
    const ranked = [...scored].sort(
      (a, b) => compare(a, b) || (a.entry.id < b.entry.id ? -1 : 1),
    );
    const cutoff = ranked[Math.min(settings.topCount, ranked.length) - 1];
    const startupConflict =
      input.scoreCoverage === "startup" &&
      scored.some((row) => row.score !== null && row.score > 0);
    const boostsHeld =
      eligible.length > 0 &&
      (startupConflict ||
        input.scoreCoverage === "incomplete" ||
        (input.scoreCoverage === "complete" &&
          scored.some((row) => row.score === null)));
    const selected = boostsHeld
      ? []
      : input.scoreCoverage === "startup"
        ? scored
        : cutoff
          ? ranked.filter(
              (row, index) =>
                index < settings.topCount || compare(row, cutoff) === 0,
            )
          : [];
    const remainderOrder = [...selected].sort(
      (a, b) =>
        a.entry.createdAt - b.entry.createdAt ||
        (a.entry.id < b.entry.id ? -1 : 1),
    );
    const boosts = new Map<string, bigint>();
    if (selected.length) {
      const each = pool / BigInt(selected.length);
      const remainder = integer(pool % BigInt(selected.length));
      remainderOrder.forEach((row, i) =>
        boosts.set(row.entry.id, each + (i < remainder ? 1n : 0n)),
      );
    }
    result.targets = scored.map(({ entry, score }) => {
      const boost = boosts.get(entry.id) ?? 0n;
      const entryBaseline = baselines.get(entry.id)!;
      const [metaCents, tiktokCents] = providerSplit(
        entryBaseline + boost,
        settings.metaPercent,
      );
      return {
        entryId: entry.id,
        baselineCents: integer(entryBaseline),
        boostCents: integer(boost),
        metaCents,
        tiktokCents,
        heldMetaCents: input.providers.meta === "blocked" ? metaCents : 0,
        heldTiktokCents: input.providers.tiktok === "blocked" ? tiktokCents : 0,
        score,
      };
    });
    result.status = boostsHeld ? "boosts-held" : "ready";
    if (boostsHeld)
      result.reasons.push(
        startupConflict
          ? "Startup conflicts with existing performance; new boosts are held until score coverage is confirmed"
          : "Required score coverage is incomplete; new boosts are held",
      );
    result.baselineCents = integer(baselineTotal);
    result.boostCents = selected.length ? integer(pool) : 0;
    result.headroomCents = integer(headroom);
    result.uncommittedCents = integer(headroom - BigInt(result.boostCents));
    result.selectedCount = selected.length;
    return result;
  } catch (err) {
    result.status = "blocked";
    result.reasons.push(
      err instanceof Error ? err.message : "Invalid allocation input",
    );
    result.targets = [];
    result.baselineCents =
      result.boostCents =
      result.headroomCents =
      result.uncommittedCents =
      result.selectedCount =
        0;
    return result;
  }
}
