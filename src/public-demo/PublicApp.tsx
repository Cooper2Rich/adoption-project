import {
  ArrowUpRight,
  Heart,
  Menu,
  PanelLeftClose,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import App from "../App.tsx";
import type { NavigationControls } from "../components/navigation-controls.ts";
import { Logo, Modal } from "../components/ui.tsx";
import { WorkspaceRail } from "../components/WorkspaceRail.tsx";
import { APP_NAME } from "../runtime.ts";
import { AdCard } from "./AdCard.tsx";
import { AdMedia } from "./AdMedia.tsx";
import { AdminFunding } from "./AdminFunding.tsx";
import { AdStats } from "./AdStats.tsx";
import * as managementViews from "./CampaignManagement.tsx";
import {
  activeViewer,
  createViewer,
  fundAd,
  fundedCents,
  loadAds,
  loadPublicCampaigns,
  money,
  selectViewer,
  viewerState,
  type PublicAd,
  type PublicCampaign,
} from "./catalog.ts";
import { CreatorEarnings } from "./CreatorEarnings.tsx";
import type { LeaderboardPeriod } from "./leaderboard-periods.ts";
import { publicArea } from "./navigation.ts";
import { ProjectRequestsPage } from "./ProjectRequests.tsx";
import { PublicAbout } from "./PublicAbout.tsx";
import { PublicHome } from "./PublicHome.tsx";
import { PublicLeaderboard } from "./PublicLeaderboard.tsx";
import {
  PublicMobileNavigation,
  PublicNavigation,
} from "./PublicNavigation.tsx";
import * as demoViews from "./WorkspaceViews.tsx";
const workspaceViews = {
  ...demoViews,
  ...managementViews,
  ProjectRequestsPage,
  AdminFunding,
  CreatorEarnings,
};

export function enterWorkspace(
  role: string,
  navigate: ReturnType<typeof useNavigate>,
) {
  localStorage.setItem(
    "slander-public-access-v1",
    JSON.stringify({ role, creatorId: null, nonprofitId: null }),
  );
  navigate(
    role === "creator"
      ? "/review"
      : role === "admin"
        ? "/campaigns"
        : "/projects",
  );
}
export default function PublicApp() {
  const location = useLocation(),
    navigate = useNavigate();
  const publicRoute =
    location.pathname === "/" ||
    location.pathname === "/explore" ||
    location.pathname === "/about" ||
    location.pathname === "/leaderboard" ||
    location.pathname.startsWith("/ads/") ||
    location.pathname === "/viewer";
  const [ads, setAds] = useState<PublicAd[] | null>(null),
    [error, setError] = useState("");
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("ripple-public-layout-v1") || "null",
      );
      if (
        typeof saved?.railOpen === "boolean" &&
        typeof saved?.sidebarOpen === "boolean"
      )
        return saved as { railOpen: boolean; sidebarOpen: boolean };
    } catch {
      /* Use the compact layout for older browser preferences. */
    }
    return { railOpen: true, sidebarOpen: false };
  });
  useEffect(() => {
    localStorage.setItem("ripple-public-layout-v1", JSON.stringify(layout));
  }, [layout]);
  const [support, setSupport] = useState<PublicAd | null>(null);
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const category = params.get("cause") || "All causes";
  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    setParams(next, { replace: true });
  };
  const setCategory = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "All causes") next.delete("cause");
    else next.set("cause", value);
    setParams(next);
  };
  const section = params.get("section");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!["/", "/about", "/viewer"].includes(location.pathname)) return;
    if (section) {
      const frame = requestAnimationFrame(() =>
        document.getElementById(section)?.scrollIntoView(),
      );
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo(0, 0);
  }, [location.pathname, section, ads]);
  const campaign = params.get("campaign") || "all";
  const period: LeaderboardPeriod =
    params.get("period") === "daily" ? "daily" : "weekly";
  const leaderboardView = params.get("view") === "past" ? "past" : "current";
  const historyDate = params.get("date") || "";
  const setLeaderboardView = (value: "current" | "past") => {
    const next = new URLSearchParams(params);
    if (value === "current") {
      next.delete("view");
      next.delete("date");
    } else {
      next.set("view", "past");
      next.delete("date");
    }
    setParams(next);
  };
  const selectHistory = (value: LeaderboardPeriod, date: string) => {
    const next = new URLSearchParams(params);
    next.set("view", "past");
    next.set("period", value);
    next.set("date", date);
    setParams(next);
  };
  const setPeriod = (value: LeaderboardPeriod) => {
    const next = new URLSearchParams(params);
    next.set("period", value);
    setParams(next);
  };
  const setCampaign = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("campaign");
    else next.set("campaign", value);
    setParams(next);
  };
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (publicRoute) {
      setAds(null);
      void Promise.all([loadAds(), loadPublicCampaigns()])
        .then(([loadedAds, loadedCampaigns]) => {
          setAds(loadedAds);
          setCampaigns(loadedCampaigns);
        })
        .catch((e) => setError(e.message));
    }
  }, [publicRoute, location.pathname]);
  useEffect(() => {
    if (publicRoute)
      document.title = `${location.pathname === "/" ? "Stories that make a difference" : location.pathname === "/about" ? "About adoption.is" : location.pathname === "/leaderboard" ? "Leaderboard" : location.pathname === "/viewer" ? "Viewer account" : "Discover stories"} · ${APP_NAME}`;
  }, [publicRoute, location.pathname]);
  const navigation: NavigationControls = {
    ...layout,
    selectTab: (to) => {
      const sameTab =
        publicRoute && publicArea(location.pathname) === publicArea(to);
      setLayout((old) => ({
        ...old,
        sidebarOpen: sameTab ? !old.sidebarOpen : true,
      }));
      if (!sameTab) navigate(to);
    },
    toggleRail: () => setLayout((old) => ({ ...old, railOpen: !old.railOpen })),
    toggleSidebar: () =>
      setLayout((old) => ({ ...old, sidebarOpen: !old.sidebarOpen })),
    setSidebarOpen: (open) =>
      setLayout((old) =>
        old.sidebarOpen === open ? old : { ...old, sidebarOpen: open },
      ),
  };
  if (!publicRoute)
    return <App demoViews={workspaceViews} navigation={navigation} />;
  const adId = location.pathname.startsWith("/ads/")
    ? decodeURIComponent(location.pathname.slice(5))
    : null;
  const selected = ads?.find((ad) => ad.id === adId);
  const viewer = activeViewer(),
    state = viewerState();
  const filtered = ads?.filter(
    (ad) =>
      `${ad.title} ${ad.creator} ${ad.project} ${ad.campaign || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (category === "All causes" || ad.category === category) &&
      (campaign === "all" || (ad.campaignId || ad.projectId) === campaign),
  );
  const update = () => {
    setVersion((value) => value + 1);
    if (location.pathname === "/viewer" && section) {
      const next = new URLSearchParams(params);
      next.delete("section");
      setParams(next, { replace: true });
    }
  };
  return (
    <div
      className={`discovery-shell ripple-public ${layout.railOpen ? "" : "rail-closed"} ${layout.sidebarOpen ? "secondary-open" : "secondary-closed"}`}
    >
      <a
        href="#discovery-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("discovery-content")?.focus();
          document.getElementById("discovery-content")?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <WorkspaceRail
        navigation={navigation}
        profileLabel={viewer ? "My giving" : "Viewer account"}
        hidden={!layout.railOpen}
      />
      <PublicNavigation
        hidden={!layout.sidebarOpen}
        campaigns={campaigns}
        categories={[...new Set(ads?.map((ad) => ad.category))]}
      />
      <div className="public-main-shell">
        <header className="discovery-header">
          <div className="public-layout-controls">
            <button
              className="icon-button"
              aria-label={
                layout.railOpen
                  ? "Hide main navigation"
                  : "Show main navigation"
              }
              aria-expanded={layout.railOpen}
              aria-controls="public-main-navigation"
              onClick={navigation.toggleRail}
            >
              <Menu size={19} />
            </button>
            {layout.sidebarOpen && (
              <button
                className="icon-button"
                aria-label="Hide secondary sidebar"
                aria-expanded={layout.sidebarOpen}
                aria-controls="public-secondary-navigation"
                onClick={navigation.toggleSidebar}
              >
                <PanelLeftClose size={19} />
              </button>
            )}
          </div>
          <div className="public-breadcrumb">
            <Link
              to="/"
              className="adoption-header-brand"
              aria-label="adoption.is home"
            >
              <Logo small />
            </Link>
            <span>Community</span>
            <span>/</span>
            <strong>
              {location.pathname === "/"
                ? "Welcome to adoption.is"
                : location.pathname === "/about"
                  ? "About adoption.is"
                  : location.pathname === "/leaderboard"
                    ? "Leaderboard"
                    : location.pathname === "/viewer"
                      ? "Your profile"
                      : adId
                        ? "Ad profile"
                        : "Discover ads"}
            </strong>
          </div>
          <span className="public-access-note">
            <span className="live-dot" />
            Browse freely
          </span>
          <label className="demo-view-picker">
            <span>Preview as</span>
            <select
              aria-label="Demo role"
              value="public"
              onChange={(e) => {
                navigation.setSidebarOpen(true);
                enterWorkspace(e.target.value, navigate);
              }}
            >
              <option value="public">Public viewer</option>
              <option value="creator">Creator</option>
              <option value="nonprofit">Campaign Owner</option>
              <option value="admin">Admin View</option>
            </select>
          </label>
        </header>
        <PublicMobileNavigation
          navigation={navigation}
          campaigns={campaigns}
          categories={[...new Set(ads?.map((ad) => ad.category))]}
        />
        <main
          id="discovery-content"
          className="discovery-content"
          tabIndex={-1}
        >
          {error && <p role="alert">{error}</p>}
          {location.pathname === "/" ? (
            <PublicHome
              ads={ads}
              campaigns={campaigns}
              onSupport={setSupport}
            />
          ) : location.pathname === "/about" ? (
            <PublicAbout />
          ) : location.pathname === "/viewer" ? (
            <>
              <div className="discovery-heading">
                <h1>{viewer ? `Hello, ${viewer.name}.` : "Viewer account"}</h1>
                <p>
                  A viewer profile lets you support ad spend and follow your
                  giving. Browse anytime without an account.
                </p>
              </div>
              {viewer ? (
                <section
                  id="giving-history"
                  className="market-panel giving-history"
                >
                  <div id="profile-actions" className="section-toolbar">
                    <h2>My giving</h2>
                    <button
                      className="text-button"
                      onClick={() => {
                        selectViewer(null);
                        update();
                      }}
                    >
                      Leave viewer profile
                    </button>
                  </div>
                  <p>
                    Viewer account · {viewer.email} · saved only in this
                    browser.
                  </p>
                  <strong className="giving-total">
                    {money(
                      state.support
                        .filter((s) => s.viewerId === viewer.id)
                        .reduce((n, s) => n + s.amountCents, 0),
                    )}
                  </strong>
                  <p>Simulated contributions to ad spend</p>
                  {state.support
                    .filter((s) => s.viewerId === viewer.id)
                    .map((s) => (
                      <div key={s.id} className="support-row">
                        <Link to={`/ads/${s.adId}`}>{s.title}</Link>
                        <span>
                          {money(s.amountCents)} ·{" "}
                          {new Date(s.at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  {!state.support.some((s) => s.viewerId === viewer.id) && (
                    <p>
                      No contributions yet.{" "}
                      <Link to="/explore">Discover ads ↗</Link>
                    </p>
                  )}
                </section>
              ) : (
                <ViewerForm onDone={update} />
              )}
            </>
          ) : location.pathname === "/leaderboard" ? (
            <>
              <div className="discovery-toolbar">
                <div>
                  <h1>
                    Leaderboard<span className="title-dot">.</span>
                  </h1>
                  <p className="view-description">
                    Compare ad performance across campaigns.
                  </p>
                </div>
                <label className="discovery-search">
                  <Search size={17} />
                  <input
                    aria-label="Search leaderboard"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Ad, creator or campaign"
                  />
                </label>
              </div>
              <PublicLeaderboard
                ads={ads}
                campaigns={campaigns}
                period={period}
                view={leaderboardView}
                onView={setLeaderboardView}
                historyDate={historyDate}
                onHistory={selectHistory}
                onPeriod={setPeriod}
                campaign={campaign}
                onCampaign={setCampaign}
                search={search}
              />
            </>
          ) : adId ? (
            selected ? (
              <>
                <Link className="text-button" to="/explore">
                  ← Discover all ads
                </Link>
                <div className="ad-profile">
                  <section className="profile-media">
                    <AdMedia ad={selected} full />
                  </section>
                  <section className="profile-copy">
                    <span className="eyebrow">
                      {selected.category} · AD PROFILE
                    </span>
                    <h1>{selected.title}</h1>
                    <p className="creator-byline">
                      Created by <strong>{selected.creator}</strong>
                    </p>
                    <p>{selected.caption}</p>
                    <div className="profile-cause">
                      <small>SUPPORTING</small>
                      <h2>{selected.project}</h2>
                      <p>{selected.nonprofit}</p>
                      <Link
                        className="text-button"
                        to={`/leaderboard?campaign=${encodeURIComponent(selected.campaignId || selected.projectId)}`}
                      >
                        Campaign leaderboard <ArrowUpRight size={14} />
                      </Link>
                    </div>
                    <AdStats ad={selected} />
                    <p className="metrics-note">
                      {selected.impressions === null
                        ? "Performance data is not connected yet."
                        : "Illustrative sample metrics, not live platform results. $ donated represents gifts to the cause."}
                    </p>
                    <div className="spend-callout">
                      <Heart size={21} />
                      <div>
                        <strong>Help this story reach more people.</strong>
                        <p>
                          {money(fundedCents(selected.id))} contributed to this
                          ad’s spend in this browser.
                        </p>
                      </div>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setSupport(selected)}
                    >
                      Fund ad spend <ArrowUpRight size={17} />
                    </button>
                    <small className="metrics-note">
                      Ad spend supports distribution. It is separate from a
                      donation to the cause.
                    </small>
                  </section>
                </div>
              </>
            ) : (
              <div className="market-panel">
                <h1>{ads ? "This ad is unavailable." : "Loading story…"}</h1>
                <p>
                  Only currently eligible ads in active campaigns are public.
                </p>
                <Link to="/explore">Discover ads</Link>
              </div>
            )
          ) : (
            <>
              <section id="stories">
                <div className="discovery-toolbar">
                  <h1>
                    Discover ads<span className="title-dot">.</span>
                  </h1>
                  <div className="discovery-filters">
                    <label className="discovery-search">
                      <Search size={17} />
                      <input
                        aria-label="Search ads"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Ad, creator or campaign"
                      />
                    </label>
                    <select
                      aria-label="Filter by cause"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        "All causes",
                        ...new Set(ads?.map((ad) => ad.category)),
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="discovery-grid-meta">
                  <p className="metrics-note">
                    Hover to preview · Play for sound · Sample metrics.
                  </p>
                </div>
                <div className="ad-grid">
                  {filtered?.map((ad) => (
                    <AdCard key={ad.id} ad={ad} onSupport={setSupport} />
                  ))}
                </div>
                {ads && !filtered?.length && (
                  <div className="empty-state">
                    <h3>No matching stories yet.</h3>
                    <p>Try another search or cause.</p>
                  </div>
                )}
                {!ads && !error && <p role="status">Gathering good stories…</p>}
              </section>
            </>
          )}
        </main>
        <footer className="discovery-footer">
          <Logo small />
          <p>Stories for good. A little louder.</p>
          <span>Fictional demo · no real donations or ad delivery</span>
        </footer>
      </div>
      {support && (
        <SupportDialog
          ad={support}
          onClose={() => {
            setSupport(null);
            update();
          }}
        />
      )}
    </div>
  );
}

function ViewerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState("");
  const profiles = viewerState().profiles;
  return (
    <div id="viewer-profile" className="viewer-form market-panel">
      <h2>Create a viewer profile</h2>
      <p>For the general public: support ads and keep a giving history.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            createViewer(name, email);
            onDone();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Your name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label>
          Email address
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <p className="metrics-note">
          Demo profile only, saved on this device. No password, external login,
          or email verification. This does not create a creator, campaign owner,
          or admin account.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" type="submit">
          Create viewer profile <ArrowUpRight size={16} />
        </button>
      </form>
      {!!profiles.length && (
        <label id="saved-viewers" className="saved-viewers">
          Saved viewer profiles
          <select
            aria-label="Saved viewer profiles"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                selectViewer(e.target.value);
                onDone();
              }
            }}
          >
            <option value="" disabled>
              Choose your demo profile
            </option>
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
function SupportDialog({ ad, onClose }: { ad: PublicAd; onClose: () => void }) {
  const [amount, setAmount] = useState("25"),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [version, setVersion] = useState(0);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <Modal
      title={
        done ? "A little louder. Thanks to you." : "Help this ad go further"
      }
      subtitle={ad.title}
      onClose={onClose}
    >
      <div className="form-content">
        {done ? (
          <div role="status">
            <h3>
              {money(Math.round(Number(amount) * 100))} in simulated ad support
            </h3>
            <p>
              Your contribution is saved to your viewer profile and this ad’s
              spend fund. No money was charged.
            </p>
            <Link className="text-button" to="/viewer" onClick={onClose}>
              View my giving ↗
            </Link>
          </div>
        ) : !activeViewer() ? (
          <ViewerForm key={version} onDone={() => setVersion(version + 1)} />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await fundAd(ad, amount, requestId);
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <p>
              Contributing as <strong>{activeViewer()?.name}</strong> · Viewer
            </p>
            <p>
              This contribution supports the ad fund for “{ad.title}”. The
              creator receives 10%. Ad-fund contributions do not create donation
              votes.
            </p>
            <div className="giving-presets">
              {[10, 25, 50, 100].map((n) => (
                <button
                  type="button"
                  className={`button ${amount === String(n) ? "primary" : "secondary"}`}
                  key={n}
                  onClick={() => setAmount(String(n))}
                >
                  {money(n * 100)}
                </button>
              ))}
            </div>
            <label className="amount-field">
              Amount in USD
              <input
                type="number"
                required
                min="1"
                max="1000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p className="metrics-note">
              Simulated ad spend contribution · no payment details or money
              movement.
            </p>
            {error && <p role="alert">{error}</p>}
            <button className="button primary full" type="submit">
              Confirm simulated contribution <Heart size={16} />
            </button>
          </form>
        )}
      </div>
      {done && (
        <div className="modal-footer">
          <button className="button primary" onClick={onClose}>
            Keep discovering <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </Modal>
  );
}
