import {
  ChevronDown,
  Compass,
  Hash,
  Heart,
  History,
  House,
  Info,
  Layers3,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Avatar, Logo } from "../components/ui";
import { activeViewer, viewerState, type PublicCampaign } from "./catalog";
import { publicArea, publicAreaNames } from "./navigation";
import {
  selectNavigationTab,
  type NavigationControls,
} from "../components/navigation-controls";

type NavigationProps = {
  campaigns: PublicCampaign[];
  categories: string[];
  hidden?: boolean;
};

function ContextLink({
  to,
  label,
  icon: Icon,
  selected = false,
  navigation,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  selected?: boolean;
  navigation?: NavigationControls;
}) {
  return (
    <Link
      to={to}
      className={`nav-item ${selected ? "active" : ""}`}
      aria-current={selected ? "page" : undefined}
      aria-expanded={
        navigation ? selected && navigation.sidebarOpen : undefined
      }
      aria-controls={navigation ? "mobile-secondary-navigation" : undefined}
      onClick={(event) => selectNavigationTab(event, to, navigation)}
    >
      <Icon size={17} />
      <span>{label}</span>
    </Link>
  );
}

function ContextMenu({ campaigns, categories }: NavigationProps) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const area = publicArea(pathname);
  const section = params.get("section") || "";
  const cause = params.get("cause") || "All causes";
  const campaign = params.get("campaign") || "all";
  const period = params.get("period") === "daily" ? "daily" : "weekly";
  const view = params.get("view") === "past" ? "past" : "current";
  const viewer = activeViewer();
  const boardLink = (nextPeriod: string, nextView: string) => {
    const next = new URLSearchParams({ period: nextPeriod });
    if (nextView === "past") next.set("view", "past");
    if (campaign !== "all") next.set("campaign", campaign);
    return `/leaderboard?${next}`;
  };
  const campaignLink = (id: string) => {
    const next =
      area === "leaders" ? new URLSearchParams(params) : new URLSearchParams();
    if (id === "all") next.delete("campaign");
    else next.set("campaign", id);
    return `${area === "leaders" ? "/leaderboard" : "/explore"}${next.size ? `?${next}` : ""}`;
  };
  return (
    <nav
      aria-label={`${publicAreaNames[area]} navigation`}
      className="context-navigation"
    >
      {area === "home" && (
        <>
          <ContextLink
            to="/"
            label="Overview"
            icon={House}
            selected={!section}
          />
          <ContextLink
            to="/?section=mission"
            label="Our mission"
            icon={Heart}
            selected={section === "mission"}
          />
          <ContextLink
            to="/?section=how-it-works"
            label="How it works"
            icon={Info}
            selected={section === "how-it-works"}
          />
          <ContextLink
            to="/?section=current-leaders"
            label="This week’s leaders"
            icon={Trophy}
            selected={section === "current-leaders"}
          />
          <ContextLink
            to="/?section=past-leaders"
            label="Last week’s highlights"
            icon={History}
            selected={section === "past-leaders"}
          />
        </>
      )}
      {area === "about" && (
        <>
          <ContextLink
            to="/about"
            label="Why adoption.is"
            icon={Heart}
            selected={!section}
          />
          <ContextLink
            to="/about?section=about-how"
            label="How a ripple grows"
            icon={Layers3}
            selected={section === "about-how"}
          />
          <ContextLink
            to="/about?section=about-community"
            label="Who it’s for"
            icon={UserRound}
            selected={section === "about-community"}
          />
          <ContextLink
            to="/about?section=about-demo"
            label="About this demo"
            icon={Info}
            selected={section === "about-demo"}
          />
        </>
      )}
      {area === "discover" && (
        <>
          <ContextLink
            to="/explore"
            label="All ads"
            icon={Compass}
            selected={
              pathname === "/explore" &&
              cause === "All causes" &&
              campaign === "all"
            }
          />
          {pathname.startsWith("/ads/") && (
            <ContextLink
              to={pathname}
              label="Ad details"
              icon={Layers3}
              selected
            />
          )}
          <details className="sidebar-group" open>
            <summary>
              <ChevronDown size={13} /> Browse by cause
            </summary>
            {categories.map((category) => (
              <ContextLink
                key={category}
                to={`/explore?cause=${encodeURIComponent(category)}`}
                label={category}
                icon={Heart}
                selected={pathname === "/explore" && cause === category}
              />
            ))}
          </details>
        </>
      )}
      {area === "leaders" && (
        <>
          <ContextLink
            to={boardLink("weekly", "current")}
            label="Weekly leaders"
            icon={Trophy}
            selected={period === "weekly" && view === "current"}
          />
          <ContextLink
            to={boardLink("daily", "current")}
            label="Daily leaders"
            icon={Trophy}
            selected={period === "daily" && view === "current"}
          />
          <ContextLink
            to={boardLink("weekly", "past")}
            label="Past weekly winners"
            icon={History}
            selected={period === "weekly" && view === "past"}
          />
          <ContextLink
            to={boardLink("daily", "past")}
            label="Past daily winners"
            icon={History}
            selected={period === "daily" && view === "past"}
          />
        </>
      )}
      {(area === "discover" || area === "leaders") && (
        <details className="sidebar-group" open>
          <summary>
            <ChevronDown size={13} /> Campaigns <span>{campaigns.length}</span>
          </summary>
          {area === "leaders" && (
            <ContextLink
              to={campaignLink("all")}
              label="All campaigns"
              icon={Layers3}
              selected={campaign === "all"}
            />
          )}
          {campaigns.map((entry) => (
            <ContextLink
              key={entry.id}
              to={campaignLink(entry.id)}
              label={entry.name}
              icon={Hash}
              selected={campaign === entry.id}
            />
          ))}
        </details>
      )}
      {area === "profile" && (
        <>
          <ContextLink
            to="/viewer"
            label="Profile overview"
            icon={UserRound}
            selected={!section}
          />
          {viewer ? (
            <>
              <ContextLink
                to="/viewer?section=giving-history"
                label="Giving history"
                icon={Wallet}
                selected={section === "giving-history"}
              />
              <ContextLink
                to="/viewer?section=profile-actions"
                label="Switch profile"
                icon={UserRound}
                selected={section === "profile-actions"}
              />
            </>
          ) : (
            <>
              <ContextLink
                to="/viewer?section=viewer-profile"
                label="Create a profile"
                icon={UserRound}
                selected={section === "viewer-profile"}
              />
              {!!viewerState().profiles.length && (
                <ContextLink
                  to="/viewer?section=saved-viewers"
                  label="Saved profiles"
                  icon={History}
                  selected={section === "saved-viewers"}
                />
              )}
            </>
          )}
        </>
      )}
    </nav>
  );
}

export function PublicLinks({
  navigation,
}: {
  navigation: NavigationControls;
}) {
  const viewer = activeViewer();
  const { pathname } = useLocation();
  const area = publicArea(pathname);
  return (
    <>
      <ContextLink
        to="/"
        label="Home"
        navigation={navigation}
        icon={House}
        selected={area === "home"}
      />
      <ContextLink
        to="/explore"
        label="Discover ads"
        navigation={navigation}
        icon={Compass}
        selected={area === "discover"}
      />
      <ContextLink
        to="/about"
        label="About adoption.is"
        navigation={navigation}
        icon={Info}
        selected={area === "about"}
      />
      <ContextLink
        to="/leaderboard"
        label="Leaderboard"
        navigation={navigation}
        icon={Trophy}
        selected={area === "leaders"}
      />
      <ContextLink
        to="/viewer"
        label={viewer ? "My giving" : "Viewer account"}
        navigation={navigation}
        icon={UserRound}
        selected={area === "profile"}
      />
    </>
  );
}

export function PublicMobileNavigation({
  navigation,
  ...props
}: NavigationProps & { navigation: NavigationControls }) {
  const location = useLocation();
  const title = publicAreaNames[publicArea(location.pathname)];
  return (
    <>
      <nav className="public-mobile-nav" aria-label="Mobile public navigation">
        <PublicLinks navigation={navigation} />
      </nav>
      <details
        id="mobile-secondary-navigation"
        open={navigation.sidebarOpen}
        onToggle={(event) =>
          navigation.setSidebarOpen(event.currentTarget.open)
        }
        className="public-mobile-context"
      >
        <summary>
          {title} navigation <ChevronDown size={15} />
        </summary>
        <ContextMenu {...props} />
      </details>
    </>
  );
}

export function PublicNavigation(props: NavigationProps) {
  const viewer = activeViewer();
  const { pathname } = useLocation();
  const title = publicAreaNames[publicArea(pathname)];
  return (
    <aside
      id="public-secondary-navigation"
      hidden={props.hidden}
      className="sidebar public-sidebar"
    >
      <Link to="/" className="brand" aria-label="adoption.is home">
        <Logo />
      </Link>
      <div className="public-space-title">
        <span>{title}</span>
        <span className="context-space-label">ADOPTION.IS</span>
      </div>
      <ContextMenu {...props} />
      <div className="sidebar-bottom">
        <div className="guest-note">
          <span className="live-dot" />
          Open to everyone
          <p>
            Good stories deserve to be seen.
            <br />
            Find one that moves you.
          </p>
        </div>
        <Link to="/viewer" className="public-identity">
          <Avatar name={viewer?.name || "Guest"} />
          <span>
            <strong>{viewer?.name || "You’re browsing as a guest"}</strong>
            <small>
              {viewer ? "Your viewer profile" : "No account needed to explore"}
            </small>
          </span>
        </Link>
      </div>
    </aside>
  );
}
