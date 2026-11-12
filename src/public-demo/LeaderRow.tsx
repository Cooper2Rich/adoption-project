import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AdMedia } from "./AdMedia.tsx";
import { count, money, type PublicAd } from "./catalog.ts";
import type { ScoredAd } from "./ranking.ts";

export function LeaderRow({
  ad,
  current,
  movement = 0,
  badge,
  available,
}: {
  ad: ScoredAd;
  current: boolean;
  movement?: number;
  badge: string;
  available?: PublicAd;
}) {
  const change =
    movement > 0
      ? `Up ${movement} ${movement === 1 ? "place" : "places"}`
      : movement < 0
        ? `Down ${-movement} ${movement === -1 ? "place" : "places"}`
        : "Rank unchanged";
  const content = (
    <>
      <span className="leaderboard-thumbnail">
        {available ? (
          <AdMedia ad={available} previewOnly />
        ) : (
          <span className="unavailable-ad">Ad</span>
        )}
      </span>
      <span className="leaderboard-copy">
        <strong>{ad.title}</strong>
        <small>{ad.creator}</small>
        {badge && (
          <span className={current ? "leader-badge" : "winner-badge"}>
            {current ? <TrendingUp size={12} /> : <Trophy size={12} />}
            {badge}
          </span>
        )}
        {!available && <small>Ad no longer public</small>}
      </span>
      {available && <ArrowUpRight size={14} />}
    </>
  );
  return (
    <tr
      data-ad-preview
      className={
        badge
          ? current
            ? "leaderboard-leading"
            : "leaderboard-winner"
          : undefined
      }
    >
      <td className="rank-cell">
        {String(ad.rank).padStart(2, "0")}
        {current && (
          <span
            className={`rank-movement ${movement > 0 ? "up" : movement < 0 ? "down" : "unchanged"}`}
            aria-label={change}
          >
            {movement > 0 ? (
              <>
                <ArrowUp size={12} />
                {movement}
              </>
            ) : movement < 0 ? (
              <>
                <ArrowDown size={12} />
                {-movement}
              </>
            ) : (
              "—"
            )}
          </span>
        )}
      </td>
      <td>
        {available ? (
          <Link className="leaderboard-ad" to={`/ads/${ad.id}`}>
            {content}
          </Link>
        ) : (
          <div className="leaderboard-ad">{content}</div>
        )}
      </td>
      <td data-label="Impressions">{count(ad.impressions)}</td>
      <td data-label="Link clicks">{count(ad.clicks)}</td>
      <td data-label="Funding">{money(ad.donatedCents!)}</td>
      <td
        data-label="Score"
        className="leaderboard-amount"
        title={String(ad.score)}
      >
        {ad.score.toFixed(2)}
      </td>
    </tr>
  );
}
