import { readAccess, requireProject } from "./access.ts";
import type { DemoStore } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import { economicsReport } from "./economics.ts";
import {
  finishTrial,
  publishExposurePolicy,
  scheduleExposure,
} from "./exposure-queue.ts";
import {
  gradeBoard,
  publishGrade,
  publishGradingConfig,
  recordMetricEvidence,
  rejectGradeObligation,
} from "./grading.ts";

export function analyticsRoutes(app: any, store: DemoStore, requireRole: any) {
  const mutate = (req: any, fn: any) =>
    store.update((s: any, r: any) => fn(s, r, readAccess(req, s)));
  for (const [path, operation] of [
    ["grading-configs", publishGradingConfig],
    ["metric-evidence", recordMetricEvidence],
    ["grades", publishGrade],
    ["exposure-policies", publishExposurePolicy],
  ] as [string, (...args: any[]) => any][]) {
    app.post(`/api/campaigns/:id/${path}`, (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any, a: any) =>
            operation(s, r, req.params.id, req.body, a),
          ),
        ),
    );
  }
  app.get("/api/campaigns/:id/economics", (req: any, res: any) => {
    const s = store.read();
    res.json(
      economicsReport(
        s,
        store.records,
        req.params.id,
        req.query.evidenceId,
        readAccess(req, s),
      ),
    );
  });
  app.get("/api/grading-configs/:id/board", (req: any, res: any) => {
    const s = store.read();
    res.json(gradeBoard(s, store.records, req.params.id, readAccess(req, s)));
  });
  app.post("/api/exposure-policies/:id/schedule", (req: any, res: any) =>
    res.json(
      mutate(req, (s: any, r: any, a: any) =>
        scheduleExposure(s, r, req.params.id, req.body, a),
      ),
    ),
  );
  app.post("/api/exposure-assignments/:id/complete", (req: any, res: any) =>
    res.json(
      mutate(req, (s: any, r: any, a: any) =>
        finishTrial(s, r, req.params.id, req.body, a),
      ),
    ),
  );
  app.post(
    "/api/campaigns/:id/grade-obligations",
    requireRole("admin"),
    (req: any) => {
      requireProject(
        store.read(),
        req.params.id,
        readAccess(req, store.read()),
        true,
      );
      rejectGradeObligation();
    },
  );
  app.get(
    "/api/campaigns/:id/performance-records/:kind",
    (req: any, res: any) => {
      const s = store.read();
      requireProject(s, req.params.id, readAccess(req, s), true);
      const table = (
        {
          configs: "grading_configs",
          evidence: "metric_evidence",
          grades: "grade_snapshots",
          policies: "exposure_policies",
          runs: "exposure_runs",
          assignments: "exposure_assignments",
          events: "exposure_events",
        } as Record<string, any>
      )[req.params.kind];
      if (!table)
        throw new AppError("Performance record kind unavailable.", 404);
      res.json(
        store.records.page(table, {
          campaignId: req.params.id,
          limit: req.query.limit,
          cursor: req.query.cursor,
        }),
      );
    },
  );
}
