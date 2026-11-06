import { Compass, House, Info, Trophy, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, Logo } from "./ui";
import { publicArea } from "../public-demo/navigation";
import type { Role } from "../types";
import { roleTabs, roleTabKey } from "./role-navigation";
import {
  selectNavigationTab,
  type NavigationControls,
} from "./navigation-controls";

export function WorkspaceRail({
  role,
  profileLabel = "Your profile",
  profileImage,
  profileName = "Your profile",
  hidden = false,
  navigation,
}: {
  role?: Role;
  profileLabel?: string;
  profileImage?: string;
  profileName?: string;
  hidden?: boolean;
  navigation?: NavigationControls;
}) {
  const { pathname } = useLocation();
  const area = role ? roleTabKey(role, pathname) : publicArea(pathname);
  const tabs = role
    ? roleTabs[role].map((tab) => ({ ...tab, area: tab.key, Icon: tab.icon }))
    : [
        { to: "/", label: "Home", name: "Home", area: "home", Icon: House },
        {
          to: "/explore",
          label: "Discover",
          name: "Discover ads",
          area: "discover",
          Icon: Compass,
        },
        {
          to: "/about",
          label: "About",
          name: "About adoption.is",
          area: "about",
          Icon: Info,
        },
        {
          to: "/leaderboard",
          label: "Leaders",
          name: "Leaderboard",
          area: "leaders",
          Icon: Trophy,
        },
      ];
  return (
    <nav
      id="public-main-navigation"
      hidden={hidden}
      className="workspace-rail"
      aria-label="Workspace shortcuts"
    >
      <Link
        to={role ? roleTabs[role][0].to : "/"}
        className="rail-brand"
        aria-label={role ? "Workspace home" : "adoption.is home"}
      >
        <Logo small />
      </Link>
      {tabs.map(({ to, label, name, area: itemArea, Icon }) => (
        <Link
          key={to}
          to={to}
          className={`rail-item ${role && itemArea === "profile" ? "rail-profile" : ""} ${area === itemArea ? "selected" : ""}`}
          aria-label={name}
          aria-current={area === itemArea ? "page" : undefined}
          aria-expanded={
            navigation ? area === itemArea && navigation.sidebarOpen : undefined
          }
          aria-controls={navigation ? "public-secondary-navigation" : undefined}
          onClick={(event) => selectNavigationTab(event, to, navigation)}
        >
          <span>
            {role && itemArea === "profile" && profileImage ? (
              <Avatar
                name={profileName}
                src={profileImage}
                logo={role === "nonprofit"}
              />
            ) : (
              <Icon size={21} />
            )}
          </span>
          <small>{label}</small>
        </Link>
      ))}
      {!role && (
        <Link
          to="/viewer"
          className={`rail-item rail-profile ${area === "profile" ? "selected" : ""}`}
          aria-label={profileLabel}
          aria-current={area === "profile" ? "page" : undefined}
          aria-expanded={
            navigation
              ? area === "profile" && navigation.sidebarOpen
              : undefined
          }
          aria-controls={navigation ? "public-secondary-navigation" : undefined}
          onClick={(event) => selectNavigationTab(event, "/viewer", navigation)}
        >
          <span>
            <UserRound size={20} />
          </span>
          <small>Profile</small>
        </Link>
      )}
    </nav>
  );
}

export function RoleMobileNavigation({
  role,
  navigation,
  profileImage,
  profileName = "Your profile",
}: {
  role: Role;
  navigation: NavigationControls;
  profileImage?: string;
  profileName?: string;
}) {
  const { pathname } = useLocation();
  const active = roleTabKey(role, pathname);
  return (
    <nav className="role-mobile-nav" aria-label="Mobile workspace navigation">
      {roleTabs[role].map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className={`nav-item ${active === tab.key ? "active" : ""}`}
          aria-label={tab.name}
          aria-current={active === tab.key ? "page" : undefined}
          aria-expanded={active === tab.key && navigation.sidebarOpen}
          aria-controls="public-secondary-navigation"
          onClick={(event) => selectNavigationTab(event, tab.to, navigation)}
        >
          {tab.key === "profile" && profileImage ? (
            <Avatar
              name={profileName}
              src={profileImage}
              logo={role === "nonprofit"}
            />
          ) : (
            <tab.icon size={16} />
          )}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
