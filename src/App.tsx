import {
  Activity,
  Archive,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FolderHeart,
  Inbox,
  Layers3,
  Link2,
  Megaphone,
  Menu,
  PanelLeftClose,
  Search,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useState,
  type ComponentType,
} from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { IdentityPicker } from "./components/IdentityPicker.tsx";
import {
  RoleMobileNavigation,
  WorkspaceRail,
} from "./components/WorkspaceRail.tsx";
import type { NavigationControls } from "./components/navigation-controls.ts";
import {
  roleSecondaryActive,
  roleTabKey,
  roleTabs,
} from "./components/role-navigation.ts";
import { Avatar, Logo, Modal } from "./components/ui.tsx";
import { WorkspaceContext } from "./context.tsx";
import { ActivityPage } from "./pages/Activity.tsx";
import { CampaignsPage, GivingPage } from "./pages/Campaigns.tsx";
import { PostsPage } from "./pages/Posts.tsx";
import { ProfilePage } from "./pages/Profile.tsx";
import { ProjectDetail } from "./pages/ProjectDetail.tsx";
import { ProjectsPage } from "./pages/Projects.tsx";
import { reloadPublicDemo } from "./public-demo/update-recovery.ts";
import { profileRoles, useRoleProfile } from "./role-profile.ts";
import { APP_NAME, PUBLIC_DEMO } from "./runtime.ts";
import type { Role } from "./types.ts";
import { useDemoWorkspace } from "./useDemoWorkspace.ts";

type WorkspaceNavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number;
};
const campaignToolTitles: Record<string, string> = {
  spending: "Ad spending",
  archives: "Archived projects",
  creatives: "Creatives",
  "ad-platforms": "Ad platforms",
};

export default function App({
  demoViews = {},
  navigation,
}: {
  navigation?: NavigationControls;
  demoViews?: Partial<
    Record<
      | "ArchivesPage"
      | "CreatorAds"
      | "CreatorPastAds"
      | "CreatorEarnings"
      | "SpendingPage"
      | "CampaignWorkspace"
      | "AdminProjectRedirect"
      | "ProjectRequestsPage"
      | "AdminFunding",
      ComponentType
    >
  > & { AdminCampaigns?: ComponentType<{ archived?: boolean }> };
}) {
  const {
    ArchivesPage = () => null,
    CreatorAds = () => null,
    CreatorPastAds = () => null,
    CreatorEarnings = () => null,
    SpendingPage = () => null,
    AdminCampaigns = () => null,
    CampaignWorkspace = () => null,
    AdminProjectRedirect = () => null,
    ProjectRequestsPage = () => null,
    AdminFunding = () => null,
  } = demoViews;
  const location = useLocation();
  const navigate = useNavigate();
  const {
    access,
    role,
    setRole: changeRole,
    chooseIdentity,
    identity,
    options,
    needsSelection,
    workspace,
    error,
    reloadRequired,
    refresh,
    load,
    loadOptions,
    scopeKey,
  } = useDemoWorkspace();
  const { profile: accountProfile } = useRoleProfile(access, identity);
  const profileName = accountProfile.name || identity?.name || "Select profile";
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    if (navigation?.sidebarOpen === false) setMobileNav(false);
  }, [navigation?.sidebarOpen]);
  const closePanel = () => {
    setMobileNav(false);
    navigation?.setSidebarOpen(false);
  };
  useLayoutEffect(() => {
    if (!PUBLIC_DEMO) setMobileNav(false);
    setSearch("");
  }, [location.pathname]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const setRole = (value: Role) => {
    changeRole(value);
    navigation?.setSidebarOpen(true);
    setMobileNav(false);
    setSearch("");
    setToast("");
    setHelp(false);
    if (PUBLIC_DEMO)
      navigate(
        value === "creator"
          ? "/review"
          : value === "admin"
            ? "/campaigns"
            : "/projects",
      );
  };
  const pending =
    workspace?.posts.filter((p) =>
      role === "creator"
        ? ["pending", "changes"].includes(p.status)
        : p.status === "held",
    ).length || 0;
  const selectedCampaignId =
    PUBLIC_DEMO && role === "admin"
      ? /^\/campaigns\/([^/]+)/.exec(location.pathname)?.[1]
      : undefined;
  const title =
    location.pathname === "/profile"
      ? "Profile"
      : PUBLIC_DEMO && location.pathname === "/earnings"
        ? "Earnings"
        : PUBLIC_DEMO && location.pathname === "/funding"
          ? "Funding"
          : PUBLIC_DEMO && location.pathname === "/project-requests"
            ? "Project requests"
            : selectedCampaignId
              ? campaignToolTitles[location.pathname.split("/").pop() || ""] ||
                "Projects"
              : PUBLIC_DEMO && location.pathname === "/spending"
                ? "Ad spending"
                : PUBLIC_DEMO && location.pathname === "/archives"
                  ? role === "creator"
                    ? "Past ads"
                    : role === "admin"
                      ? "Archived campaigns"
                      : "Archived projects"
                  : PUBLIC_DEMO &&
                      role === "creator" &&
                      location.pathname === "/review"
                    ? "My ads"
                    : location.pathname.startsWith("/campaigns")
                      ? "Campaigns"
                      : PUBLIC_DEMO && location.pathname === "/posts"
                        ? "Creatives"
                        : location.pathname === "/review"
                          ? role === "creator"
                            ? "My creatives"
                            : "Platform exceptions"
                          : location.pathname === "/approved"
                            ? role === "creator"
                              ? "Eligible library & counts"
                              : "Eligible creatives"
                            : location.pathname === "/activity"
                              ? "Activity"
                              : location.pathname === "/posts"
                                ? "All submissions"
                                : "Projects";
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  const legacyNav = [
    { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
    {
      to: "/projects",
      icon: FolderHeart,
      label:
        role === "creator"
          ? "Published projects"
          : role === "nonprofit"
            ? "Our projects"
            : "Projects",
    },
    {
      to: "/review",
      icon: Inbox,
      label: role === "creator" ? "My creatives" : "Platform exceptions",
      count: pending,
    },
    { to: "/posts", icon: Layers3, label: "All submissions" },
    {
      to: "/approved",
      icon: role === "creator" ? Trophy : CheckCheck,
      label:
        role === "creator" ? "Eligible library & counts" : "Eligible creatives",
    },
    ...(role !== "creator"
      ? [{ to: "/activity", icon: Activity, label: "Activity" }]
      : []),
  ];
  const nav: WorkspaceNavItem[] = !PUBLIC_DEMO
    ? legacyNav
    : role === "creator"
      ? [
          { to: "/review", icon: Layers3, label: "My ads", count: pending },
          { to: "/archives", icon: Inbox, label: "Past ads" },
          { to: "/earnings", icon: Wallet, label: "Earnings" },
          { to: "/projects", icon: FolderHeart, label: "Projects" },
        ]
      : role === "admin"
        ? selectedCampaignId
          ? [
              { to: "/campaigns", icon: Megaphone, label: "All campaigns" },
              {
                to: `/campaigns/${selectedCampaignId}`,
                icon: FolderHeart,
                label: "Projects",
              },
              {
                to: `/campaigns/${selectedCampaignId}/creatives`,
                icon: Layers3,
                label: "Creatives",
              },
              {
                to: `/campaigns/${selectedCampaignId}/spending`,
                icon: Wallet,
                label: "Ad spending",
              },
              {
                to: `/campaigns/${selectedCampaignId}/ad-platforms`,
                icon: Link2,
                label: "Ad platforms",
              },
              {
                to: `/campaigns/${selectedCampaignId}/archives`,
                icon: Inbox,
                label: "Archived projects",
              },
              ...(workspace?.projects.some(
                (p) =>
                  p.campaignId === selectedCampaignId &&
                  p.id === "fictional-river-showcase-v1",
              )
                ? [
                    {
                      to: `/campaigns/${selectedCampaignId}/gift-records/fictional-river-showcase-v1`,
                      icon: Wallet,
                      label: "Cause-gift records",
                    },
                  ]
                : []),
              { to: "/funding", icon: Wallet, label: "Funding" },
            ]
          : [
              { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
              {
                to: "/project-requests",
                icon: Inbox,
                label: "Project requests",
                count: workspace?.projectRequests?.filter(
                  (r) => r.status === "pending",
                ).length,
              },
              { to: "/posts", icon: Layers3, label: "Creatives" },
              { to: "/funding", icon: Wallet, label: "Funding" },
              { to: "/archives", icon: Archive, label: "Archived campaigns" },
              { to: "/activity", icon: Activity, label: "Activity" },
            ]
        : [
            { to: "/projects", icon: FolderHeart, label: "Projects" },
            { to: "/project-requests", icon: Inbox, label: "Project requests" },
            { to: "/posts", icon: Layers3, label: "Creatives" },
            { to: "/spending", icon: Trophy, label: "Ad spending" },
            { to: "/archives", icon: Inbox, label: "Archived projects" },
            { to: "/activity", icon: Activity, label: "Activity" },
          ];
  const activeRoleTab = roleTabs[role].find(
    (tab) => tab.key === roleTabKey(role, location.pathname),
  )!;
  nav.push({ to: "/profile", icon: UserRound, label: "Profile overview" });
  const secondaryNav: WorkspaceNavItem[] = PUBLIC_DEMO
    ? nav.filter((item) => roleTabKey(role, item.to) === activeRoleTab.key)
    : nav;
  if (PUBLIC_DEMO && activeRoleTab.key === "profile")
    secondaryNav.push(
      {
        to: "/profile?section=appearance",
        label: "Appearance",
        icon: Settings2,
      },
      {
        to: "/profile?section=role-details",
        label: profileRoles[role].details,
        icon: UserRound,
      },
      {
        to: "/profile?section=account-settings",
        label: "Account settings",
        icon: Settings2,
      },
      {
        to: "/profile?section=notifications",
        label: "Notifications",
        icon: Bell,
      },
    );
  if (PUBLIC_DEMO && role === "creator" && activeRoleTab.key === "earnings")
    secondaryNav.push(
      {
        to: "/earnings?section=earnings-by-ad",
        label: "Earnings by ad",
        icon: Wallet,
      },
      {
        to: "/earnings?section=creator-wins-title",
        label: "Past leaderboard wins",
        icon: Trophy,
      },
    );
  if (PUBLIC_DEMO && role === "admin" && activeRoleTab.key === "funding")
    secondaryNav.push({
      to: "/funding?section=campaign-performance",
      label: "Campaign performance",
      icon: Trophy,
    });
  if (PUBLIC_DEMO && role === "nonprofit" && activeRoleTab.key === "spending")
    secondaryNav.push({
      to: "/spending?section=ad-contributions",
      label: "Ad spend contributions",
      icon: Wallet,
    });
  const roleNavigation: NavigationControls | undefined = navigation && {
    ...navigation,
    selectTab: (to) => {
      const same = roleTabKey(role, to) === activeRoleTab.key;
      navigation.setSidebarOpen(same ? !navigation.sidebarOpen : true);
      if (!same) navigate(to);
    },
  };
  const mobileNavigation: NavigationControls | undefined = roleNavigation && {
    ...roleNavigation,
    sidebarOpen: mobileNav,
    selectTab: (to) => {
      const same = roleTabKey(role, to) === activeRoleTab.key;
      const open = same ? !mobileNav : true;
      setMobileNav(open);
      roleNavigation.setSidebarOpen(open);
      if (!same) navigate(to);
    },
  };
  useEffect(() => {
    if (!PUBLIC_DEMO) return;
    const section = new URLSearchParams(location.search).get("section");
    if (!section) {
      const frame = requestAnimationFrame(() => window.scrollTo(0, 0));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    const alignSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        document.getElementById(section)?.scrollIntoView(),
      );
    };
    // Async reports can change the height above the requested section.
    // Keep it aligned until the visitor starts interacting with the page.
    const observer = new ResizeObserver(alignSection);
    const content = document.getElementById("main-content");
    if (content) observer.observe(content);
    const inputs = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      inputs.forEach((input) => window.removeEventListener(input, stop));
    };
    inputs.forEach((input) =>
      window.addEventListener(input, stop, { passive: true }),
    );
    alignSection();
    return stop;
  }, [location.pathname, location.search, Boolean(workspace)]);
  if (/^\/campaigns\/[^/]+\/give\/?$/.test(location.pathname)) {
    return (
      <Routes>
        <Route path="/campaigns/:id/give" element={<GivingPage />} />
      </Routes>
    );
  }
  return (
    <div
      className={`app-shell ${navigation && !navigation.sidebarOpen ? "workspace-secondary-closed" : ""} ${navigation && !navigation.railOpen ? "workspace-rail-closed" : ""}`}
    >
      {PUBLIC_DEMO && (
        <WorkspaceRail
          role={role}
          profileImage={accountProfile.image}
          profileName={profileName}
          navigation={roleNavigation}
          hidden={navigation ? !navigation.railOpen : false}
        />
      )}
      <a
        className="skip-link"
        href="#main-content"
        onClick={
          PUBLIC_DEMO
            ? (event) => {
                event.preventDefault();
                document.getElementById("main-content")?.focus();
                document.getElementById("main-content")?.scrollIntoView();
              }
            : undefined
        }
      >
        Skip to content
      </a>
      {mobileNav && !PUBLIC_DEMO && (
        <button
          className="mobile-backdrop"
          onClick={closePanel}
          aria-label="Close navigation"
        />
      )}

      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => {
              navigation?.setSidebarOpen(!mobileNav);
              setMobileNav((old) => !old);
            }}
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            aria-controls="public-secondary-navigation"
          >
            <Menu size={22} />
          </button>
          {navigation && (
            <div className="public-layout-controls">
              <button
                className="icon-button"
                aria-label={
                  navigation.railOpen
                    ? "Hide main navigation"
                    : "Show main navigation"
                }
                aria-expanded={navigation.railOpen}
                aria-controls="public-main-navigation"
                onClick={navigation.toggleRail}
              >
                <Menu size={19} />
              </button>
              {navigation.sidebarOpen && (
                <button
                  className="icon-button"
                  aria-label="Hide secondary sidebar"
                  aria-expanded={navigation.sidebarOpen}
                  aria-controls="public-secondary-navigation"
                  onClick={navigation.toggleSidebar}
                >
                  <PanelLeftClose size={19} />
                </button>
              )}
            </div>
          )}
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            {!needsSelection && (
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="Search workspace"
                  placeholder={
                    PUBLIC_DEMO
                      ? role === "admin"
                        ? "Search campaigns, projects, ads…"
                        : "Search projects, ads, creators…"
                      : "Search workspace..."
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            <span className="demo-pill">
              <span />
              DEMO
            </span>
            <label className="role-switch">
              <span className="sr-only">Demo role</span>
              <ShieldCheck size={16} />
              <select
                aria-label="Demo role"
                value={role}
                onChange={(e) =>
                  e.target.value === "public"
                    ? navigation
                      ? navigation.selectTab("/explore")
                      : navigate("/explore")
                    : setRole(e.target.value as Role)
                }
              >
                {PUBLIC_DEMO && <option value="public">Public viewer</option>}
                <option value="admin">Admin View</option>
                <option value="nonprofit">Campaign Owner</option>
                <option value="creator">Creator</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
        </header>
        {PUBLIC_DEMO && mobileNavigation && (
          <RoleMobileNavigation
            role={role}
            navigation={mobileNavigation}
            profileImage={accountProfile.image}
            profileName={profileName}
          />
        )}
        <aside
          id="public-secondary-navigation"
          hidden={navigation ? !navigation.sidebarOpen : false}
          className={`sidebar ${mobileNav ? "open" : ""}`}
        >
          <NavLink
            to={PUBLIC_DEMO ? roleTabs[role][0].to : "/projects"}
            className="brand"
            aria-label={`${APP_NAME} home`}
          >
            <Logo />
          </NavLink>
          <div className="workspace-identity">
            <Avatar
              name={profileName}
              src={accountProfile.image}
              logo={role === "nonprofit"}
              index={2}
            />
            <div>
              <strong>{profileName}</strong>
              <small>
                {role === "admin"
                  ? "All organizations & projects"
                  : role === "nonprofit"
                    ? "Campaign Owner workspace"
                    : "Creator workspace"}
              </small>
            </div>
          </div>
          {role !== "admin" && identity && (
            <button
              className="change-identity"
              onClick={() => {
                chooseIdentity(null);
                setMobileNav(false);
                setSearch("");
                setToast("");
                navigate("/projects");
              }}
            >
              Change {role === "nonprofit" ? "nonprofit" : "creator"}
              <ArrowUpRight size={13} />
            </button>
          )}
          <span className="nav-label">
            {PUBLIC_DEMO
              ? selectedCampaignId
                ? "CAMPAIGN TOOLS"
                : activeRoleTab.name.toUpperCase()
              : "WORKSPACE"}
          </span>
          <nav aria-label="Main navigation">
            {!needsSelection &&
              secondaryNav.map((item) => (
                <NavLink
                  to={item.to}
                  end={
                    PUBLIC_DEMO &&
                    (item.to === "/campaigns" ||
                      item.to === `/campaigns/${selectedCampaignId}`)
                  }
                  onClick={() => setMobileNav(false)}
                  aria-current={
                    PUBLIC_DEMO
                      ? roleSecondaryActive(
                          location.pathname,
                          location.search,
                          item.to,
                        )
                        ? "page"
                        : false
                      : undefined
                  }
                  key={item.to}
                  className={({ isActive }) =>
                    `nav-item ${(PUBLIC_DEMO ? roleSecondaryActive(location.pathname, location.search, item.to) : isActive) ? "active" : ""}`
                  }
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                  {item.count ? (
                    <span className="nav-count">{item.count}</span>
                  ) : null}
                </NavLink>
              ))}
          </nav>
          <div className="sidebar-bottom">
            {!PUBLIC_DEMO && (
              <div className="sidebar-note">
                <span className="note-doodle">✳</span>
                <h3>
                  Built for the
                  <br />
                  good you do.
                </h3>
                <p>
                  Your mission deserves
                  <br />
                  to be heard.
                </p>
                <button onClick={() => setHelp(true)}>
                  Take a quick tour
                  <ArrowUpRight size={14} />
                </button>
              </div>
            )}
            <button className="help-button" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
              How this demo works
              <ArrowUpRight size={15} />
            </button>
            {!PUBLIC_DEMO && (
              <div className="sidebar-user">
                <Avatar
                  name={profileName}
                  src={accountProfile.image}
                  logo={role === "nonprofit"}
                  index={2}
                />
                <div>
                  <strong>
                    {role === "admin"
                      ? "Administrator"
                      : identity?.name || "Select your profile"}
                  </strong>
                  <small>
                    {role === "admin"
                      ? "Admin View"
                      : role === "nonprofit"
                        ? "Campaign Owner"
                        : "Creator"}
                  </small>
                </div>
                <span className="online-dot" />
              </div>
            )}
          </div>
        </aside>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {error && (
            <div className="load-error" role="alert">
              <p>{error}</p>
              {reloadRequired && (
                <p>
                  Your saved profiles, ads and contributions stay in this
                  browser.
                </p>
              )}
              <button
                className="button secondary"
                onClick={reloadRequired ? reloadPublicDemo : load}
              >
                {reloadRequired ? "Reload demo" : "Try again"}
              </button>
            </div>
          )}
          {needsSelection && !reloadRequired && (
            <IdentityPicker
              key={role}
              access={access}
              options={options}
              onSelect={(id) => {
                chooseIdentity(id);
                if (!PUBLIC_DEMO) navigate("/projects");
              }}
              refreshOptions={loadOptions}
            />
          )}
          {!workspace && !needsSelection && !error && (
            <div className="loading-state">
              <Logo small />
              <p>Loading workspace…</p>
            </div>
          )}
          {workspace && (
            <WorkspaceContext.Provider
              key={scopeKey}
              value={{
                ...workspace,
                role,
                access,
                identity,
                setRole,
                search,
                setSearch,
                refresh,
                notify: setToast,
              }}
            >
              <Routes>
                <Route path="/profile" element={<ProfilePage />} />
                {PUBLIC_DEMO ? (
                  <>
                    <Route
                      path="/campaigns"
                      element={
                        role === "admin" ? (
                          <AdminCampaigns />
                        ) : (
                          <Navigate to="/projects" replace />
                        )
                      }
                    />
                    <Route
                      path="/campaigns/:campaignId/*"
                      element={
                        role === "admin" ? (
                          <CampaignWorkspace />
                        ) : (
                          <Navigate to="/projects" replace />
                        )
                      }
                    />
                    <Route
                      path="/opportunities/:id"
                      element={
                        role === "creator" ? (
                          <CampaignsPage />
                        ) : (
                          <Navigate
                            to={role === "admin" ? "/campaigns" : "/projects"}
                            replace
                          />
                        )
                      }
                    />
                    <Route
                      path="/project-requests"
                      element={<ProjectRequestsPage />}
                    />
                    <Route path="/funding" element={<AdminFunding />} />
                    <Route path="/earnings" element={<CreatorEarnings />} />
                  </>
                ) : (
                  <>
                    <Route path="/campaigns" element={<CampaignsPage />} />
                    <Route path="/campaigns/:id" element={<CampaignsPage />} />
                  </>
                )}
                <Route
                  path="/projects"
                  element={
                    PUBLIC_DEMO && role === "admin" ? (
                      <Navigate to="/campaigns" replace />
                    ) : (
                      <ProjectsPage />
                    )
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    PUBLIC_DEMO && role === "admin" ? (
                      <AdminProjectRedirect />
                    ) : (
                      <ProjectDetail />
                    )
                  }
                />
                <Route
                  path="/review"
                  element={
                    PUBLIC_DEMO && role === "creator" ? (
                      <CreatorAds />
                    ) : (
                      <PostsPage key="review" mode="review" />
                    )
                  }
                />
                <Route
                  path="/approved"
                  element={
                    PUBLIC_DEMO && role === "creator" ? (
                      <Navigate to="/review" replace />
                    ) : (
                      <PostsPage key="approved" mode="approved" />
                    )
                  }
                />
                <Route
                  path="/posts"
                  element={
                    PUBLIC_DEMO && role === "creator" ? (
                      <Navigate to="/review" replace />
                    ) : (
                      <PostsPage key="posts" mode="all" />
                    )
                  }
                />
                {PUBLIC_DEMO && (
                  <Route
                    path="/spending"
                    element={
                      role === "creator" ? (
                        <Navigate to="/review" replace />
                      ) : role === "admin" ? (
                        <Navigate to="/funding" replace />
                      ) : (
                        <SpendingPage />
                      )
                    }
                  />
                )}
                {PUBLIC_DEMO && (
                  <Route
                    path="/archives"
                    element={
                      role === "creator" ? (
                        <CreatorPastAds />
                      ) : role === "admin" ? (
                        <AdminCampaigns archived />
                      ) : (
                        <ArchivesPage />
                      )
                    }
                  />
                )}
                <Route
                  path="/activity"
                  element={
                    role === "creator" ? (
                      <Navigate to="/projects" replace />
                    ) : (
                      <ActivityPage />
                    )
                  }
                />
                <Route
                  path="*"
                  element={
                    <Navigate
                      to={
                        PUBLIC_DEMO && role === "admin"
                          ? "/campaigns"
                          : "/projects"
                      }
                      replace
                    />
                  }
                />
              </Routes>
            </WorkspaceContext.Provider>
          )}
        </main>
        <footer className="app-footer">
          <span>
            {PUBLIC_DEMO
              ? "Fictional demo workspace"
              : "Stories for good. A little louder."}
          </span>
          <span>
            {APP_NAME.toUpperCase()} © {new Date().getFullYear()}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {help && (
        <Modal
          title={
            PUBLIC_DEMO
              ? "How this demo works"
              : "A little tour. A lot of possibility."
          }
          subtitle={`Welcome to your ${APP_NAME} demo workspace.`}
          onClose={() => setHelp(false)}
        >
          <div className="form-content help-content">
            <div>
              <span>01</span>
              <section>
                <h3>Start with a project</h3>
                <p>
                  {PUBLIC_DEMO
                    ? "Admin manages campaigns, project requests and funding. Campaign owners request projects for Admin review; pricing remains pending. Open a campaign as Admin for its projects, ad spending and archived projects."
                    : "Open Campaigns as Admin and initialize the fictional showcase. Switch to Campaign Owner to explore scoped funding and reports."}
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>
                  {PUBLIC_DEMO ? "Create an ad" : "Bring a story to the table"}
                </h3>
                <p>
                  Select Alex River in Creator view. Open{" "}
                  {PUBLIC_DEMO ? "Projects" : "Campaigns"}, accept the frozen
                  terms, and submit the supplied sample creative.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Automatic checks, visible evidence</h3>
                <p>
                  Valid creatives become eligible automatically. Creators can
                  revise eligible work; each revision keeps its own snapshot.
                  Admin handles evidence-linked holds and appeals.
                </p>
              </section>
            </div>
            <div>
              <span>04</span>
              <section>
                <h3>
                  {PUBLIC_DEMO ? "Review funding" : "Get ready for Instagram"}
                </h3>
                <p>
                  {PUBLIC_DEMO
                    ? "New ad-fund contributions allocate 10% to the creator, 5% for application use and 85% to the nonprofit. Admin Funding separates allocations from payouts. Existing cause-gift records and sample statements remain under the associated campaign."
                    : "Create a tracked giving link, open it, and confirm a simulated $100 gift. See $10 creator, $90 beneficiary, and one vote. Admin can export a sample week statement from Settlement."}
                </p>
              </section>
            </div>
            <div className="callout">
              <p>
                {PUBLIC_DEMO
                  ? "This is the full demo interface with fictional browser-local records and selectable roles. Changes and uploaded media stay in this browser. No real payments, shared server accounting, live Instagram authorization or publishing."
                  : "This is a local demo with sample organizations and selectable roles, not account sign-in. Changes persist on this computer. Payments, live Instagram authorization, and publishing are not enabled."}
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="button primary" onClick={() => setHelp(false)}>
              {PUBLIC_DEMO ? "Close tour" : "Let’s make something good"}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
