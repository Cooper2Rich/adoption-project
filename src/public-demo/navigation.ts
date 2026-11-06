export type PublicArea = "home" | "discover" | "about" | "leaders" | "profile";

export function publicArea(pathname: string): PublicArea {
  if (pathname === "/") return "home";
  if (pathname === "/about") return "about";
  if (pathname === "/leaderboard") return "leaders";
  if (pathname === "/viewer") return "profile";
  return "discover";
}

export const publicAreaNames: Record<PublicArea, string> = {
  home: "Home",
  discover: "Discover",
  about: "About adoption.is",
  leaders: "Leaders",
  profile: "Profile",
};
