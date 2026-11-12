import { allocateAdFund, type AdFundAllocation } from "./ad-fund-policy.ts";
import type { DailyMetrics } from "./leaderboard-periods.ts";
import { workspaceRequest } from "./workspace.ts";
export type PublicCampaign = { id: string; name: string };
export async function loadPublicCampaigns(): Promise<PublicCampaign[]> {
  const result = await workspaceRequest("/public/campaigns");
  return result.data as PublicCampaign[];
}

export type PublicAd = {
  id: string;
  projectId: string;
  campaignId?: string;
  campaign?: string;
  title: string;
  creator: string;
  creatorId: string;
  caption: string;
  media: string;
  mediaType: "image" | "video";
  poster: string;
  durationSeconds?: number;
  project: string;
  nonprofit: string;
  category: string;
  impressions: number | null;
  clicks: number | null;
  donatedCents: number | null;
  performanceDays?: DailyMetrics[];
};
export async function loadAds(): Promise<PublicAd[]> {
  const result = await workspaceRequest("/public/ads");
  return result.data as PublicAd[];
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const count = (value: number | null) =>
  value === null ? "N/A" : value.toLocaleString("en-US");
export const durationLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const ctr = (ad: Pick<PublicAd, "clicks" | "impressions">) =>
  ad.clicks === null || !ad.impressions
    ? "N/A"
    : `${((100 * ad.clicks) / ad.impressions).toFixed(2)}%`;

type Viewer = { id: string; name: string; email: string; role: "viewer" };
export type Support = {
  id: string;
  viewerId: string;
  adId: string;
  title: string;
  amountCents: number;
  at: string;
  projectId?: string;
  campaignId?: string;
  creatorId?: string;
  allocation?: AdFundAllocation;
};
type ViewerState = {
  profiles: Viewer[];
  activeId: string | null;
  support: Support[];
};
const key = "slander-public-viewers-v1";
export function viewerState(): ViewerState {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : { profiles: [], activeId: null, support: [] };
}
export function activeViewer() {
  const state = viewerState();
  return state.profiles.find((p) => p.id === state.activeId);
}
function save(state: ViewerState) {
  localStorage.setItem(key, JSON.stringify(state));
}
export function createViewer(name: string, email: string) {
  if (
    !name.trim() ||
    name.trim().length > 80 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new Error("Enter your name and a valid email address.");
  const state = viewerState();
  if (state.profiles.some((p) => p.email === email.trim().toLowerCase()))
    throw new Error(
      "That demo profile already exists. Choose it under Saved viewer profiles.",
    );
  const viewer: Viewer = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: "viewer",
  };
  state.profiles.push(viewer);
  state.activeId = viewer.id;
  save(state);
}
export function selectViewer(id: string | null) {
  const state = viewerState();
  if (id && !state.profiles.some((p) => p.id === id))
    throw new Error("Viewer profile unavailable.");
  state.activeId = id;
  save(state);
}
export async function fundAd(ad: PublicAd, amount: string, requestId: string) {
  let state = viewerState();
  const viewer = state.profiles.find(
    (profile) => profile.id === state.activeId,
  );
  if (!viewer) throw new Error("Create or choose a viewer profile first.");
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error("Enter a dollar amount with at most two decimal places.");
  const amountCents = Math.round(Number(amount) * 100);
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 100 ||
    amountCents > 100000
  )
    throw new Error("Choose an amount between $1 and $1,000.");
  const fresh = (await loadAds()).find(
    (item) => item.id === ad.id && item.media === ad.media,
  );
  if (!fresh)
    throw new Error(
      "This ad is no longer available for funding. Return to Discover ads.",
    );
  state = viewerState();
  if (state.activeId !== viewer.id)
    throw new Error(
      "Viewer profile changed. Reopen this contribution and try again.",
    );
  const previous = state.support.find((s) => s.id === requestId);
  if (previous) {
    if (
      previous.viewerId !== viewer.id ||
      previous.adId !== ad.id ||
      previous.amountCents !== amountCents
    )
      throw new Error("This contribution request ID has already been used.");
    return;
  }
  state.support.push({
    id: requestId,
    viewerId: viewer.id,
    adId: ad.id,
    title: ad.title,
    amountCents,
    projectId: fresh.projectId,
    campaignId: fresh.campaignId || fresh.projectId,
    creatorId: fresh.creatorId,
    allocation: allocateAdFund(amountCents),
    at: new Date().toISOString(),
  });
  save(state);
}
export function fundedCents(adId: string) {
  return viewerState()
    .support.filter((s) => s.adId === adId)
    .reduce((sum, s) => sum + s.amountCents, 0);
}
