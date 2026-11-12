import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context.tsx";
import { AdMedia } from "./AdMedia.tsx";
import { count, loadAds, loadPublicCampaigns, money } from "./catalog.ts";
import { creatorLeaderboardWins, type CreatorWin } from "./creator-wins.ts";
import { useFinancialSamples } from "./FinancialSamples.tsx";
import { loadPastResults } from "./leaderboard-history.ts";
import {
  leaderboardWindow,
  type LeaderboardPeriod,
} from "./leaderboard-periods.ts";

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
function periodLabel(win: CreatorWin) {
  if (win.period === "daily") return dateLabel(win.date);
  const window = leaderboardWindow("weekly", new Date(`${win.date}T12:00:00Z`));
  return `${dateLabel(win.date)} – ${dateLabel(new Date(Date.parse(window.endsBefore) - 86400000).toISOString().slice(0, 10))}`;
}

function WinCard({
  period,
  wins,
}: {
  period: LeaderboardPeriod;
  wins: CreatorWin[];
}) {
  const { access } = useWorkspace();
  const [selected, setSelected] = useState("");
  const win = wins.find((entry) => entry.id === selected) || wins[0];
  const label = period === "daily" ? "Daily" : "Weekly";
  return (
    <section
      data-ad-preview
      className="creator-win-card"
      aria-label={`Past ${period} wins`}
    >
      <div className="section-toolbar">
        <h3>
          <Trophy size={14} aria-hidden="true" /> {label} wins
        </h3>
        <span className="count-pill">
          {wins.length} {wins.length === 1 ? "win" : "wins"}
        </span>
      </div>
      {win ? (
        <>
          <select
            aria-label={`Your past ${period} wins`}
            value={win.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {wins.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {periodLabel(entry)} · {entry.campaignName}
              </option>
            ))}
          </select>
          <div className="creator-win-ad">
            <span className="earnings-ad-thumbnail">
              <AdMedia ad={win.ad} access={access} previewOnly />
            </span>
            <div>
              <h4>{win.ad.title}</h4>
              <p className="creator-win-byline">
                {win.ad.creator} · {win.campaignName}
              </p>
            </div>
          </div>
          <span className="creator-win-badge">
            {win.joint ? "Joint " : ""}
            {label} winner · sample
          </span>
          <dl className="creator-win-metrics">
            <div>
              <dt>Impressions</dt>
              <dd>{count(win.ad.impressions)}</dd>
            </div>
            <div>
              <dt>Total link clicks</dt>
              <dd>{count(win.ad.clicks)}</dd>
            </div>
            <div>
              <dt>Funding</dt>
              <dd>{money(win.ad.donatedCents!)}</dd>
            </div>
            <div>
              <dt>Score / 100</dt>
              <dd>{win.ad.score.toFixed(2)}</dd>
            </div>
          </dl>
          <Link
            className="text-button"
            to={`/leaderboard?campaign=${encodeURIComponent(win.campaignId)}&view=past&period=${period}&date=${win.date}`}
          >
            View {period} result ↗
          </Link>
        </>
      ) : (
        <p className="metrics-note">
          No {period} wins recorded for your ads in recent completed periods.
        </p>
      )}
    </section>
  );
}

export function CreatorWins() {
  const { access, posts } = useWorkspace();
  const creatorId = access.creatorId;
  const { enabled } = useFinancialSamples();
  const [loaded, setLoaded] = useState<{
    creatorId: string;
    wins?: CreatorWin[];
    error?: string;
  }>();
  useEffect(() => {
    let current = true;
    async function load() {
      if (!creatorId || !enabled) return;
      try {
        const [ads, campaigns] = await Promise.all([
          loadAds(),
          loadPublicCampaigns(),
        ]);
        const wins = creatorLeaderboardWins(
          creatorId,
          loadPastResults(ads, campaigns),
        );
        if (current) setLoaded({ creatorId, wins });
      } catch {
        if (current)
          setLoaded({
            creatorId,
            error:
              "Past wins could not be loaded. Your earnings and saved results have been kept.",
          });
      }
    }
    void load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    return () => {
      current = false;
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
    };
  }, [creatorId, posts, enabled]);
  const own = loaded?.creatorId === creatorId ? loaded : undefined;
  return (
    <section className="creator-wins" aria-labelledby="creator-wins-title">
      <h2 className="earnings-section-title" id="creator-wins-title">
        Past leaderboard wins
      </h2>
      <p className="metrics-note">
        Recent completed periods · fictional results. Wins do not add to
        earnings or authorize payouts.
      </p>
      {!enabled ? (
        <p className="metrics-note">
          Sample wins are hidden. Enable Include sample activity to view them.
        </p>
      ) : own?.error ? (
        <p role="alert">{own.error}</p>
      ) : !own?.wins ? (
        <p role="status">Loading your past wins…</p>
      ) : (
        <div className="creator-win-grid" key={creatorId}>
          {(["daily", "weekly"] as const).map((period) => (
            <WinCard
              key={period}
              period={period}
              wins={own.wins!.filter((win) => win.period === period)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
