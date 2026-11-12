import type { DemoAccess, Workspace } from "../types.ts";

import { viewerState } from "./catalog.ts";
import { creatorEarningsReport } from "./creator-earnings.ts";
import {
  attributionFor,
  campaignId,
  creatorId,
  workspaceRequest,
} from "./workspace.ts";

// Project/creative actions reuse local domain rules. Money is explicitly simulated.
const key = "slander-public-preview-v1";
type Result = {
  amountCents: number;
  creatorCents: number;
  beneficiaryCents: number;
  votes: number;
  unallocatedCents: number;
};
type Intent = {
  id: string;
  amountCents: number;
  attributed: boolean;
  creatorId?: string;
  createdAt: string;
  result?: Result;
};
type Preview = { accepted: boolean; posts: unknown[]; intents: Intent[] };
function read(): Preview {
  const value = JSON.parse(localStorage.getItem(key) || "null");
  return value && Array.isArray(value.intents)
    ? value
    : { accepted: false, posts: [], intents: [] };
}
function write(value: Preview) {
  localStorage.setItem(key, JSON.stringify(value));
}
function totals(state: Preview, selectedCreator?: string | null) {
  const gifts = state.intents
    .filter(
      (i) => !selectedCreator || (i.creatorId || creatorId) === selectedCreator,
    )
    .flatMap((i) => (i.result ? [i.result] : []));
  const sum = (field: keyof Result) =>
    gifts.reduce((n, gift) => n + gift[field], 0);
  return {
    creatorCents: sum("creatorCents"),
    beneficiaryCents: sum("beneficiaryCents"),
    votes: sum("votes"),
    capturedCents: sum("amountCents"),
    availableCreatorCents: sum("creatorCents"),
    availableSeedGuaranteeCents: 60000,
    availableMediaCents: 40000,
    feeAssumption:
      "Browser-only fictional preview; fees assumed zero. No server journal or real money.",
  };
}
export async function publicApi(
  path: string,
  access?: DemoAccess,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const workspace = await workspaceRequest(path, access, method, body);
  if (workspace.handled) return workspace.data;
  const state = read(),
    input = (body || {}) as Record<string, unknown>;
  if (
    method === "GET" &&
    ["/creator-earnings", "/creator-earnings?samples=0"].includes(path)
  ) {
    if (access?.role !== "creator" || !access.creatorId)
      throw new Error("Choose a creator profile to view your earnings.");
    const scoped = await workspaceRequest("/workspace", access);
    const data = scoped.data as Workspace;
    const samples = path.includes("samples=0")
      ? undefined
      : data.sampleFinancials;
    return creatorEarningsReport(
      access.creatorId,
      data.posts,
      [...(samples?.contributions || []), ...viewerState().support],
      state.intents.map((intent) => ({
        ...intent,
        creatorId: intent.creatorId || creatorId,
      })),
      samples?.payments || [],
    );
  }
  if (method === "GET" && path === `/campaigns/${campaignId}/finance`) {
    if (access?.role === "nonprofit")
      throw new Error(
        "Campaign finance is available to Admin. Owners can view their project ad spending.",
      );
    const scoped = await workspaceRequest("/workspace", access);
    const projects = (scoped.data as { projects: { id: string }[] }).projects;
    if (!projects.some((p) => p.id === campaignId))
      throw new Error("Campaign unavailable in this view.");
    return totals(state, access?.role === "creator" ? access.creatorId : null);
  }
  if (method === "POST" && path === `/giving/${campaignId}/intents`) {
    const amountCents = Number(input.amountCents);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > 100000000
    )
      throw new Error("Enter a simulated amount between $0.01 and $1,000,000.");
    const attribution = attributionFor(
      new URLSearchParams(location.hash.split("?")[1] || "").get("ref"),
    );
    const intent: Intent = {
      id: crypto.randomUUID(),
      amountCents,
      createdAt: new Date().toISOString(),
      attributed: !!attribution,
      creatorId: attribution?.creatorId,
    };
    state.intents.push(intent);
    write(state);
    return { id: intent.id };
  }
  if (
    method === "POST" &&
    path.startsWith(`/giving/${campaignId}/intents/`) &&
    path.endsWith("/confirm")
  ) {
    const intent = state.intents.find(
      (i) => path === `/giving/${campaignId}/intents/${i.id}/confirm`,
    );
    if (!intent)
      throw new Error(
        "Preview gift unavailable. Return to the campaign and create a tracked link.",
      );
    if (!intent.result) {
      const creatorCents = intent.attributed
        ? Math.round(intent.amountCents / 10)
        : 0;
      intent.result = {
        amountCents: intent.amountCents,
        creatorCents,
        beneficiaryCents: intent.attributed
          ? intent.amountCents - creatorCents
          : 0,
        votes: intent.attributed ? 1 : 0,
        unallocatedCents: intent.attributed ? 0 : intent.amountCents,
      };
      write(state);
    }
    return intent.result;
  }
  if (method === "GET" && path === "/demo/grade-example")
    return {
      illustrative: true,
      score: 77.5,
      components: { ctr: 1, views: 0.75, votes: 1, amount: 0.5 },
    };
  if (method === "POST" && path === "/demo/sample-statement") {
    if (access?.role !== "admin")
      throw new Error("Switch to Admin to export this sample.");
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start.getTime() + 7 * 86400000);
    const current = {
      ...state,
      intents: state.intents.filter(
        (i) =>
          i.createdAt >= start.toISOString() &&
          i.createdAt < end.toISOString() &&
          (i.creatorId || creatorId) === creatorId,
      ),
    };
    return {
      disclosure:
        "Fictional browser-local preview only. No server journal, approved batch or payment.",
      campaignId,
      creatorId,
      currency: "USD",
      mode: "simulated",
      period: { startsAt: start.toISOString(), endsAt: end.toISOString() },
      statement: {
        ...totals(current),
        paidCents: 0,
        seedTopUpCents: 0,
        gifts: current.intents.flatMap((i) => (i.result ? [i.result] : [])),
      },
    };
  }
  throw new Error("This advanced operation is unavailable in the public demo.");
}
