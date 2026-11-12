import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.ts";
import { EmptyState, dateLabel } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { money } from "./catalog.ts";
import type { CreatorEarningsReport } from "./creator-earnings.ts";
import {
  FinancialSampleControl,
  useFinancialSamples,
} from "./FinancialSamples.tsx";

import { AdMedia } from "./AdMedia.tsx";
import { CreatorWins } from "./CreatorWins.tsx";

export function useCreatorEarnings() {
  const { access, posts } = useWorkspace();
  const { enabled } = useFinancialSamples();
  const [loaded, setLoaded] = useState<{
    creatorId: string;
    report?: CreatorEarningsReport;
    error?: string;
    samples: boolean;
  }>();
  useEffect(() => {
    let current = true;
    async function load() {
      if (access.role !== "creator" || !access.creatorId) return;
      try {
        const report = await api<CreatorEarningsReport>(
          enabled ? "/creator-earnings" : "/creator-earnings?samples=0",
          access,
        );
        if (current)
          setLoaded({ creatorId: access.creatorId, report, samples: enabled });
      } catch (error) {
        if (current)
          setLoaded({
            creatorId: access.creatorId,
            error: (error as Error).message,
            samples: enabled,
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
  }, [access, posts, enabled]);
  return loaded?.creatorId === access.creatorId && loaded.samples === enabled
    ? loaded
    : undefined;
}

export function CreatorEarnings() {
  const { role, search, posts, access } = useWorkspace();
  const loaded = useCreatorEarnings();
  if (role !== "creator") return <Navigate to="/projects" replace />;
  const report = loaded?.report;
  const ads =
    report?.ads.filter((ad) =>
      ad.title.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <section className="creator-earnings">
      <div className="page-heading">
        <div>
          <h1>Earnings.</h1>
          <p>Your commissions, payout status and past leaderboard wins.</p>
        </div>
        <Link className="button secondary" to="/review">
          My ads ↗
        </Link>
      </div>
      {loaded?.error && <p role="alert">{loaded.error}</p>}
      <FinancialSampleControl />
      <div
        className="creator-summary earnings-summary"
        aria-label="Your earnings"
      >
        {[
          { label: "Total earned · demo", amount: report?.earnedCents },
          { label: "Awaiting payout", amount: report?.pendingCents },
          { label: "Paid to you", amount: report?.paidCents },
        ].map(({ label, amount }) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{amount === undefined ? "—" : money(amount)}</strong>
          </div>
        ))}
      </div>
      <p className="metrics-note">
        Earnings include past ads. Sample payments illustrate completed payouts;
        saved contributions have no completed transfers. All amounts are
        demo-only.
      </p>
      <div className="earnings-sources">
        <span>
          Ad-fund commissions · 10%{" "}
          <strong>{report ? money(report.adFundCents) : "—"}</strong>
        </span>
        <span>
          Recorded cause-gift commissions{" "}
          <strong>{report ? money(report.causeGiftCents) : "—"}</strong>
        </span>
      </div>
      {!!report?.legacyCents && (
        <p className="info-banner">
          Historical ad funding of {money(report.legacyCents)} has no recorded
          creator allocation and is excluded from earnings.
        </p>
      )}
      <CreatorWins />
      <h2 id="earnings-by-ad" className="earnings-section-title">
        Earnings by ad
      </h2>
      <div className="earnings-list">
        {ads.map((ad) => {
          const post = posts.find((entry) => entry.id === ad.adId);
          return (
            <article data-ad-preview className="earnings-row" key={ad.adId}>
              <div className="earnings-ad-identity">
                {post && (
                  <span className="earnings-ad-thumbnail">
                    <AdMedia ad={post} access={access} previewOnly />
                  </span>
                )}
                <div>
                  <h3>{ad.title}</h3>
                  <p>
                    {ad.contributionCount}{" "}
                    {ad.contributionCount === 1
                      ? "contribution"
                      : "contributions"}{" "}
                    with a recorded creator allocation
                  </p>
                  {ad.legacyCents > 0 && (
                    <p>Historical funding excluded: {money(ad.legacyCents)}</p>
                  )}
                </div>
              </div>
              <div>
                <small>Earned · ad funds</small>
                <strong>{money(ad.earnedCents)}</strong>
              </div>
            </article>
          );
        })}
      </div>
      {report && !ads.length && (
        <EmptyState
          title={
            search ? "No ads match your search." : "No ad-fund earnings yet."
          }
          description={
            search
              ? "Search for another ad name."
              : "Your recorded 10% share appears here when your ads receive new contributions."
          }
        />
      )}
      {!!report?.payments.length && (
        <section className="sample-payment-history">
          <h2 className="earnings-section-title">Sample payout history</h2>
          <div className="earnings-list">
            {report.payments.map((payment) => (
              <article className="earnings-row" key={payment.id}>
                <div>
                  <h3>{payment.title}</h3>
                  <p>{dateLabel(payment.at)} · Completed · fictional payment</p>
                </div>
                <strong>{money(payment.amountCents)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
