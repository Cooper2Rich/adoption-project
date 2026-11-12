import { readAccess, requireProject } from "./access.ts";
import type { DemoStore } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import {
  cancelMedia,
  mediaBalance,
  reserveMedia,
  spendMedia,
} from "./media-budgets.ts";
import { chargeAppUse, seedCapacity } from "./seed-commitments.ts";
import {
  approveBatch,
  definePeriod,
  executeBatch,
  exportBatch,
  previewSettlement,
} from "./settlements.ts";

export function settlementRoutes(app: any, store: DemoStore, requireRole: any) {
  const mutate = (req: any, fn: any) =>
    store.update((s: any, r: any) => fn(s, r, readAccess(req, s)));
  app.post("/api/distributions/:id/reservations", (req: any, res: any) =>
    res
      .status(201)
      .json(
        mutate(req, (s: any, r: any, a: any) =>
          reserveMedia(s, r, req.params.id, req.body, a),
        ),
      ),
  );
  app.post(
    "/api/reservations/:id/spend",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any, a: any) =>
            spendMedia(s, r, req.params.id, req.body, a),
          ),
        ),
  );
  app.post("/api/reservations/:id/cancel", (req: any, res: any) =>
    res.json(
      mutate(req, (s: any, r: any, a: any) =>
        cancelMedia(s, r, req.params.id, a),
      ),
    ),
  );
  app.get("/api/campaigns/:id/budgets", (req: any, res: any) => {
    const s = store.read(),
      a = readAccess(req, s);
    requireProject(s, req.params.id, a, true);
    res.json({
      campaignId: req.params.id,
      mode: "simulated",
      currency: "USD",
      media: mediaBalance(store.records, req.params.id),
      seed: seedCapacity(store.records, req.params.id),
    });
  });
  app.post(
    "/api/campaigns/:id/app-use/charge",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any, a: any) =>
            chargeAppUse(s, r, req.params.id, req.body, a),
          ),
        ),
  );
  app.post(
    "/api/campaigns/:id/settlement-periods",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any, a: any) =>
            definePeriod(s, r, req.params.id, req.body, a),
          ),
        ),
  );
  app.get("/api/campaigns/:id/settlement-preview", (req: any, res: any) =>
    res.json(
      previewSettlement(
        store.read(),
        store.records,
        req.params.id,
        req.query.periodId,
        req.query.creatorId,
        readAccess(req, store.read()),
      ),
    ),
  );
  app.post(
    "/api/campaigns/:id/settlements",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any, a: any) =>
            approveBatch(s, r, req.params.id, req.body, a),
          ),
        ),
  );
  app.get(
    "/api/settlements/:id/export",
    requireRole("admin"),
    (req: any, res: any) => {
      const result = exportBatch(
        store.read(),
        store.records,
        req.params.id,
        readAccess(req, store.read()),
        req.query.format || "json",
      );
      res
        .set("X-Settlement-Batch", result.batchId)
        .type(result.format === "csv" ? "text/csv" : "application/json")
        .send(result.content);
    },
  );
  app.post(
    "/api/settlements/:id/execute",
    requireRole("admin"),
    (req: any, res: any) =>
      res.json(
        mutate(req, (s: any, r: any, a: any) =>
          executeBatch(s, r, req.params.id, req.body, a),
        ),
      ),
  );
  app.get(
    "/api/campaigns/:id/settlement-records/:kind",
    (req: any, res: any) => {
      const s = store.read(),
        a = readAccess(req, s);
      requireProject(s, req.params.id, a, true);
      const table = (
        {
          periods: "settlement_periods",
          batches: "settlement_manifests",
          results: "settlement_results",
          reservations: "reservations",
          operations: "finance_operations",
        } as Record<string, any>
      )[req.params.kind];
      if (!table)
        throw new AppError("Settlement record kind unavailable.", 404);
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
