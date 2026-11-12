import { ArrowUpRight, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ReviewDialog } from "../components/ReviewDialog.tsx";
import { EmptyState, Media, Modal, StatusBadge } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import type { Post } from "../types.ts";
import { AdMedia } from "./AdMedia.tsx";
import { AdStats } from "./AdStats.tsx";
import { CampaignBudgetPanel } from "./CampaignBudgetBreakdown.tsx";
import {
  durationLabel,
  loadAds,
  money,
  viewerState,
  type PublicAd,
} from "./catalog.ts";
import { CompletedAdSpend } from "./CompletedAdSpend.tsx";
import { useCreatorEarnings } from "./CreatorEarnings.tsx";
import { FinancialSampleControl } from "./FinancialSamples.tsx";

export function CreatorPastAds() {
  return <CreatorAds past />;
}
export function CreatorAds({ past = false }: { past?: boolean }) {
  const {
    posts,
    projects,
    identity,
    search,
    access,
    ownPastAds = [],
    ownArchivedPosts = [],
  } = useWorkspace();
  const navigate = useNavigate();
  const earnings = useCreatorEarnings();
  const [ads, setAds] = useState<PublicAd[]>([]),
    [selected, setSelected] = useState<Post | null>(null);
  useEffect(() => {
    void loadAds().then(setAds);
  }, [posts]);
  const pastById = new Map(ownPastAds.map((record) => [record.postId, record]));
  const own = posts.filter((p) => p.creatorId === identity?.id);
  const filtered = own.filter(
    (p) =>
      past === pastById.has(p.id) &&
      `${p.title} ${p.caption} ${pastById.get(p.id)?.campaign || projects.find((project) => project.id === p.projectId)?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="creator-ads compact-ads" aria-label="Your ads">
      <div className="page-heading">
        <div>
          <h1>
            {past ? "Past ads" : "My ads"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {past
              ? "Your ads from ended, archived or unpublished projects, plus withdrawn ads."
              : "Manage your ads, performance and past work."}
          </p>
        </div>
        <Link className="button primary" to="/projects">
          Create an ad <ArrowUpRight size={17} />
        </Link>
      </div>
      <FinancialSampleControl />
      <div className="creator-summary">
        <div>
          <small>My ads</small>
          <strong>{own.length}</strong>
        </div>
        <div>
          <small>Eligible now</small>
          <strong>
            {
              own.filter(
                (p) =>
                  p.status === "approved" &&
                  !pastById.has(p.id) &&
                  !p.withdrawnAt,
              ).length
            }
          </strong>
        </div>
        <Link className="creator-earnings-link" to="/earnings">
          <small>My earnings · demo ↗</small>
          <strong>
            {earnings?.report ? money(earnings.report.earnedCents) : "—"}
          </strong>
        </Link>
      </div>
      {earnings?.error && (
        <p role="alert">Earnings unavailable: {earnings.error}</p>
      )}
      <div
        className="tabs creator-tabs"
        role="tablist"
        aria-label="My ads sections"
      >
        {["Current", "Past ads"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={past === (t === "Past ads")}
            className={past === (t === "Past ads") ? "active" : ""}
            onClick={() => navigate(t === "Past ads" ? "/archives" : "/review")}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="metrics-note">
        Only your ads appear here. Sample performance is illustrative;
        unconnected metrics show N/A.
      </p>
      <div className="ad-grid">
        {filtered.map((post) => {
          const ad = ads.find((a) => a.id === post.id);
          return (
            <article key={post.id} className="ad-card creator-card">
              <div className="ad-card-media">
                <AdMedia ad={{ ...post, poster: ad?.poster }} access={access} />
                {past ? (
                  <span className="badge past-ad-badge">
                    {pastById.get(post.id)?.reason}
                  </span>
                ) : (
                  <StatusBadge status={post.status} />
                )}
                {ad?.durationSeconds && (
                  <span className="ad-duration">
                    {durationLabel(ad.durationSeconds)}
                  </span>
                )}
              </div>
              <div className="ad-card-copy">
                <h3>{post.title}</h3>
                {past && (
                  <p className="ad-byline">{pastById.get(post.id)?.campaign}</p>
                )}
                <AdStats
                  ad={
                    ad || {
                      impressions: null,
                      clicks: null,
                      donatedCents: null,
                    }
                  }
                />
                <p className="ad-earnings">
                  Earned · ad funds{" "}
                  <strong>
                    {earnings?.report
                      ? money(
                          earnings.report.ads.find(
                            (row) => row.adId === post.id,
                          )?.earnedCents || 0,
                        )
                      : "—"}
                  </strong>
                </p>
                <div className="creator-card-actions">
                  <button
                    className="button secondary"
                    onClick={(event) => {
                      event.currentTarget
                        .closest(".creator-card")
                        ?.querySelector("video")
                        ?.pause();
                      setSelected(post);
                    }}
                    aria-label={past ? undefined : `View ${post.title}`}
                  >
                    {past ? "View past ad" : "View & edit"}
                  </button>
                  {ad && !past && (
                    <Link className="text-button" to={`/ads/${post.id}`}>
                      Public profile ↗
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <EmptyState
          title={
            past ? "No past ads found." : "Your next good story starts here."
          }
          description={
            past
              ? "Your ads remain available here after withdrawal or when their project ends, is archived or is unpublished."
              : "Choose a project to create an ad. Your ads and results will appear here."
          }
          action={
            <Link className="button primary" to="/projects">
              Explore projects
            </Link>
          }
        />
      )}
      {selected &&
        (past ? (
          <Modal
            title={selected.title}
            subtitle={
              ownArchivedPosts.includes(selected.id)
                ? "Your archived creative"
                : "Your past ad"
            }
            onClose={() => setSelected(null)}
          >
            <div className="form-content">
              <Media post={selected} />
              <p>{selected.caption}</p>
              <p className="metrics-note">
                {pastById.get(selected.id)?.reason} · retained for your records.
                Revision {selected.revision}.
              </p>
            </div>
          </Modal>
        ) : (
          <ReviewDialog post={selected} onClose={() => setSelected(null)} />
        ))}
    </section>
  );
}
export function SpendingPage() {
  const { posts, role, campaignScope } = useWorkspace();
  const support = viewerState().support.filter((s) =>
    posts.some((p) => p.id === s.adId),
  );
  const adIds = [...new Set(support.map((s) => s.adId))];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ad spending.</h1>
          <p>
            Ad-fund contributions and recorded ad delivery for these projects.
          </p>
        </div>
        {role === "admin" && campaignScope ? (
          <Link
            className="button secondary"
            to={`/campaigns/${campaignScope.id}/ad-platforms`}
          >
            Manage ad platforms ↗
          </Link>
        ) : (
          <Wallet size={30} />
        )}
      </div>
      <CampaignBudgetPanel />
      <div className="creator-summary">
        <div>
          <small>Ad spend funded here</small>
          <strong>
            {money(support.reduce((n, s) => n + s.amountCents, 0))}
          </strong>
        </div>
        <div>
          <small>Actual ad spend</small>
          <strong>$0.00</strong>
        </div>
        <div>
          <small>Supported ads</small>
          <strong>{adIds.length}</strong>
        </div>
      </div>
      <div className="market-panel">
        <h2 id="ad-contributions">Ad spend contributions</h2>
        <p>
          Browser-local simulations. No ad purchases or money movement.
          Allocation does not mean a payout has been made.
        </p>
        {adIds.map((id) => (
          <div className="support-row" key={id}>
            <Link to={`/ads/${id}`}>
              {support.find((s) => s.adId === id)?.title}
            </Link>
            <strong>
              {money(
                support
                  .filter((s) => s.adId === id)
                  .reduce((n, s) => n + s.amountCents, 0),
              )}
            </strong>
          </div>
        ))}
        {!adIds.length && (
          <p>
            No contributions yet. Fund an ad from the public discovery grid to
            try the flow.
          </p>
        )}
      </div>
      <CompletedAdSpend />
    </>
  );
}
export function ArchivesPage() {
  const { projects, posts, search } = useWorkspace();
  const archived = projects.filter(
    (p) =>
      p.status === "archived" &&
      `${p.name} ${p.nonprofit}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Archived projects.</h1>
          <p>Past projects and their creative records in your workspace.</p>
        </div>
      </div>
      {archived.map((p) => (
        <div className="market-panel archive-project" key={p.id}>
          <Link to={`/projects/${p.id}`}>
            <h2>{p.name} ↗</h2>
          </Link>
          <p>
            {p.nonprofit} ·{" "}
            {posts.filter((post) => post.projectId === p.id).length} creative
            records
          </p>
        </div>
      ))}
      {!archived.length && (
        <EmptyState
          title="No archived projects."
          description="Projects you archive will appear here."
        />
      )}
    </>
  );
}
