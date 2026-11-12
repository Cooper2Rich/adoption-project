import {
  ArrowUpRight,
  BarChart3,
  Check,
  Download,
  HeartHandshake,
  Leaf,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.ts";
import { Logo } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { APP_NAME, PUBLIC_DEMO, demoAsset } from "../runtime.ts";
import type { Post } from "../types.ts";

type Terms = {
  id: string;
  creatorCommissionBps: number;
  startsAt: string;
  endsAt: string;
  refundHoldPolicy: string;
  attributionWindowDays: number;
};
type Offer = {
  id: string;
  name: string;
  cause: string;
  beneficiary: { name: string };
  terms: Terms;
};
type Totals = {
  creatorCents: number;
  beneficiaryCents: number;
  votes: number;
  capturedCents: number;
  availableSeedGuaranteeCents: number;
  availableMediaCents: number;
  availableCreatorCents: number;
  feeAssumption: string;
};
const money = (n = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const showcaseId = "fictional-river-showcase-v1";
function saveStatement(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${APP_NAME.toLowerCase()}-fictional-sample-statement.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CampaignsPage() {
  const { access, role, search, refresh, posts, identity, notify } =
    useWorkspace();
  const { id } = useParams();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Overview");
  const [accepted, setAccepted] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [tracking, setTracking] = useState("");
  const [sample, setSample] = useState<Post | null>(null);
  const [grade, setGrade] = useState<{
    score: number;
    components: Record<string, number>;
  } | null>(null);
  const [statement, setStatement] = useState<unknown>(null);
  const load = async () => {
    const [page, setup] = await Promise.all([
      api<{ items: Offer[] }>("/offers", access),
      api<{ ready: boolean }>("/demo/showcase", access),
    ]);
    setOffers(page.items);
    setReady(setup.ready);
    if (id) {
      setTotals(await api<Totals>(`/campaigns/${id}/finance`, access));
      if (role === "creator") {
        const participation = await api<{ items: { termsId: string }[] }>(
          `/campaigns/${id}/records/participations`,
          access,
        );
        setAccepted(
          participation.items.some(
            (p) => p.termsId === page.items.find((o) => o.id === id)?.terms.id,
          ),
        );
      }
    }
  };
  useEffect(() => {
    setTracking("");
    setSample(null);
    setStatement(null);
    setTab("Overview");
    void load().catch((e) => setError(e.message));
  }, [id, access]);
  async function act(fn: (...args: any[]) => any) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const offer = offers.find((o) => o.id === id);
  const creative =
    sample || posts.find((p) => p.projectId === id && p.status === "approved");
  return (
    <div className="marketplace-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE CREATIVITY. A LOT OF GOOD.</span>
          <h1>
            {PUBLIC_DEMO
              ? offer?.name || "Project opportunities"
              : offer
                ? "Good stories move people."
                : "Find your next good story."}
          </h1>
          <p>
            {PUBLIC_DEMO
              ? "Review project terms, creator commission and performance."
              : offer
                ? offer.name
                : "Discover a cause, create something meaningful, and see where every simulated dollar goes."}
          </p>
        </div>
        <span className="market-mode">
          <Leaf size={15} />{" "}
          {PUBLIC_DEMO ? "BROWSER PREVIEW" : "LOCAL SIMULATION"}
        </span>
      </div>
      {error && (
        <div className="load-error" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => void act(load)}>
            Try again
          </button>
        </div>
      )}
      {!ready && (
        <div className="showcase-banner">
          <HeartHandshake size={30} />
          <div>
            <h2>A ready-to-explore story.</h2>
            <p>
              Add the fictional Riverkind campaign, Alex’s creator profile, and
              $1,000 of restricted sample funding. Existing projects stay in
              place.
            </p>
          </div>
          {role === "admin" ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api("/demo/showcase", access, "POST", {});
                  await refresh();
                  notify(
                    "Fictional showcase added. Choose Alex River in Creator view to begin.",
                  );
                })
              }
            >
              {busy ? "Preparing…" : "Initialize fictional showcase"}
              <ArrowUpRight size={17} />
            </button>
          ) : (
            <p>Switch to Admin to initialize the showcase.</p>
          )}
        </div>
      )}
      {!id && (
        <>
          {(!PUBLIC_DEMO || role === "creator") && (
            <div className="market-intro">
              <strong>01 Discover a campaign</strong>
              <span>02 Accept clear terms</span>
              <span>03 Create & share</span>
              <span>04 Follow the impact</span>
            </div>
          )}
          <div className="offer-grid">
            {offers
              .filter((o) =>
                `${o.name} ${o.cause}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((o) => (
                <Link
                  className="offer-card"
                  key={o.id}
                  to={
                    PUBLIC_DEMO
                      ? `/opportunities/${o.id}`
                      : `/campaigns/${o.id}`
                  }
                >
                  <div className="offer-photo">
                    <img
                      src={demoAsset("images/forest.jpg")}
                      alt="Sunlight through a green forest"
                    />
                    <span>OPEN CAMPAIGN</span>
                  </div>
                  <div className="offer-copy">
                    <span className="eyebrow">{o.cause} · SIMULATED</span>
                    <h2>{o.name}</h2>
                    <p>{o.beneficiary.name}</p>
                    <div className="offer-bottom">
                      <strong>
                        {PUBLIC_DEMO
                          ? "10% paid to the creator"
                          : "10% creator · 90% cause"}
                      </strong>
                      <ArrowUpRight size={21} />
                    </div>
                  </div>
                </Link>
              ))}
          </div>
          {!offers.length && ready && <p>No open campaigns in this scope.</p>}
          <div className="callout market-disclosure">
            All identities and money in the showcase are fictional. No card
            details, payments, live ads, or social publishing. Your local demo
            changes persist.
          </div>
        </>
      )}
      {id && !offer && !error && <p>Loading campaign…</p>}
      {offer && (
        <>
          <Link
            className="text-button"
            to={
              PUBLIC_DEMO
                ? role === "admin"
                  ? "/campaigns"
                  : "/projects"
                : "/campaigns"
            }
          >
            {PUBLIC_DEMO && role === "creator"
              ? "← All projects"
              : "← All campaigns"}
          </Link>
          <div
            className="market-tabs"
            role="tablist"
            aria-label={
              PUBLIC_DEMO ? "Project records sections" : "Campaign sections"
            }
          >
            {(PUBLIC_DEMO && role === "creator"
              ? ["Overview", "Performance"]
              : ["Overview", "Funding", "Performance", "Settlement"]
            ).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  if (t === "Performance")
                    void api<typeof grade>("/demo/grade-example", access)
                      .then(setGrade)
                      .catch((e) => setError(e.message));
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Overview" && (
            <div className="campaign-layout">
              <section className="campaign-story">
                <img
                  className="campaign-cover"
                  src={demoAsset("images/forest.jpg")}
                  alt="A forest worth caring for"
                />
                <div className="market-panel">
                  <span className="eyebrow">THE MISSION</span>
                  <h2>
                    {PUBLIC_DEMO
                      ? "Campaign brief"
                      : "Make room for a better tomorrow."}
                  </h2>
                  <p>
                    {PUBLIC_DEMO
                      ? `Creative brief and sample media for ${offer.beneficiary.name}. Rights and disclosure requirements are included.`
                      : `Help ${offer.beneficiary.name} tell a story that inspires people to give. The showcase supplies a sample creative with clear rights and disclosures, so you can walk the whole journey.`}
                  </p>
                  <Link to={`/projects/${offer.id}`} className="text-button">
                    Open full creative brief <ArrowUpRight size={16} />
                  </Link>
                </div>
              </section>
              <div className="market-panel terms-panel">
                <span className="eyebrow">CLEAR TERMS. SHARED PURPOSE.</span>
                <h2>
                  {PUBLIC_DEMO
                    ? "Project terms"
                    : "Your creativity, fairly credited."}
                </h2>
                <div className="split-amount">
                  <strong>
                    10<span>%</span>
                  </strong>
                  <p>
                    Creator commission
                    <br />
                    <small>
                      {PUBLIC_DEMO
                        ? "Paid to the attributed creator"
                        : "90% to the nonprofit before fees"}
                    </small>
                  </p>
                </div>
                <ul className="terms-list">
                  <li>
                    <Check size={16} /> USD · fixed 1,000 basis points
                  </li>
                  <li>
                    <Check size={16} /> First-party last click ·{" "}
                    {offer.terms.attributionWindowDays} days
                  </li>
                  <li>
                    <Check size={16} /> {offer.terms.startsAt.slice(0, 10)} –{" "}
                    {offer.terms.endsAt.slice(0, 10)}
                  </li>
                  <li>
                    <Check size={16} /> Instagram feed · organic local handoff
                  </li>
                </ul>
                <p className="muted">{offer.terms.refundHoldPolicy}</p>
                <small className="terms-version">
                  Frozen terms {offer.terms.id.slice(0, 8)} · fictional identity
                  verification
                </small>
                {role === "creator" ? (
                  <div className="journey-actions">
                    <button
                      className="button primary full"
                      disabled={busy || accepted}
                      onClick={() =>
                        void act(async () => {
                          await api(
                            `/campaigns/${id}/consent`,
                            access,
                            "POST",
                            { termsId: offer.terms.id },
                          );
                          setAccepted(true);
                        })
                      }
                    >
                      {accepted
                        ? "✓ Terms accepted"
                        : PUBLIC_DEMO
                          ? "Accept project terms"
                          : "Accept campaign terms"}
                    </button>
                    {id === showcaseId && (
                      <button
                        className="button secondary full"
                        disabled={busy || !accepted}
                        onClick={() =>
                          void act(async () => {
                            const post = await api<Post>(
                              `/campaigns/${id}/sample-creative`,
                              access,
                              "POST",
                              {},
                            );
                            setSample(post);
                            await refresh();
                            notify(
                              post.status === "approved"
                                ? "Sample creative is automatically eligible"
                                : "Creative checked — review the result below",
                            );
                          })
                        }
                      >
                        {busy ? "Working…" : "Submit sample creative"}
                      </button>
                    )}
                    {creative && (
                      <div className="eligibility-result">
                        <Check size={18} />
                        <div>
                          <strong>Automatically eligible</strong>
                          <small>
                            {creative.title} · revision {creative.revision}
                          </small>
                          <span>No owner sign-off required</span>
                        </div>
                      </div>
                    )}
                    {creative && (
                      <button
                        className="button secondary full"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await api<{
                              link: { path: string };
                            }>(`/campaigns/${id}/demo-link`, access, "POST", {
                              postId: creative.id,
                            });
                            setTracking(result.link.path);
                            notify("Tracked local giving link is ready");
                          })
                        }
                      >
                        Create tracked giving link <ArrowUpRight size={16} />
                      </button>
                    )}
                    {tracking && (
                      <a className="button primary full" href={tracking}>
                        Open tracked giving page <ArrowUpRight size={16} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="callout">
                    <p>
                      Explore the funding and reports here. To create a story,
                      switch to Creator and choose Alex River · fictional.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "Funding" && (
            <>
              <div className="section-heading">
                <Wallet />
                <div>
                  <h2>
                    {PUBLIC_DEMO ? "Funding" : "Every dollar has a purpose."}
                  </h2>
                  <p>Settled simulated funding, separated by its agreed use.</p>
                </div>
              </div>
              <div className="metric-grid">
                <Metric
                  label="Public gifts · beneficiary"
                  value={money(totals?.beneficiaryCents)}
                  note={
                    PUBLIC_DEMO
                      ? "Recorded beneficiary allocations"
                      : "90% of eligible attributed gifts before fees"
                  }
                />
                <Metric
                  label="Creator commission"
                  value={money(totals?.creatorCents)}
                  note="Fixed 10% · separate from seed support"
                />
                <Metric
                  label="Seed guarantee pool"
                  value={
                    role === "creator"
                      ? "Owner view"
                      : money(totals?.availableSeedGuaranteeCents)
                  }
                  note="Restricted funding · not public donations"
                />
                <Metric
                  label="Media pool"
                  value={
                    role === "creator"
                      ? "Owner view"
                      : money(totals?.availableMediaCents)
                  }
                  note="Restricted ad budget · no live spend"
                />
              </div>
              <div className="market-panel">
                <h2>
                  {id === showcaseId
                    ? "Fictional starting funds: $1,000"
                    : "Restricted funding stays separate."}
                </h2>
                {id === showcaseId && (
                  <p>
                    $600 is restricted to seed guarantees. $400 is restricted to
                    media. This showcase does not create a guarantee promise or
                    buy ads.{" "}
                    {PUBLIC_DEMO
                      ? "The browser preview keeps illustrative gift allocations separate."
                      : "Public giving creates its own creator and beneficiary journal entries."}
                  </p>
                )}
                <p className="muted">{totals?.feeAssumption}</p>
                <button className="button secondary" disabled>
                  Live funding unavailable
                </button>
              </div>
            </>
          )}
          {tab === "Performance" && (
            <>
              <div className="section-heading">
                <BarChart3 />
                <div>
                  <h2>
                    {PUBLIC_DEMO ? "Performance" : "The good, in numbers."}
                  </h2>
                  <p>
                    Local financial results plus a clearly separate grading
                    illustration.
                  </p>
                </div>
              </div>
              <div className="metric-grid">
                <Metric
                  label="Eligible gift votes"
                  value={String(totals?.votes || 0)}
                  note="One vote per positive-net eligible gift"
                />
                <Metric
                  label="Beneficiary proceeds"
                  value={money(totals?.beneficiaryCents)}
                  note={
                    PUBLIC_DEMO
                      ? "Browser preview · before fixture fees"
                      : "Simulated journal · before fixture fees"
                  }
                />
                <Metric
                  label="Outbound clicks / impressions"
                  value="N/A"
                  note="No platform evidence connected"
                />
                <Metric
                  label="Cost per donation"
                  value="N/A"
                  note="No observed paid delivery or actual cost"
                />
              </div>
              <div className="grade-example market-panel">
                <div>
                  <span className="eyebrow">
                    ILLUSTRATIVE GRADING-V2 · NOT CAMPAIGN RESULTS
                  </span>
                  <h2>
                    {grade?.score.toFixed(1) || "…"}
                    <small> / 100</small>
                  </h2>
                  <p>
                    Fixed weights: CTR 15 · views 10 · votes 35 · amount 40.
                    {PUBLIC_DEMO
                      ? "This is a fixed illustrative score, separate from your preview gifts."
                      : "This example uses smoothed CTR and capped square-root components from the shared grading function."}
                  </p>
                </div>
                <div className="grade-bars">
                  {grade &&
                    Object.entries(grade.components).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <meter min={0} max={1} value={value} />
                        <strong>{Math.round(value * 100)}%</strong>
                      </div>
                    ))}
                </div>
              </div>
              <div className="callout">
                Actual campaign grade: provisional until metric evidence is
                supplied. Grades do not trigger bonuses or buy ads. Fair
                exposure scheduling is an API preview; live delivery and
                exhaustive opportunity verification are deferred.
              </div>
            </>
          )}
          {tab === "Settlement" && (
            <div className="market-panel statement-panel">
              <span className="eyebrow">CLEAR RECORDS. NO REAL TRANSFERS.</span>
              <h2>
                {PUBLIC_DEMO
                  ? "Weekly statement"
                  : "A week’s work, made visible."}
              </h2>
              <p>
                {PUBLIC_DEMO
                  ? "Export a fictional statement for this browser's sample week. It illustrates allocation totals; it is not a server journal, approved batch, or payment."
                  : "Preview an exportable fictional statement from the shared settlement engine. Captured commission, settled availability, holds, and prior payments remain separate."}
              </p>
              <div className="metric-grid">
                <Metric
                  label="Creator accrued"
                  value={money(totals?.creatorCents)}
                  note="Before any seed top-up"
                />
                <Metric
                  label="Available creator balance"
                  value={money(totals?.availableCreatorCents)}
                  note="Settled, less commitments and prior payments"
                />
              </div>
              {role === "admin" && id === showcaseId ? (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const data = await api(
                        "/demo/sample-statement",
                        access,
                        "POST",
                        { creatorId: identity?.id },
                      );
                      setStatement(data);
                      saveStatement(data);
                      notify("Fictional sample statement exported");
                    })
                  }
                >
                  <Download size={17} /> Preview & export sample week
                </button>
              ) : (
                <p className="callout">
                  Admin can export the fictional showcase sample week. Creator
                  balances here are scoped to the selected creator.
                </p>
              )}
              {!!statement && (
                <p role="status">
                  Sample statement exported. This current sample week has not
                  reached cutoff; it is a preview, with no approved batch or
                  payment.
                </p>
              )}
              <p className="muted">
                A $25 guarantee with $10 earned commission would add a separate
                $15 seed top-up when a funded promise exists. This example is
                illustrative; the showcase creates no such promise.
              </p>
              <button className="button secondary" disabled>
                Live payouts unavailable
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  );
}

export function GivingPage() {
  const { id = "" } = useParams();
  const [campaign, setCampaign] = useState<{
    name: string;
    nonprofit: string;
    description: string;
  } | null>(null);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intentId, setIntentId] = useState("");
  const [result, setResult] = useState<{
    amountCents: number;
    creatorCents: number;
    beneficiaryCents: number;
    votes: number;
    unallocatedCents: number;
  } | null>(null);
  useEffect(() => {
    void api<typeof campaign>(`/giving/${id}/campaign`)
      .then(setCampaign)
      .catch((e) => setError(e.message));
  }, [id]);
  async function give() {
    setBusy(true);
    setError("");
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)
        throw new Error(
          "Enter a positive USD amount with up to two decimal places.",
        );
      const intent = intentId
        ? { id: intentId }
        : await api<{ id: string; state: string; reason: string }>(
            `/giving/${id}/intents`,
            undefined,
            "POST",
            { amountCents: Math.round(Number(amount) * 100) },
          );
      setIntentId(intent.id);
      setResult(
        await api(
          `/giving/${id}/intents/${intent.id}/confirm`,
          undefined,
          "POST",
          {},
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="giving-page">
      <header>
        <Link to="/campaigns" className="brand" aria-label={`${APP_NAME} home`}>
          {PUBLIC_DEMO ? (
            <Logo />
          ) : (
            <>
              slander<span>✳</span>
            </>
          )}
        </Link>
        <span className="market-mode">FICTIONAL GIVING DEMO</span>
      </header>
      <main className="giving-layout">
        <div className="giving-story">
          <img
            src={demoAsset("images/forest.jpg")}
            alt="Sunlight over a green forest"
          />
          <span className="eyebrow">SMALL ACTS. LASTING GOOD.</span>
          <h1>{campaign?.name || "A little kindness goes a long way."}</h1>
          <p>{campaign?.description}</p>
          <strong>{campaign?.nonprofit}</strong>
        </div>
        <section className="market-panel giving-form">
          <HeartHandshake size={33} />
          <h2>
            {result ? "That’s a little more good." : "Be part of the story."}
          </h2>
          <p>
            This is a local simulation. No money moves, and no payment details
            are collected.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {result ? (
            <div className="giving-result">
              <span className="eyebrow">SIMULATED GIFT CONFIRMED</span>
              <strong>{money(result.amountCents)}</strong>
              <dl>
                <div>
                  <dt>Creator commission</dt>
                  <dd>{money(result.creatorCents)}</dd>
                </div>
                <div>
                  <dt>Nonprofit beneficiary</dt>
                  <dd>{money(result.beneficiaryCents)}</dd>
                </div>
                <div>
                  <dt>Eligible gift votes</dt>
                  <dd>+{result.votes}</dd>
                </div>
              </dl>
              {result.unallocatedCents > 0 && (
                <p>
                  Attribution could not be confirmed.{" "}
                  {money(result.unallocatedCents)} remains unallocated for
                  review.
                </p>
              )}
              <p>
                Before fixture fees (assumed $0).{" "}
                {PUBLIC_DEMO
                  ? "This preview is saved only in this browser. No server journal or payment is created."
                  : "This confirmation is recorded in the shared simulated journal."}
              </p>
              <Link
                className="button primary full"
                to={PUBLIC_DEMO ? `/opportunities/${id}` : `/campaigns/${id}`}
              >
                {PUBLIC_DEMO ? "Return to project" : "Return to campaign"}{" "}
                <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            <>
              <label>
                Simulated gift amount (USD)
                <input
                  aria-label="Simulated gift amount (USD)"
                  inputMode="decimal"
                  value={amount}
                  disabled={!!intentId}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <div className="giving-split">
                <span>
                  Creator <strong>10%</strong>
                </span>
                {!PUBLIC_DEMO && (
                  <span>
                    Nonprofit <strong>90%</strong>
                  </span>
                )}
              </div>
              <p className="muted">
                {PUBLIC_DEMO
                  ? "Eligible tracked gifts pay 10% to the attributed creator. Each positive-net eligible gift adds one vote."
                  : "Eligible tracked gifts give 10% to the attributed creator and 90% to the beneficiary before fees. Each positive-net eligible gift adds one vote."}
              </p>
              <button
                className="button primary full"
                disabled={busy || !campaign}
                onClick={() => void give()}
              >
                {busy ? "Confirming simulation…" : "Confirm simulated gift"}
                <ArrowUpRight size={17} />
              </button>
            </>
          )}
        </section>
      </main>
      <footer>Local demo · fictional identities · simulated USD only</footer>
    </div>
  );
}
