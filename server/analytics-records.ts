export const analyticsTables = [
  "grading_configs",
  "metric_evidence",
  "grade_snapshots",
  "exposure_policies",
  "exposure_runs",
  "exposure_assignments",
  "exposure_events",
];
export function migrateAnalyticsRecords(db: any) {
  for (const table of analyticsTables) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable performance fact'); END;
      CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable performance fact'); END;
      CREATE INDEX IF NOT EXISTS ${table}_subject ON ${table}(campaign_id,mode,json_extract(document,'$.subjectId'),id);`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS grading_window ON grading_configs(campaign_id,mode,json_extract(document,'$.windowKey'));
    CREATE UNIQUE INDEX IF NOT EXISTS metric_correction ON metric_evidence(json_extract(document,'$.supersedesId')) WHERE json_extract(document,'$.supersedesId') IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS grade_correction ON grade_snapshots(json_extract(document,'$.supersedesId')) WHERE json_extract(document,'$.supersedesId') IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS exposure_snapshot ON exposure_assignments(campaign_id,mode,json_extract(document,'$.policyId'),json_extract(document,'$.snapshotId'));
    INSERT OR IGNORE INTO schema_migrations(version) VALUES(4);`);
}
export function analyticsRepository(db: any) {
  return {
    analyticsSubject(
      table: any,
      campaignId: any,
      subjectId: any,
      after: any = "",
    ) {
      if (!analyticsTables.includes(table))
        throw new Error("Invalid analytics table");
      return db
        .prepare(
          `SELECT document FROM ${table} WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.subjectId')=? AND id>? ORDER BY id LIMIT 100`,
        )
        .all(campaignId, subjectId, after)
        .map((r: any) => JSON.parse(r.document));
    },
    lastExposureRun(campaignId: any, policyId: any) {
      const row = db
        .prepare(
          `SELECT document FROM exposure_runs WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.subjectId')=? ORDER BY rowid DESC LIMIT 1`,
        )
        .get(campaignId, policyId);
      return row ? JSON.parse(row.document) : null;
    },
    analyticsQueryPlans() {
      return Object.fromEntries(
        analyticsTables.map((table: any) => [
          table,
          db
            .prepare(
              `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.subjectId')=? AND id>? ORDER BY id LIMIT 100`,
            )
            .all("campaign", "subject", ""),
        ]),
      );
    },
  };
}
