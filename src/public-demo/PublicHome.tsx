import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Globe2,
  Pause,
  Play,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { PublicAd, PublicCampaign } from "./catalog";
import { AdCard } from "./AdCard";
import { AdMedia } from "./AdMedia";
import {
  loadPastResults,
  pastPeriods,
  type PastResult,
} from "./leaderboard-history";
import { leaderboardWindow } from "./leaderboard-periods";
import { rankPublicAds } from "./ranking";
import { useLeaderSimulation } from "./useLeaderSimulation";
import { MissionVisual, StepVisual } from "./HomeStoryVisuals";

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function PublicHome({
  ads,
  campaigns,
  onSupport,
}: {
  ads: PublicAd[] | null;
  campaigns: PublicCampaign[];
  onSupport: (ad: PublicAd) => void;
}) {
  const simulation = useLeaderSimulation(ads, "weekly", true);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [history, setHistory] = useState<PastResult[]>([]);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    if (!ads) return;
    try {
      setHistory(loadPastResults(ads, campaigns));
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
  }, [ads, campaigns]);
  const current = campaigns.flatMap((campaign) =>
    rankPublicAds(simulation.ads, campaign.id).filter((ad) => ad.rank === 1),
  );
  const lastWeek = pastPeriods("weekly")[0];
  const available = new Map((ads || []).map((ad) => [ad.id, ad]));
  const past = history
    .filter((result) => result.period === "weekly" && result.date === lastWeek)
    .flatMap((result) => result.winners)
    .filter((ad) => available.has(ad.id))
    .map((ad) => ({
      ...ad,
      media: available.get(ad.id)!.media,
      poster: available.get(ad.id)!.poster,
      mediaType: available.get(ad.id)!.mediaType,
    }));
  const week = leaderboardWindow("weekly");
  const featured =
    ads?.find((ad) => ad.id === "adoption-girl-in-the-middle") ||
    ads?.find((ad) => ad.category === "Adoption") ||
    ads?.[0];
  return (
    <div className="public-home">
      <section className="ripple-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <span className="home-eyebrow">
            <span className="live-dot" /> ADOPTION.IS · STORIES FOR GOOD
          </span>
          <h1 id="home-title">
            Stories travel <br />
            further <em> together.</em>
          </h1>
          <p>
            Discover the creativity behind a cause. Help the stories that move
            you reach the people who can make a difference.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/explore">
              Find your cause <ArrowUpRight size={17} />
            </Link>
            <Link className="hero-how-link" to="/?section=how-it-works">
              How it works <ArrowDown size={15} />
            </Link>
          </div>
          <div className="hero-open-note">
            <Globe2 size={16} /> Open to everyone. Start with a story.
          </div>
        </div>
        <div className="hero-feature" data-ad-preview>
          {featured ? (
            <AdMedia ad={featured} autoPreview previewPaused={previewPaused} />
          ) : (
            <div className="hero-placeholder" />
          )}
          <div className="hero-feature-top">
            <span className="feature-label">
              A LITTLE CONNECTION. A GREATER REACH.
            </span>
            <AudioLines size={20} />
          </div>
          <div className="hero-feature-copy">
            <span>One story can change what comes next.</span>
            {featured && (
              <Link to={`/ads/${featured.id}`}>
                {featured.title}
                <ArrowUpRight size={22} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section
        id="mission"
        className="ripple-mission"
        aria-labelledby="mission-title"
      >
        <div className="mission-visual-column">
          <span className="home-eyebrow">OUR WHY</span>
          <MissionVisual />
        </div>
        <div>
          <h2 id="mission-title">Our mission.</h2>
          <p>
            [Mission statement placeholder — share adoption.is’s purpose, who
            we serve, and how we make a difference.]
          </p>
          <h3 id="vision-title">Our vision.</h3>
          <p>
            [Vision statement placeholder — describe the future adoption.is is
            working toward and the lasting impact we hope to create.]
          </p>
          <Link to="/explore" className="home-section-link">
            Meet the stories <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>

      <section
        id="how-it-works"
        className="home-how"
        aria-labelledby="how-title"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-eyebrow">YOUR REACH STARTS HERE</span>
            <h2 id="how-title">From a story to something more.</h2>
            <p>Three simple ways to be part of it.</p>
          </div>
        </div>
        <div className="how-steps">
          <div>
            <StepVisual step="discover" />
            <span>01 / DISCOVER</span>
            <h3>Find a cause you feel.</h3>
            <p>
              Explore ads made by independent creators. Watch for free, browse
              causes, and see the stories leading each campaign.
            </p>
            <Link to="/explore">
              Discover ads <ArrowUpRight size={14} />
            </Link>
          </div>
          <div>
            <StepVisual step="connect" />
            <span>02 / CONNECT</span>
            <h3>Get to know the story.</h3>
            <p>
              Open an ad to meet its creator, learn about the cause, and explore
              its performance. Press Play whenever you want sound.
            </p>
            <Link to="/leaderboard">
              Explore the leaderboard <ArrowUpRight size={14} />
            </Link>
          </div>
          <div>
            <StepVisual step="amplify" />
            <span>03 / AMPLIFY</span>
            <h3>Help it reach further.</h3>
            <p>
              Create a viewer profile and try funding ad spend. This supports
              distribution and includes a 10% creator share, separately from
              gifts to the cause.
            </p>
            <Link to="/viewer">
              Create your viewer profile <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <p className="home-data-note">
          You’re exploring a working demo. Profiles and simulated contributions
          stay in your browser. No real payments or ad delivery.
        </p>
      </section>

      <div className="home-intro-strip">
        <span>
          <AudioLines size={16} /> Watch a story. Find a connection. Extend its
          reach.
        </span>
        <div className="preview-tools">
          <span>Muted previews · Play for sound</span>
          <button onClick={() => setPreviewPaused(!previewPaused)}>
            {previewPaused ? <Play size={13} /> : <Pause size={13} />}
            {previewPaused ? "Resume previews" : "Pause previews"}
          </button>
        </div>
      </div>

      <section
        id="current-leaders"
        className="home-showcase"
        aria-labelledby="current-leaders-title"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-eyebrow">
              <span className="live-dot" /> IN THE MAKING
            </span>
            <h2 id="current-leaders-title">This week’s leaders</h2>
            <p>The stories leading their campaigns right now.</p>
          </div>
          <Link to="/leaderboard?period=weekly" className="home-section-link">
            Full leaderboard <ArrowRight size={17} />
          </Link>
        </div>
        <div className="showcase-period">
          <span>
            {shortDate(week.startsOn)} –{" "}
            {shortDate(
              new Date(Date.parse(week.endsBefore) - 86400000)
                .toISOString()
                .slice(0, 10),
            )}{" "}
            · UTC
          </span>
          <span className="current-status">
            In progress · next update {simulation.countdown}
          </span>
        </div>
        <div className="ad-grid">
          {current.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              badge="Weekly campaign leader"
              autoPreview
              previewPaused={previewPaused}
              onSupport={onSupport}
            />
          ))}
        </div>
        {!ads ? (
          <p role="status">Gathering this week’s stories…</p>
        ) : (
          !current.length && (
            <p className="metrics-note">
              No weekly leaders yet. Campaigns need complete performance data
              before an ad can be ranked.
            </p>
          )
        )}
        <p className="home-data-note">
          Each ad leads its own campaign. Results are provisional; performance
          and updates are simulated.
        </p>
      </section>

      <section
        id="past-leaders"
        className="home-showcase"
        aria-labelledby="past-leaders-title"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-eyebrow">
              <Trophy size={14} /> THE WEEK THAT MADE WAVES
            </span>
            <h2 id="past-leaders-title">Last week’s top performers</h2>
            <p>A little inspiration from the stories that led the way.</p>
          </div>
          <Link
            to={`/leaderboard?view=past&period=weekly&date=${lastWeek}`}
            className="home-section-link"
          >
            Past winners <ArrowRight size={17} />
          </Link>
        </div>
        <div className="showcase-period">
          <span>
            {shortDate(lastWeek)} –{" "}
            {shortDate(
              new Date(Date.parse(lastWeek) + 6 * 86400000)
                .toISOString()
                .slice(0, 10),
            )}{" "}
            · UTC
          </span>
          <span>Completed week · campaign winners</span>
        </div>
        <div className="ad-grid">
          {past.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              badge="Last week’s campaign winner"
              autoPreview
              previewPaused={previewPaused}
              onSupport={onSupport}
            />
          ))}
        </div>
        {historyError ? (
          <p role="alert">
            Past demo results could not be loaded. Your saved records have been
            kept.
          </p>
        ) : (
          ads &&
          !past.length && (
            <p className="metrics-note">
              No available winners for last week yet.
            </p>
          )
        )}
        <p className="home-data-note">
          Saved fictional results from the last completed Monday–Sunday week.
          Only currently public ads are shown.
        </p>
      </section>

      <div className="home-closing">
        <div>
          <span className="home-eyebrow">EVERY RIPPLE STARTS SOMEWHERE</span>
          <h2>Let’s make some good travel.</h2>
        </div>
        <Link to="/explore" className="button primary">
          Explore the stories <ArrowUpRight size={17} />
        </Link>
      </div>
    </div>
  );
}
