import { ArrowUpRight, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { AdMedia } from "./AdMedia.tsx";
import { AdStats } from "./AdStats.tsx";
import { durationLabel, type PublicAd } from "./catalog.ts";

export function AdCard({
  ad,
  badge,
  autoPreview = false,
  previewPaused = false,
  onSupport,
}: {
  ad: PublicAd;
  badge?: string;
  autoPreview?: boolean;
  previewPaused?: boolean;
  onSupport: (ad: PublicAd) => void;
}) {
  return (
    <article className="ad-card">
      <div className="ad-card-media">
        {ad.mediaType === "video" ? (
          <AdMedia
            ad={ad}
            autoPreview={autoPreview}
            previewPaused={previewPaused}
          />
        ) : (
          <Link to={`/ads/${ad.id}`} aria-label={`View ${ad.title}`}>
            <AdMedia ad={ad} />
          </Link>
        )}
        {badge && <span className="ad-feature-badge">{badge}</span>}
        {ad.durationSeconds && (
          <span className="ad-duration">
            {durationLabel(ad.durationSeconds)}
          </span>
        )}
      </div>
      <div className="ad-card-copy">
        <p className="ad-card-cause">
          {ad.category}
          <ArrowUpRight size={13} />
        </p>
        <Link
          to={`/ads/${ad.id}`}
          aria-label={ad.mediaType === "video" ? `View ${ad.title}` : undefined}
        >
          <h3>{ad.title}</h3>
        </Link>
        <p className="ad-byline">
          By {ad.creator} · {ad.project}
        </p>
        <p className="ad-description">
          {ad.caption.length > 132
            ? `${ad.caption.slice(0, 129).trimEnd()}…`
            : ad.caption}
        </p>
        <AdStats ad={ad} />
        <button
          className="button secondary full card-fund"
          onClick={() => onSupport(ad)}
        >
          Fund ad spend <Heart size={14} />
        </button>
      </div>
    </article>
  );
}
