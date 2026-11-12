import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z, ZodError } from "zod";
import {
  ensureIdentity,
  readAccess,
  requirePost,
  requireProject,
  scopedWorkspace,
} from "./access.ts";
import { analyticsRoutes } from "./analytics-routes.ts";
import {
  appealCreative,
  holdCreative,
  resolveAppeal,
} from "./creative-exceptions.ts";
import { showcaseRoutes } from "./demo-showcase.ts";
import type { DemoRecords, DemoState, DemoStore } from "./demo-types.ts";
import {
  addActivity,
  addSubmission,
  AppError,
  getProject,
  normalizeInstagram,
  projectSchema,
  readiness,
  reviewPost,
  revisePost,
} from "./domain.ts";
import { configurePolicy, refreshEligibility } from "./eligibility.ts";
import { financeRoutes } from "./finance-routes.ts";
import { marketplaceRoutes } from "./marketplace-routes.ts";
import {
  assignOrganizations,
  enforceFixedRate,
  migrateOrganizations,
  transitionDistribution,
} from "./marketplace.ts";
import {
  mediaRoutes,
  mediaSignature,
  migrateMedia,
  registerMedia,
  verifyMediaReference,
} from "./private-media.ts";

export function createApp(store: DemoStore, dataDir: any) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (req: any, res: any, next: any) => {
    res.set("Cache-Control", "no-store");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && origin !== `${req.protocol}://${req.get("host")}`)
        return res
          .status(403)
          .json({ error: "Cross-origin writes are not allowed." });
    }
    next();
  });
  const requireRole =
    (...roles: any[]) =>
    (req: any, res: any, next: any) =>
      roles.includes(req.get("x-demo-role"))
        ? next()
        : res.status(403).json({
            error: "This action is not available in the selected demo view.",
          });
  app.get("/api/health", (_req: any, res: any) => res.json({ ok: true }));
  showcaseRoutes(app, store, dataDir, requireRole);
  app.get("/api/demo-options", (_req: any, res: any) => {
    const { nonprofits, creators, organizations } = store.read();
    res.json({ nonprofits, creators, organizations });
  });
  app.post(
    "/api/demo-creators",
    requireRole("creator"),
    (req: any, res: any) => {
      const name = z.string().trim().min(1).max(80).parse(req.body.name);
      res
        .status(201)
        .json(
          store.update((state: DemoState) =>
            ensureIdentity(state, "creators", name),
          ),
        );
    },
  );
  app.get("/api/workspace", (req: any, res: any) => {
    const state = store.update(refreshEligibility);
    res.json(scopedWorkspace(state, readAccess(req, state), store.records));
  });
  app.post("/api/projects", requireRole("admin"), (req: any, res: any) => {
    enforceFixedRate(req.body);
    const data = projectSchema.parse(req.body);
    data.instagram = normalizeInstagram(data.instagram);
    const project = store.update((state: DemoState) => {
      const nonprofit = ensureIdentity(state, "nonprofits", data.nonprofit);
      const project = {
        ...data,
        nonprofit: nonprofit.name,
        nonprofitId: nonprofit.id,
        id: randomUUID(),
        color: {
          forest: "green",
          seedling: "green",
          food: "orange",
          education: "purple",
        }[data.cover],
        createdAt: new Date().toISOString(),
      };
      migrateOrganizations(state);
      assignOrganizations(state, project, req.body);
      state.projects.unshift(project);
      configurePolicy(project, data.policyConfig);
      addActivity(
        state,
        "project",
        `Created “${project.name}”`,
        project.nonprofit,
        project.id,
      );
      return project;
    });
    res.status(201).json(project);
  });
  app.put(
    "/api/projects/:id",
    requireRole("admin", "owner", "nonprofit"),
    (req: any, res: any) => {
      enforceFixedRate(req.body);
      const data = projectSchema.parse(req.body);
      data.instagram = normalizeInstagram(data.instagram);
      res.json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          const project = requireProject(state, req.params.id, access, true);
          if (
            ["nonprofit", "owner"].includes(access.role) &&
            data.nonprofit !== project.nonprofit
          )
            throw new AppError(
              "Only Admin can reassign a project's nonprofit.",
              403,
            );
          const nonprofit = ensureIdentity(state, "nonprofits", data.nonprofit);
          migrateOrganizations(state);
          if (
            access.role !== "admin" &&
            ((req.body.ownerOrganizationId &&
              req.body.ownerOrganizationId !== project.ownerOrganizationId) ||
              (req.body.beneficiaryOrganizationId &&
                req.body.beneficiaryOrganizationId !==
                  project.beneficiaryOrganizationId) ||
              (req.body.sponsorOrganizationIds &&
                JSON.stringify(req.body.sponsorOrganizationIds) !==
                  JSON.stringify(project.sponsorOrganizationIds)))
          )
            throw new AppError(
              "Only Admin can reassign campaign organizations.",
              403,
            );
          assignOrganizations(state, project, {
            ...req.body,
            beneficiaryOrganizationId:
              req.body.beneficiaryOrganizationId || nonprofit.id,
          });
          const changedAccount = project.instagram !== data.instagram;
          Object.assign(project, data, {
            nonprofit: nonprofit.name,
            nonprofitId: nonprofit.id,
          });
          const previousPolicy = project.eligibilityPolicy?.version;
          configurePolicy(project, data.policyConfig);
          if (previousPolicy !== project.eligibilityPolicy.version)
            addActivity(
              state,
              "policy",
              `Policy updated for “${project.name}”`,
              `Eligibility policy version ${project.eligibilityPolicy.version}`,
              project.id,
            );
          refreshEligibility(state);
          addActivity(
            state,
            changedAccount ? "instagram" : "project",
            changedAccount
              ? data.instagram
                ? `Paired @${data.instagram} with “${project.name}”`
                : `Removed the account from “${project.name}”`
              : `Updated “${project.name}”`,
            changedAccount
              ? "Project pairing saved. Live Instagram authorization is still required."
              : "Project settings saved.",
            project.id,
          );
          return project;
        }),
      );
    },
  );
  const uploadDir = join(dataDir, "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const types: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  store.update((state: DemoState, records: DemoRecords) =>
    migrateMedia(state, records, uploadDir),
  );
  mediaRoutes(app, store, uploadDir, requireRole);
  marketplaceRoutes(app, store, requireRole);
  financeRoutes(app, store, requireRole);
  analyticsRoutes(app, store, requireRole);
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req: any, file: any, cb: any) =>
        cb(null, randomUUID() + (types[file.mimetype] || "")),
    }),
    limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    fileFilter: (_req: any, file: any, cb: any) =>
      types[file.mimetype]
        ? cb(null, true)
        : cb(new AppError("Use a JPG, PNG, WebP, MP4, or MOV file.")),
  });
  app.post(
    "/api/uploads",
    requireRole("admin", "creator"),
    (req: any, _res: any, next: any) => {
      readAccess(req, store.read());
      next();
    },
    upload.single("media"),
    (req: any, res: any) => {
      if (!req.file) throw new AppError("Choose a photo or video to upload.");
      if (!mediaSignature(readFileSync(req.file.path), req.file.mimetype)) {
        unlinkSync(req.file.path);
        throw new AppError(
          "This file does not match its image or video type. Choose a valid media file.",
        );
      }
      const media = store.update((state: DemoState, records: DemoRecords) =>
        registerMedia(records, req.file, readAccess(req, state)),
      );
      res.status(201).json({
        media: `/api/media/${media.id}`,
        mediaType: req.file.mimetype.startsWith("video/") ? "video" : "image",
      });
    },
  );
  app.post(
    "/api/projects/:id/posts",
    requireRole("admin", "creator"),
    (req: any, res: any) => {
      res.status(201).json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          requireProject(state, req.params.id, access);
          const creator =
            access.role === "creator"
              ? state.creators.find((c: any) => c.id === access.creatorId)
              : ensureIdentity(
                  state,
                  "creators",
                  z.string().trim().min(1).max(80).parse(req.body.creator),
                );
          const mediaEvidence = verifyMediaReference(
            state,
            store.records,
            uploadDir,
            req.body,
            access,
            req.params.id,
          );
          const post = addSubmission(
            state,
            req.params.id,
            {
              ...req.body,
              creator: creator.name,
              creatorId: creator.id,
            },
            mediaEvidence,
          );
          post.creatorId = creator.id;
          return post;
        }),
      );
    },
  );
  app.post(
    "/api/posts/:id/review",
    requireRole("admin", "owner", "nonprofit"),
    (req: any, res: any) =>
      res.json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          requirePost(state, req.params.id, access, "review");
          return reviewPost(
            state,
            req.params.id,
            req.body,
            access.role === "nonprofit"
              ? state.nonprofits.find((n: any) => n.id === access.nonprofitId)
                  .name
              : "Demo administrator",
          );
        }),
      ),
  );
  app.post("/api/posts/:id/holds", requireRole("admin"), (req: any, res: any) =>
    res.status(201).json(
      store.update((state: DemoState) => {
        readAccess(req, state);
        return holdCreative(state, req.params.id, req.body);
      }),
    ),
  );
  app.post(
    "/api/posts/:id/appeals",
    requireRole("creator", "admin"),
    (req: any, res: any) =>
      res.status(201).json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          const post = requirePost(state, req.params.id, access, "edit");
          return appealCreative(
            state,
            post.id,
            req.body,
            access.creatorId || "Demo administrator",
          );
        }),
      ),
  );
  app.post(
    "/api/appeals/:id/resolve",
    requireRole("admin"),
    (req: any, res: any) =>
      res.json(
        store.update((state: DemoState) =>
          resolveAppeal(state, req.params.id, req.body),
        ),
      ),
  );
  app.post(
    "/api/posts/:id/evaluate",
    requireRole("admin"),
    (req: any, res: any) =>
      res.json(
        store.update((state: DemoState) => {
          const post = requirePost(
            state,
            req.params.id,
            readAccess(req, state),
            "edit",
          );
          if (req.body.snapshotId !== post.snapshotId)
            throw new AppError(
              "Stale evaluation snapshot. Reopen the current creative.",
              409,
            );
          refreshEligibility(state);
          return post.eligibility;
        }),
      ),
  );
  app.post(
    "/api/posts/:id/withdraw",
    requireRole("creator", "admin"),
    (req: any, res: any) =>
      res.json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          const post = requirePost(state, req.params.id, access, "edit");
          if (req.body.revision !== post.revision)
            throw new AppError("This creative changed. Reopen it.", 409);
          post.withdrawnAt ||= new Date().toISOString();
          post.withdrawals ||= [];
          if (
            !post.withdrawals.some((w: any) => w.snapshotId === post.snapshotId)
          )
            post.withdrawals.push({
              snapshotId: post.snapshotId,
              at: post.withdrawnAt,
              actor: access.creatorId || "Demo administrator",
            });
          addActivity(
            state,
            "withdrawn",
            `Withdrawn “${post.title}”`,
            "New use stopped; prior snapshots and exports retained.",
            post.projectId,
          );
          refreshEligibility(state);
          return post;
        }),
      ),
  );
  app.put(
    "/api/posts/:id",
    requireRole("admin", "creator"),
    (req: any, res: any) => {
      res.json(
        store.update((state: DemoState) => {
          const access = readAccess(req, state);
          const post = requirePost(state, req.params.id, access, "edit");
          const mediaEvidence = verifyMediaReference(
            state,
            store.records,
            uploadDir,
            req.body,
            access,
            post.projectId,
          );
          return revisePost(
            state,
            req.params.id,
            {
              ...req.body,
              creator: post.creator,
            },
            mediaEvidence,
          );
        }),
      );
    },
  );
  app.get("/api/posts/:id/export", (req: any, res: any) => {
    const manifest = store.update((state: DemoState, records: DemoRecords) => {
      const post = requirePost(
        state,
        req.params.id,
        readAccess(req, state),
        "export",
      );
      refreshEligibility(state);
      const project = getProject(state, post.projectId);
      const gate = readiness(post, project);
      if (!gate.ready) throw new AppError(gate.reasons.join(". "), 409);
      let distribution: any = null;
      if (project.offerVersionId) {
        distribution =
          typeof req.query.distributionId === "string"
            ? records.get("distributions", req.query.distributionId)
            : null;
        if (
          !distribution ||
          distribution.postId !== post.id ||
          distribution.campaignId !== project.id
        )
          throw new AppError("MATCHING_MARKETPLACE_DISTRIBUTION_REQUIRED", 409);
        transitionDistribution(
          state,
          records,
          distribution.id,
          "exported",
          readAccess(req, state),
        );
      }
      const record = {
        id: randomUUID(),
        postId: post.id,
        projectId: post.projectId,
        exportedAt: new Date().toISOString(),
        project: project.name,
        nonprofit: project.nonprofit,
        instagram: `@${project.instagram}`,
        title: post.title,
        creator: post.creator,
        caption: post.caption,
        format: post.format,
        media: post.media,
        revision: post.revision,
        distributionId: distribution?.id || null,
        termsId: distribution?.termsId || null,
        snapshot: structuredClone(
          post.snapshots.find((s: any) => s.id === post.snapshotId),
        ),
        evaluation: structuredClone(post.eligibility),
        approvalHistory: structuredClone(post.history),
        note: "Eligible handoff package. This post has not been published to Instagram. Rights are declarations; structured disclosures do not prove rendering or semantic compliance. Live authorization pending.",
      };
      state.exports.push(record);
      return record;
    });
    res
      .set(
        "Content-Disposition",
        `attachment; filename="slander-${manifest.postId}.json"`,
      )
      .json(manifest);
  });
  app.use("/api", (_req: any, res: any) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use((error: any, _req: any, res: any, _next: any) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: error.issues
          .map((i: any) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      });
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Files must be 30 MB or smaller."
            : "Upload failed. Choose one media file.",
      });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
      error:
        status >= 500
          ? "Something went wrong. Please try again."
          : error.message,
    });
  });
  return app;
}
