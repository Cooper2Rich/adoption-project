import { DemoUpdateRequiredError } from "./public-demo/update-recovery.ts";
import { APP_NAME, demoAsset } from "./runtime.ts";
import type { DemoAccess } from "./types.ts";

export function accessHeaders(access?: DemoAccess) {
  return access
    ? {
        "x-demo-role": access.role === "nonprofit" ? "owner" : access.role,
        ...(access.nonprofitId
          ? {
              "x-demo-nonprofit": access.nonprofitId,
              "x-demo-organization": access.nonprofitId,
            }
          : {}),
        ...(access.creatorId ? { "x-demo-creator": access.creatorId } : {}),
      }
    : {};
}

export async function mediaResponse(
  path: string,
  access?: DemoAccess,
  signal?: AbortSignal,
) {
  if (import.meta.env.MODE === "public" && path.startsWith("/api/media/")) {
    const { previewMedia } = await import("./public-demo/workspace.ts");
    return previewMedia(path, access);
  }
  return fetch(path.startsWith("/images/") ? demoAsset(path) : path, {
    headers: accessHeaders(access),
    signal,
  });
}
export async function downloadMedia(path: string, access: DemoAccess) {
  const response = await mediaResponse(path, access);
  if (!response.ok)
    throw new Error("The creative media is unavailable in this view.");
  const blob = await response.blob();
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  };
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${APP_NAME.toLowerCase()}-creative${extensions[blob.type] || ""}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function api<T>(
  path: string,
  access?: DemoAccess,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (import.meta.env.MODE === "public") {
    const { publicApi } = await import("./public-demo/api").catch((cause) => {
      throw new DemoUpdateRequiredError(cause);
    });
    return (await publicApi(path, access, method, body)) as T;
  }
  const form = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...accessHeaders(access),
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request failed. Please try again.");
  return data;
}

export async function downloadPost(id: string, access: DemoAccess) {
  if (import.meta.env.MODE === "public") {
    const data = await api(`/posts/${id}/export`, access);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ripple-${id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const workspace = await api<{
    posts: { id: string; projectId: string }[];
    projects: { id: string; offerVersionId?: string }[];
  }>("/workspace", access);
  const post = workspace.posts.find((p) => p.id === id);
  const campaign = workspace.projects.find((p) => p.id === post?.projectId);
  let query = "";
  if (campaign?.offerVersionId) {
    const page = await api<{ items: { id: string; postId: string }[] }>(
      `/campaigns/${campaign.id}/records/distributions`,
      access,
    );
    const distribution = page.items.find((d) => d.postId === id);
    if (!distribution)
      throw new Error(
        "Create a distribution from Campaigns before exporting this creative.",
      );
    query = `?distributionId=${encodeURIComponent(distribution.id)}`;
  }
  const response = await fetch(`/api/posts/${id}/export${query}`, {
    headers: accessHeaders(access),
  });
  if (!response.ok)
    throw new Error((await response.json()).error || "The download failed.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `slander-${id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
