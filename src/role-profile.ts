import { useEffect, useState } from "react";
import { PUBLIC_DEMO } from "./runtime.ts";
import type { DemoAccess, Identity, Role } from "./types.ts";

export type RoleProfile = {
  name: string;
  image: string;
  email: string;
  bio: string;
  website: string;
  focus: string;
  team: string;
  title: string;
  availability: string;
  timezone: string;
  digest: string;
  notifications: boolean[];
};

export const profileRoles: Record<
  Role,
  {
    label: string;
    description: string;
    details: string;
    alerts: string[];
    digest: string;
  }
> = {
  creator: {
    label: "Creator",
    description: "Your creative identity, portfolio and project preferences.",
    details: "Creator details",
    alerts: ["Project invitations", "Ad status updates", "Earnings updates"],
    digest: "Earnings summary frequency",
  },
  nonprofit: {
    label: "Campaign Owner",
    description: "Your organization, mission and campaign preferences.",
    details: "Organization details",
    alerts: [
      "Project request decisions",
      "New creative submissions",
      "Ad spending updates",
    ],
    digest: "Campaign report frequency",
  },
  admin: {
    label: "Admin",
    description: "Your team identity and workspace review preferences.",
    details: "Admin details",
    alerts: [
      "New project requests",
      "Eligibility exceptions",
      "Funding updates",
    ],
    digest: "Review digest frequency",
  },
};

const changedEvent = "ripple-role-profile-changed";

export function useRoleProfile(access: DemoAccess, identity: Identity | null) {
  const identityId =
    access.role === "admin"
      ? "administrator"
      : (access.role === "creator" ? access.creatorId : access.nonprofitId) ||
        "unselected";
  const key = `ripple-${PUBLIC_DEMO ? "public" : "local"}-role-profile-v1:${access.role}:${identityId}`;
  const defaults: RoleProfile = {
    name:
      identity?.name || (access.role === "admin" ? "Demo Administrator" : ""),
    email: "",
    image: "",
    bio: "",
    website: "",
    focus: "",
    team: access.role === "admin" ? "adoption.is" : "",
    title: access.role === "admin" ? "Platform administrator" : "",
    availability: "Open to projects",
    timezone: "America/Chicago",
    digest: access.role === "admin" ? "Daily" : "Weekly",
    notifications: [true, true, true],
  };
  const read = (): RoleProfile => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (!value || typeof value !== "object") return defaults;
      const result = { ...defaults };
      for (const field of Object.keys(defaults) as (keyof RoleProfile)[]) {
        if (field === "notifications") {
          if (
            Array.isArray(value[field]) &&
            value[field].length === 3 &&
            value[field].every((item: unknown) => typeof item === "boolean")
          )
            result[field] = value[field];
        } else if (field === "image") {
          if (
            typeof value.image === "string" &&
            /^data:image\/(webp|png|jpeg);base64,/.test(value.image)
          )
            result.image = value.image;
        } else if (typeof value[field] === "string")
          result[field] = value[field];
      }
      return result;
    } catch {
      return defaults;
    }
  };
  const [loaded, setLoaded] = useState(() => ({ key, profile: read() }));
  useEffect(() => {
    const update = (event?: Event) => {
      if (event instanceof StorageEvent && event.key && event.key !== key)
        return;
      setLoaded({ key, profile: read() });
    };
    update();
    window.addEventListener(changedEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(changedEvent, update);
      window.removeEventListener("storage", update);
    };
  }, [key, identity?.name]);
  return {
    key,
    profile: loaded.key === key ? loaded.profile : read(),
    save(profile: RoleProfile) {
      localStorage.setItem(key, JSON.stringify(profile));
      setLoaded({ key, profile });
      window.dispatchEvent(new Event(changedEvent));
    },
  };
}
