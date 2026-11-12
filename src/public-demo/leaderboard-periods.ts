import type { PublicAd } from "./catalog.ts";

export type LeaderboardPeriod = "daily" | "weekly";
export type DailyMetrics = {
  date: string;
  impressions: number | null;
  clicks: number | null;
  donatedCents: number | null;
};
export type LeaderboardWindow = {
  period: LeaderboardPeriod;
  startsOn: string;
  endsBefore: string;
  through: string;
};
const DAY = 86_400_000;

// Explicit demo convention. Production daily boundaries remain a PRD decision.
export function leaderboardWindow(
  period: LeaderboardPeriod,
  now = new Date(),
): LeaderboardWindow {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const offset = period === "weekly" ? (now.getUTCDay() + 6) % 7 : 0;
  const start = today - offset * DAY;
  const date = (value: number) => new Date(value).toISOString().slice(0, 10);
  return {
    period,
    startsOn: date(start),
    endsBefore: date(start + (period === "weekly" ? 7 : 1) * DAY),
    through: date(today),
  };
}

export function periodAd(ad: PublicAd, window: LeaderboardWindow): PublicAd {
  const days = ad.performanceDays || [];
  const totals = { impressions: 0, clicks: 0, donatedCents: 0 };
  const fields = ["impressions", "clicks", "donatedCents"] as const;
  // Each elapsed day needs one complete bucket; missing evidence is not zero.
  for (
    let at = Date.parse(window.startsOn + "T00:00:00Z");
    at <= Date.parse(window.through + "T00:00:00Z");
    at += DAY
  ) {
    const date = new Date(at).toISOString().slice(0, 10);
    const records = days.filter(
      (day) => day.date === date && day.date < window.endsBefore,
    );
    if (
      records.length !== 1 ||
      fields.some(
        (field) =>
          records[0][field] === null ||
          !Number.isSafeInteger(records[0][field]) ||
          records[0][field]! < 0,
      )
    )
      return { ...ad, impressions: null, clicks: null, donatedCents: null };
    for (const field of fields) totals[field] += records[0][field]!;
  }
  return { ...ad, ...totals };
}

// Fictional dated fixtures preserve existing sample totals as this week's totals.
export function samplePerformanceDays(
  id: string,
  totals: Pick<DailyMetrics, "impressions" | "clicks" | "donatedCents">,
  now = new Date(),
): DailyMetrics[] {
  const window = leaderboardWindow("weekly", now);
  const elapsed = Math.round(
    (Date.parse(window.through) - Date.parse(window.startsOn)) / DAY,
  );
  const share =
    (
      {
        "nocturne-midnight": 0.15,
        "nocturne-espresso": 0.7,
        "nocturne-afterhours": 0.4,
        "sample-1": 0.55,
        "sample-2": 0.3,
        "sample-3": 0.25,
      } as Record<string, number>
    )[id] ?? 0.5;
  const current = Array.from({ length: elapsed + 1 }, (_, index) => {
    const valueForDay = (value: number | null) => {
      if (value === null) return null;
      const today = elapsed === 0 ? value : Math.floor(value * share);
      const prior = value - today;
      return index === elapsed
        ? today
        : Math.floor(prior / elapsed) + (index < prior % elapsed ? 1 : 0);
    };
    return {
      date: new Date(Date.parse(window.startsOn) + index * DAY)
        .toISOString()
        .slice(0, 10),
      impressions: valueForDay(totals.impressions),
      clicks: valueForDay(totals.clicks),
      donatedCents: valueForDay(totals.donatedCents),
    };
  });
  const historical = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(Date.parse(window.startsOn) - (index + 1) * DAY)
      .toISOString()
      .slice(0, 10);
    const seed = [...`${id}:${date}`].reduce(
      (sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0,
      17,
    );
    const factor = 500 + (seed % 5500);
    const portion = (value: number | null) =>
      value === null ? null : Math.floor((value * factor) / 10000);
    return {
      date,
      impressions: portion(totals.impressions),
      clicks: portion(totals.clicks),
      donatedCents: portion(totals.donatedCents),
    };
  });
  return [...current, ...historical];
}
