import { useEffect, useMemo, useState } from "react";
import type { PublicAd } from "./catalog.ts";
import {
  leaderboardWindow,
  periodAd,
  type LeaderboardPeriod,
} from "./leaderboard-periods.ts";
import { simulateLeaders } from "./leaderboard-simulation.ts";

export const LEADERBOARD_UPDATE_INTERVAL = 10 * 60 * 1000;
export function useLeaderSimulation(
  ads: PublicAd[] | null,
  period: LeaderboardPeriod,
  enabled: boolean,
) {
  const [schedule, setSchedule] = useState(() => ({
    at: Date.now(),
    tick: 0,
    remaining: LEADERBOARD_UPDATE_INTERVAL / 1000,
  }));
  useEffect(() => {
    if (!enabled || !ads) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setSchedule((old) => {
        const elapsed = Math.max(0, now - old.at);
        const updates = Math.floor(elapsed / LEADERBOARD_UPDATE_INTERVAL);
        return {
          at: old.at + updates * LEADERBOARD_UPDATE_INTERVAL,
          tick: old.tick + updates,
          remaining: Math.ceil(
            (LEADERBOARD_UPDATE_INTERVAL -
              (elapsed % LEADERBOARD_UPDATE_INTERVAL)) /
              1000,
          ),
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, ads]);
  const measurement = leaderboardWindow(period);
  const base = useMemo(
    () => (ads || []).map((ad) => periodAd(ad, measurement)),
    [ads, measurement.startsOn, measurement.through, period, schedule.at],
  );
  return {
    ads: simulateLeaders(base, schedule.tick),
    previous: simulateLeaders(base, Math.max(0, schedule.tick - 1)),
    tick: schedule.tick,
    countdown: `${String(Math.floor(schedule.remaining / 60)).padStart(2, "0")}:${String(schedule.remaining % 60).padStart(2, "0")}`,
  };
}
