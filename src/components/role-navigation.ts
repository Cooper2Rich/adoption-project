import {
  Activity,
  FolderHeart,
  Inbox,
  Layers3,
  Megaphone,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../types.ts";

export type RoleTab = {
  key: string;
  to: string;
  label: string;
  name: string;
  icon: LucideIcon;
};

const profileTab: RoleTab = {
  key: "profile",
  to: "/profile",
  label: "Profile",
  name: "Profile",
  icon: UserRound,
};

export const roleTabs: Record<Role, RoleTab[]> = {
  creator: [
    {
      key: "ads",
      to: "/review",
      label: "My ads",
      name: "My ads",
      icon: Layers3,
    },
    {
      key: "earnings",
      to: "/earnings",
      label: "Earnings",
      name: "Earnings",
      icon: Wallet,
    },
    {
      key: "projects",
      to: "/projects",
      label: "Projects",
      name: "Projects",
      icon: FolderHeart,
    },
    profileTab,
  ],
  nonprofit: [
    {
      key: "projects",
      to: "/projects",
      label: "Projects",
      name: "Projects",
      icon: FolderHeart,
    },
    {
      key: "creatives",
      to: "/posts",
      label: "Creatives",
      name: "Creatives",
      icon: Layers3,
    },
    {
      key: "spending",
      to: "/spending",
      label: "Ad spend",
      name: "Ad spending",
      icon: Wallet,
    },
    {
      key: "activity",
      to: "/activity",
      label: "Activity",
      name: "Activity",
      icon: Activity,
    },
    profileTab,
  ],
  admin: [
    {
      key: "campaigns",
      to: "/campaigns",
      label: "Campaigns",
      name: "Campaigns",
      icon: Megaphone,
    },
    {
      key: "requests",
      to: "/project-requests",
      label: "Requests",
      name: "Project requests",
      icon: Inbox,
    },
    {
      key: "creatives",
      to: "/posts",
      label: "Creatives",
      name: "Creatives",
      icon: Layers3,
    },
    {
      key: "funding",
      to: "/funding",
      label: "Funding",
      name: "Funding",
      icon: Wallet,
    },
    {
      key: "activity",
      to: "/activity",
      label: "Activity",
      name: "Activity",
      icon: Activity,
    },
    profileTab,
  ],
};

export function roleTabKey(role: Role, pathname: string) {
  const path = pathname.split("?")[0];
  if (path === "/profile") return "profile";
  if (role === "creator") {
    if (path === "/earnings") return "earnings";
    if (path.startsWith("/projects")) return "projects";
    return "ads";
  }
  if (role === "admin" && path.startsWith("/campaigns/")) return "campaigns";
  if (path === "/posts") return "creatives";
  if (path === "/activity") return "activity";
  if (role === "nonprofit")
    return path === "/spending" ? "spending" : "projects";
  if (path === "/funding") return "funding";
  if (path === "/project-requests") return "requests";
  return "campaigns";
}

export function roleSecondaryActive(
  pathname: string,
  search: string,
  to: string,
) {
  const [target, query = ""] = to.split("?");
  const exact = target === "/campaigns" || /^\/campaigns\/[^/]+$/.test(target);
  const pathMatches =
    pathname === target || (!exact && pathname.startsWith(`${target}/`));
  return (
    pathMatches &&
    (new URLSearchParams(search).get("section") || "") ===
      (new URLSearchParams(query).get("section") || "")
  );
}
