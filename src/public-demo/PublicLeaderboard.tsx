import { TrendingUp, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { count, money, type PublicAd, type PublicCampaign } from "./catalog.ts";
import {
  completedWindow,
  loadPastResults,
  pastPeriods,
  type PastResult,
} from "./leaderboard-history.ts";
import {
  leaderboardWindow,
  type LeaderboardPeriod,
} from "./leaderboard-periods.ts";
import { LeaderRow } from "./LeaderRow.tsx";
import { DEMO_TARGETS, rankPublicAds, scorePublicAd } from "./ranking.ts";
import { useLeaderSimulation } from "./useLeaderSimulation.ts";

function LeaderTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      className="tabs leaderboard-period-tabs"
      role="tablist"
      aria-label={label}
    >
      {items.map((item, index) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          className={item.value === value ? "active" : ""}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowRight"
                    ? (index + 1) % items.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + items.length) % items.length
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(items[next].value);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

const dateLabel = (date: string) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const rangeLabel = (period: LeaderboardPeriod, start: string, end: string) =>
  period === "daily"
    ? dateLabel(start)
    : `${dateLabel(start)} – ${dateLabel(new Date(Date.parse(end) - 86400000).toISOString().slice(0, 10))}`;

export function PublicLeaderboard({
  ads,
  campaigns,
  period,
  onPeriod,
  campaign,
  onCampaign,
  search,
  view,
  onView,
  historyDate,
  onHistory,
}: {
  ads: PublicAd[] | null;
  campaigns: PublicCampaign[];
  period: LeaderboardPeriod;
  onPeriod: (value: LeaderboardPeriod) => void;
  campaign: string;
  onCampaign: (value: string) => void;
  search: string;
  view: "current" | "past";
  onView: (value: "current" | "past") => void;
  historyDate: string;
  onHistory: (period: LeaderboardPeriod, date: string) => void;
}) {
  const current = view === "current";
  const simulation = useLeaderSimulation(ads, period, current);
  const [history, setHistory] = useState<PastResult[]>([]);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    if (!ads) return;
    try {
      setHistory(loadPastResults(ads, campaigns));
      setHistoryError("");
    } catch {
      setHistoryError(
        "Past demo results could not be loaded. Your saved records have been kept.",
      );
    }
  }, [ads, campaigns]);
  const selectedDate = historyDate || pastPeriods(period)[0];
  const measurement = current
    ? leaderboardWindow(period)
    : completedWindow(period, selectedDate);
  const available = new Map((ads || []).map((ad) => [ad.id, ad]));
  const boards = campaigns
    .filter(({ id }) => campaign === "all" || campaign === id)
    .map(({ id, name }) => {
      const saved = history.find(
        (record) =>
          record.campaignId === id &&
          record.period === period &&
          record.date === selectedDate,
      );
      const ranked = current
        ? rankPublicAds(simulation.ads, id)
        : measurement
          ? saved?.winners || []
          : [];
      const previous = new Map(
        rankPublicAds(simulation.previous, id).map((ad) => [ad.id, ad.rank]),
      );
      return {
        id,
        name: !current && saved ? saved.campaignName : name,
        ranked,
        previous,
        winnerCount: ranked.filter((ad) => ad.rank === 1).length,
        visible: ranked.filter((ad) =>
          `${ad.title} ${ad.creator} ${ad.project}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        ),
      };
    });
  return (
    <section
      className="public-leaderboard"
      aria-label="Campaign leaderboard"
      data-simulation-step={simulation.tick}
    >
      <div className="leaderboard-view-bar">
        <LeaderTabs
          items={[
            { value: "current", label: "Current leaderboard" },
            { value: "past", label: "Past winners" },
          ]}
          value={view}
          onChange={onView}
          label="Leaderboard views"
        />
        <select
          aria-label="Leaderboard campaign"
          value={campaign}
          onChange={(event) => onCampaign(event.target.value)}
        >
          <option value="all">All campaigns</option>
          {campaigns.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {current ? (
        <>
          <div className="leaderboard-period-bar">
            <LeaderTabs
              items={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ]}
              value={period}
              onChange={onPeriod}
              label="Leaderboard period"
            />
            <div className="simulation-controls">
              <span
                className="leaderboard-countdown"
                role="timer"
                aria-label="Time until next leaderboard update"
              >
                Next update {simulation.countdown}
              </span>
              <span>Simulated updates every 10 minutes</span>
            </div>
          </div>
          <p className="leaderboard-date">
            {measurement &&
              rangeLabel(
                period,
                measurement.startsOn,
                measurement.endsBefore,
              )}{" "}
            · UTC · in progress
          </p>
          <p className="leaderboard-note">
            Current leaders only. Results are still in progress; no winner has
            been declared. Movement and metrics are simulated, with no real
            funding changes.
          </p>
        </>
      ) : (
        <>
          <div className="past-winner-filters">
            <label>
              Past daily winners
              <select
                aria-label="Past daily winners"
                value={period === "daily" ? selectedDate : ""}
                onChange={(event) =>
                  event.target.value && onHistory("daily", event.target.value)
                }
              >
                <option value="">Choose a completed day</option>
                {pastPeriods("daily").map((date) => (
                  <option key={date} value={date}>
                    {dateLabel(date)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Past weekly winners
              <select
                aria-label="Past weekly winners"
                value={period === "weekly" ? selectedDate : ""}
                onChange={(event) =>
                  event.target.value && onHistory("weekly", event.target.value)
                }
              >
                <option value="">Choose a completed week</option>
                {pastPeriods("weekly").map((date) => (
                  <option key={date} value={date}>
                    {rangeLabel(
                      "weekly",
                      date,
                      leaderboardWindow("weekly", new Date(date + "T12:00:00Z"))
                        .endsBefore,
                    )}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="leaderboard-date">
            {measurement
              ? rangeLabel(period, measurement.startsOn, measurement.endsBefore)
              : "Choose a completed day or week"}{" "}
            · UTC · completed sample period
          </p>
          <p className="leaderboard-note">
            Fictional past winners from completed periods. Saved results stay
            fixed while current leaders move; these records do not authorize
            payouts.
          </p>
          {historyError && <p role="alert">{historyError}</p>}
        </>
      )}
      <details className="leaderboard-scoring">
        <summary>Scoring method & demo targets</summary>
        <p>
          Impressions 40% · total link clicks 30% · funds raised 30%. Each
          component uses min(1, √(result ÷ target)). Demo targets:{" "}
          {count(DEMO_TARGETS.impressions)} impressions ·{" "}
          {count(DEMO_TARGETS.clicks)} total link clicks ·{" "}
          {money(DEMO_TARGETS.donatedCents)} raised.
        </p>
        <p>
          Compare unrounded scores, then total link clicks, funds raised and
          impressions. Exact ties share rank. CTR and ad-spend contributions do
          not affect scores. Missing inputs remain unranked. Days use midnight
          UTC; weeks use Monday through Sunday UTC.
        </p>
      </details>
      {boards
        .filter(
          (board) =>
            !search.trim() ||
            board.visible.length ||
            board.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .map((board) => (
          <section
            className="campaign-board"
            aria-label={`${board.name} leaderboard`}
            key={board.id}
          >
            <div className="section-toolbar">
              <h3>
                {current ? <TrendingUp size={15} /> : <Trophy size={15} />}
                {board.name}
              </h3>
              <span className="count-pill">
                {current
                  ? `${board.ranked.length} / 25 ads`
                  : `${board.ranked.length} ${board.ranked.length === 1 ? "winner" : "winners"}`}
              </span>
            </div>
            <div className="leaderboard-table-wrap">
              <table className="leaderboard-table">
                <caption className="sr-only">
                  {current ? "Current leaders" : `Past ${period} winners`} for{" "}
                  {board.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Ad / creator</th>
                    <th scope="col">Impressions</th>
                    <th scope="col">Total links clicked</th>
                    <th scope="col">Funding</th>
                    <th scope="col">Score / 100</th>
                  </tr>
                </thead>
                <tbody>
                  {board.visible.map((ad) => (
                    <LeaderRow
                      key={ad.id}
                      ad={ad}
                      current={current}
                      movement={
                        (board.previous.get(ad.id) ?? ad.rank) - ad.rank
                      }
                      available={
                        available.get(ad.id)?.media === ad.media
                          ? available.get(ad.id)
                          : undefined
                      }
                      badge={
                        current
                          ? ad.rank === 1
                            ? "Current leader"
                            : ""
                          : `${board.winnerCount > 1 ? "Joint " : ""}${period === "daily" ? "Daily" : "Weekly"} winner`
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {!board.visible.length && (
              <div className="compact-empty">
                <h3>
                  {board.ranked.length
                    ? "No matching ads."
                    : current
                      ? "No ranked ads yet."
                      : "No winner recorded."}
                </h3>
                <p>
                  {current
                    ? "Ads need impressions, total link clicks and funding data to receive a score."
                    : "There is no complete sample result for this campaign and period."}
                </p>
              </div>
            )}
            {current &&
              simulation.ads.some(
                (ad) =>
                  (ad.campaignId || ad.projectId) === board.id &&
                  scorePublicAd(ad) === null,
              ) && (
                <p className="leaderboard-note">
                  Ads missing performance data are awaiting a ranking.
                </p>
              )}
          </section>
        ))}
      {!ads && <p role="status">Loading leaderboard…</p>}
      {ads &&
        !boards.some((board) => board.visible.length) &&
        search.trim() && (
          <p className="leaderboard-note">
            No matching ads. Try another campaign or search.
          </p>
        )}
    </section>
  );
}
