import { z } from "zod";
import { readAccess, requireProject } from "./access.ts";
import type { DemoStore } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import {
  adjudicateContribution,
  createContribution,
  ingestEvent,
  publicFinance,
  reconcile,
} from "./finance.ts";
import { settlementRoutes } from "./settlement-routes.ts";

export function financeRoutes(app: any, store: DemoStore, requireRole: any) {
  settlementRoutes(app, store, requireRole);
  const mutate = (req: any, fn: any) =>
    store.update((s: any, r: any) => fn(s, r, readAccess(req, s)));
  app.post(
    "/api/contributions/:id/attribution-adjudications",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(
          mutate(req, (s: any, r: any) =>
            adjudicateContribution(s, r, req.params.id, req.body),
          ),
        ),
  );
  app.post(
    "/api/campaigns/:id/contributions",
    requireRole("admin"),
    (req: any, res: any) =>
      res.status(201).json(
        mutate(req, (s: any, r: any, a: any) => {
          requireProject(s, req.params.id, a, true);
          return createContribution(s, r, req.params.id, req.body);
        }),
      ),
  );
  app.post(
    "/api/admin/finance-events",
    requireRole("admin"),
    (req: any, res: any) =>
      res
        .status(201)
        .json(mutate(req, (s: any, r: any) => ingestEvent(s, r, req.body))),
  );
  app.post(
    "/api/campaigns/:id/reconcile",
    requireRole("admin"),
    (req: any, res: any) =>
      res.json(
        mutate(req, (s: any, r: any, a: any) => {
          requireProject(s, req.params.id, a, true);
          const q = z
            .object({
              mode: z.literal("simulated").default("simulated"),
              limit: z.number().int().positive().max(100).default(100),
              cursor: z
                .object({ at: z.iso.datetime(), id: z.string() })
                .strict()
                .optional(),
            })
            .strict()
            .parse(req.body);
          return reconcile(s, r, { ...q, campaignId: req.params.id });
        }),
      ),
  );
  app.get("/api/giving/:id/progress", (req: any, res: any) =>
    res.json(publicFinance(store.read(), store.records, req.params.id)),
  );
  app.get("/api/campaigns/:id/finance", (req: any, res: any) => {
    const s = store.read(),
      a = readAccess(req, s);
    requireProject(s, req.params.id, a);
    const mode = z
      .enum(["simulated", "live"])
      .default("simulated")
      .parse(req.query.mode);
    const totals = store.records.financeTotals(
      req.params.id,
      mode,
      a.role === "creator" ? a.creatorId : null,
    );
    const committed = store.records.operationTotals(
      req.params.id,
      a.role === "creator" ? { creatorId: a.creatorId } : {},
    );
    res.json({
      campaignId: req.params.id,
      mode,
      currency: "USD",
      ...totals,
      settledBeforeCommitments: {
        availableCreatorCents: totals.availableCreatorCents,
        availableSeedGuaranteeCents: totals.availableSeedGuaranteeCents,
        availableSeedAppUseCents: totals.availableSeedAppUseCents,
        availableMediaCents: totals.availableMediaCents,
      },
      commitments: committed,
      availableCreatorCents: Math.max(
        0,
        totals.availableCreatorCents -
          committed.reservedBaseCents -
          committed.paidBaseCents,
      ),
      availableSeedGuaranteeCents:
        totals.availableSeedGuaranteeCents -
        committed.reservedGuaranteeCents -
        committed.usedGuaranteeCents,
      availableSeedAppUseCents:
        totals.availableSeedAppUseCents -
        committed.reservedAppUseCents -
        committed.usedAppUseCents,
      availableMediaCents:
        totals.availableMediaCents -
        committed.reservedMediaCents -
        committed.spentMediaCents,
      recoveryCents: Math.max(0, committed.paidBaseCents - totals.creatorCents),
      feeAssumption:
        mode === "simulated"
          ? "Zero processing fees; fixture assumption."
          : "Unknown fees and payer; live capability blocked.",
    });
  });
  const tables: Record<string, string> = {
    contributions: "contributions",
    events: "source_events",
    conflicts: "source_conflicts",
    journal: "journal_transactions",
    entries: "journal_entries",
    reconciliation: "reconciliation_runs",
  };
  app.get(
    "/api/campaigns/:id/finance/:kind",
    requireRole("admin"),
    (req: any, res: any) => {
      const s = store.read(),
        a = readAccess(req, s);
      requireProject(s, req.params.id, a);
      const table = tables[req.params.kind];
      if (!table) throw new AppError("Financial record kind unavailable.", 404);
      res.json(
        store.records.page(table, {
          campaignId: req.params.id,
          mode: req.query.mode,
          limit: req.query.limit,
          cursor: req.query.cursor,
        }),
      );
    },
  );
}
