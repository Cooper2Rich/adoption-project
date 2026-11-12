import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canViewProject, readAccess } from "./access.ts";
import type { DemoRecords, DemoState, DemoStore } from "./demo-types.ts";
import { AppError, getProject } from "./domain.ts";
import {
  currentEligibility,
  mediaDigest,
  refreshEligibility,
} from "./eligibility.ts";

export function mediaSignature(bytes: any, mime: any) {
  const header = bytes.subarray(0, 16);
  const actual =
    header[0] === 255 && header[1] === 216
      ? "image/jpeg"
      : header
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : header.toString("ascii", 0, 4) === "RIFF" &&
            header.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : header.toString("ascii", 4, 8) === "ftyp"
            ? "video"
            : "";
  return (
    !!actual &&
    (actual === "video" ? mime.startsWith("video/") : mime === actual)
  );
}
const mimeFor = (path: any) =>
  (
    ({
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
    }) as Record<string, string>
  )[path.split(".").at(-1)];
export function registerMedia(
  records: DemoRecords,
  file: any,
  access: any,
  at: any = new Date().toISOString(),
) {
  const bytes = readFileSync(file.path);
  return records.append("media", {
    id: randomUUID(),
    campaignId: "unassigned",
    mode: "simulated",
    effectiveAt: at,
    ownerCreatorIds: access.creatorId ? [access.creatorId] : [],
    adminOwned: access.role === "admin",
    storagePath: `/uploads/${file.filename}`,
    mime: file.mimetype,
    signatureVerified: mediaSignature(bytes, file.mimetype),
    bytes: bytes.length,
    digest: mediaDigest(bytes),
    legacy: false,
  });
}
export function migrateMedia(
  state: DemoState,
  records: DemoRecords,
  uploadDir: any,
) {
  const paths = new Set(
    readdirSync(uploadDir).map((name: any) => `/uploads/${name}`),
  );
  for (const post of state.posts) {
    if (post.media.startsWith("/uploads/")) paths.add(post.media);
    for (const s of post.snapshots || [])
      if (s.content.media.startsWith("/uploads/")) paths.add(s.content.media);
  }
  for (const path of paths) {
    if (
      !/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp|mp4|mov)$/.test(path) ||
      records.byMediaPath(path)
    )
      continue;
    const posts = state.posts.filter(
      (p: any) =>
        p.media === path ||
        p.snapshots.some((s: any) => s.content.media === path),
    );
    const file = join(uploadDir, basename(path)),
      bytes = existsSync(file) ? readFileSync(file) : null,
      mime = mimeFor(path);
    const ownerCreatorIds = [...new Set(posts.map((p: any) => p.creatorId))];
    const media = records.append("media", {
      id: randomUUID(),
      campaignId: posts.length === 1 ? posts[0].projectId : "unassigned",
      mode: "simulated",
      effectiveAt: new Date().toISOString(),
      storagePath: path,
      mime,
      bytes: bytes?.length || 0,
      digest: bytes ? mediaDigest(bytes) : null,
      signatureVerified: bytes ? mediaSignature(bytes, mime) : false,
      ownerCreatorIds,
      adminOwned: !posts.length,
      legacy: true,
      reviewRequired: ownerCreatorIds.length !== 1,
      unavailable: !bytes,
    });
    for (const post of posts)
      for (const snapshot of post.snapshots.filter(
        (s: any) => s.content.media === path,
      )) {
        records.append("media_associations", {
          id: `${media.id}:${snapshot.id}`,
          campaignId: post.projectId,
          mode: "simulated",
          effectiveAt: snapshot.at,
          mediaId: media.id,
          postId: post.id,
          snapshotId: snapshot.id,
        });
      }
  }
}
export function mediaByReference(records: DemoRecords, path: any) {
  if (typeof path !== "string") return null;
  if (path.startsWith("/api/media/"))
    return records.get("media", path.slice(11));
  return records.byMediaPath(path);
}
export function mayRetrieveMedia(
  state: DemoState,
  records: DemoRecords,
  media: any,
  access: any,
) {
  if (access.role === "admin") return true;
  const review = records.get("media_reviews", media.id);
  if (media.reviewRequired && !review) return false;
  if (
    access.role === "creator" &&
    (review ? [review.ownerCreatorId] : media.ownerCreatorIds).includes(
      access.creatorId,
    )
  )
    return true;
  if (
    access.role === "creator" &&
    state.projects.some(
      (p: any) =>
        canViewProject(p, access) &&
        records.get("media_associations", `share:${media.id}:${p.id}`),
    )
  )
    return true;
  return state.posts.some(
    (post: any) =>
      canViewProject(getProject(state, post.projectId), access) &&
      access.role !== "creator" &&
      post.snapshots.some(
        (s: any) => mediaByReference(records, s.content.media)?.id === media.id,
      ),
  );
}
export function verifyMediaReference(
  state: DemoState,
  records: DemoRecords,
  uploadDir: any,
  body: any,
  access: any,
  campaignId: any,
) {
  const path = body.media;
  const sample = /^\/images\/(forest|food|education|seedling)\.jpg$/.test(path);
  const media = sample ? null : mediaByReference(records, path);
  if (!sample && !media)
    throw new AppError("Upload a media file or choose a sample image.");
  const review = media ? records.get("media_reviews", media.id) : null;
  if (
    !sample &&
    (!media ||
      (media.reviewRequired && !review && access.role !== "admin") ||
      !(
        access.role === "admin" ||
        (access.role === "creator" &&
          (review ? [review.ownerCreatorId] : media.ownerCreatorIds).includes(
            access.creatorId,
          )) ||
        records.get("media_associations", `share:${media.id}:${campaignId}`)
      ))
  )
    throw new AppError(
      "Upload owned media or select explicitly campaign-shared media.",
      403,
    );
  if (media?.unavailable || (media && !media.signatureVerified))
    throw new AppError("Media unavailable or awaiting Admin review.", 409);
  const inferred = (media?.mime || "image/jpeg").startsWith("video/")
    ? "video"
    : "image";
  if (body.mediaType !== inferred)
    throw new AppError("The media type does not match the selected file.");
  const bytes = sample
    ? readFileSync(new URL(`../public${path}`, import.meta.url))
    : readFileSync(join(uploadDir, basename(media.storagePath)));
  return {
    verified: true,
    bytes: bytes.length,
    digest: mediaDigest(bytes),
    mediaId: media?.id || null,
    source: sample ? "approved-sample" : "signature-verified-upload",
  };
}
export function mediaRoutes(
  app: any,
  store: DemoStore,
  uploadDir: any,
  requireRole: any,
) {
  const retrieve = (req: any, res: any) => {
    const state = refreshEligibility(store.read());
    const media = req.params.id
      ? store.records.get("media", req.params.id)
      : store.records.byMediaPath(`/uploads/${req.params.filename}`);
    if (!media) throw new AppError("Media unavailable.", 404);
    if (req.params.id && req.query.postId && req.query.snapshotId) {
      if (media.reviewRequired && !store.records.get("media_reviews", media.id))
        throw new AppError("Public snapshot unavailable.", 404);
      const post = state.posts.find((p: any) => p.id === req.query.postId);
      const project = post ? getProject(state, post.projectId) : null;
      const snapshot = post?.snapshots.find(
        (s: any) => s.id === req.query.snapshotId,
      );
      if (
        !post ||
        project.status !== "active" ||
        snapshot?.id !== post.snapshotId ||
        !currentEligibility(post, project) ||
        mediaByReference(store.records, snapshot.content.media)?.id !== media.id
      )
        throw new AppError("Public snapshot unavailable.", 404);
    } else if (
      !mayRetrieveMedia(state, store.records, media, readAccess(req, state))
    )
      throw new AppError("Media unavailable.", 404);
    const path = join(uploadDir, basename(media.storagePath));
    if (!existsSync(path)) throw new AppError("Media unavailable.", 404);
    res
      .set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Type": media.mime,
      })
      .sendFile(path);
  };
  app.get("/api/media/:id", retrieve);
  app.get("/uploads/:filename", retrieve);
  app.post(
    "/api/media/:id/ownership-review",
    requireRole("admin"),
    (req: any, res: any) =>
      res.status(201).json(
        store.update((s: any, r: any) => {
          const media = r.get("media", req.params.id);
          if (
            !media ||
            !s.creators.some((c: any) => c.id === req.body.ownerCreatorId)
          )
            throw new AppError("Media and creator are required.");
          if (
            typeof req.body.evidence !== "string" ||
            !req.body.evidence.trim() ||
            req.body.evidence.length > 2000
          )
            throw new AppError("Ownership evidence is required.");
          if (r.get("media_reviews", media.id))
            throw new AppError("Ownership review is already recorded.", 409);
          return r.append("media_reviews", {
            id: media.id,
            campaignId: media.campaignId,
            mode: "simulated",
            effectiveAt: new Date().toISOString(),
            ownerCreatorId: req.body.ownerCreatorId,
            evidence: req.body.evidence.trim(),
            actorId: "admin",
          });
        }),
      ),
  );
  app.post("/api/media/:id/share", requireRole("admin"), (req: any, res: any) =>
    res.status(201).json(
      store.update((s: any, r: any) => {
        readAccess(req, s);
        const media = r.get("media", req.params.id);
        const campaign = getProject(s, req.body.campaignId);
        if (!media) throw new AppError("Media unavailable.", 404);
        const id = `share:${media.id}:${campaign.id}`;
        return (
          r.get("media_associations", id) ||
          r.append("media_associations", {
            id,
            campaignId: campaign.id,
            mode: "simulated",
            effectiveAt: new Date().toISOString(),
            mediaId: media.id,
            shared: true,
            actorId: "admin",
          })
        );
      }),
    ),
  );
}
