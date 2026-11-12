import { AppError } from "./domain.ts";

export const operationFields = [
  "reservedMediaCents",
  "spentMediaCents",
  "creatorMediaCostCents",
  "overrunCents",
  "reservedGuaranteeCents",
  "usedGuaranteeCents",
  "reservedAppUseCents",
  "usedAppUseCents",
  "reservedBaseCents",
  "paidBaseCents",
  "reservedTopUpCents",
  "paidTopUpCents",
  "recoveryRecordedCents",
];
export function migrateSettlementRecords(db: any) {
  for (const table of [
    "finance_operations",
    "settlement_periods",
    "settlement_results",
    "reservations",
    "settlement_manifests",
  ]) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable financial fact'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable financial fact'); END;`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS finance_operation_subject ON finance_operations(campaign_id,mode,json_extract(document,'$.reservationId'),effective_at,id);
    CREATE INDEX IF NOT EXISTS finance_operation_creator ON finance_operations(campaign_id,mode,json_extract(document,'$.creatorId'),effective_at,id);
    CREATE INDEX IF NOT EXISTS reservation_subject ON reservations(campaign_id,mode,json_extract(document,'$.distributionId'),effective_at,id);
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_period_key ON settlement_periods(campaign_id,mode,json_extract(document,'$.startsAt'));
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_manifest_key ON settlement_manifests(campaign_id,mode,json_extract(document,'$.idempotencyKey'));
    DROP TRIGGER IF EXISTS source_subject_reference;
    CREATE TRIGGER source_subject_reference BEFORE INSERT ON source_events WHEN
      NOT ((json_extract(NEW.document,'$.sourceKind') IS 'finance_operation' AND EXISTS(SELECT 1 FROM finance_operations WHERE id=json_extract(NEW.document,'$.contributionId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode AND json_extract(document,'$.sourceRecordId')=NEW.id))
      OR (json_extract(NEW.document,'$.sourceKind') IS NULL AND EXISTS(SELECT 1 FROM contributions WHERE id=json_extract(NEW.document,'$.contributionId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode)))
      BEGIN SELECT RAISE(ABORT,'Financial subject required'); END;
    INSERT OR IGNORE INTO schema_migrations(version) VALUES(3);`);
}
export function settlementRepository(db: any) {
  const decode = (row: any) => (row ? JSON.parse(row.document) : null);
  return {
    settlementQueryPlans() {
      return {
        reservations: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM reservations WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.distributionId')=? ORDER BY effective_at,id LIMIT 100",
          )
          .all("campaign", "distribution"),
        commitments: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT SUM(json_extract(document,'$.reservedMediaCents')) FROM finance_operations WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.reservationId')=?",
          )
          .all("campaign", "reservation"),
        creator: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM finance_operations WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.creatorId')=? ORDER BY effective_at,id LIMIT 100",
          )
          .all("campaign", "creator"),
        manifests: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM settlement_manifests WHERE campaign_id=? AND mode=? AND (effective_at,id)>(?,?) ORDER BY effective_at,id LIMIT 100",
          )
          .all("campaign", "simulated", "", ""),
      };
    },
    creatorMediaReserved(
      campaignId: any,
      distributionId: any,
      day: any,
      reservationId: any,
    ) {
      const args = [campaignId],
        clauses = ["campaign_id=?", "mode='simulated'"];
      for (const [field, value] of Object.entries({
        distributionId,
        day,
        reservationId,
      }))
        if (value) {
          clauses.push(`json_extract(document,'$.${field}')=?`);
          args.push(value);
        }
      return db
        .prepare(
          `SELECT COALESCE(SUM(json_extract(document,'$.creatorReservedCents')),0) AS n FROM finance_operations WHERE ${clauses.join(" AND ")}`,
        )
        .get(...args).n;
    },
    operationTotals(campaignId: any, filter: any = {}) {
      const args = [campaignId],
        clauses = ["campaign_id=?", "mode='simulated'"];
      for (const key of [
        "reservationId",
        "distributionId",
        "creatorId",
        "termsId",
        "batchId",
        "day",
      ]) {
        if (filter[key] !== undefined) {
          clauses.push(`json_extract(document,'$.${key}')=?`);
          args.push(filter[key]);
        }
      }
      if (filter.cutoff) {
        clauses.push("json_extract(document,'$.recordedAt')<=?");
        args.push(filter.cutoff);
      }
      const totals = db
        .prepare(
          `SELECT ${operationFields.map((f: any) => `COALESCE(SUM(json_extract(document,'$.${f}')),0) AS ${f}`).join(",")} FROM finance_operations WHERE ${clauses.join(" AND ")}`,
        )
        .get(...args);
      for (const n of Object.values(totals))
        if (!Number.isSafeInteger(n))
          throw new AppError("Financial report exceeds safe integer bounds.");
      return totals;
    },
    subjectPage(
      table: any,
      campaignId: any,
      field: any,
      value: any,
      cursor: any = "",
    ) {
      if (
        ![
          "reservations",
          "finance_operations",
          "settlement_manifests",
          "settlement_results",
        ].includes(table) ||
        !["distributionId", "termsId", "batchId", "creatorId", "kind"].includes(
          field,
        )
      )
        throw new Error("Invalid financial subject query");
      return db
        .prepare(
          `SELECT document FROM ${table} WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.${field}')=? AND id>? ORDER BY id LIMIT 100`,
        )
        .all(campaignId, value, cursor)
        .map(decode);
    },
    pendingCount(campaignId: any) {
      return db
        .prepare(
          "SELECT COUNT(*) AS n FROM finance_pending WHERE campaign_id=? AND mode='simulated'",
        )
        .get(campaignId).n;
    },
    periodAt(campaignId: any, at: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM settlement_periods WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.startsAt')<=? AND json_extract(document,'$.endsAt')>? LIMIT 1",
          )
          .get(campaignId, at, at),
      );
    },
    hasFinanceConflict(contributionId: any, cutoff: any) {
      return !!db
        .prepare(
          "SELECT id FROM source_conflicts WHERE (json_extract(document,'$.contributionId')=? OR json_extract(document,'$.originalContributionId')=?) AND effective_at<=? LIMIT 1",
        )
        .get(contributionId, contributionId, cutoff);
    },
  };
}
