import { AppError } from "./domain.ts";

export function migrateFinanceRecords(db: any) {
  db.exec(`DROP INDEX IF EXISTS journal_source_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS journal_source_record ON journal_transactions(json_extract(document,'$.sourceRecordId'));
      CREATE UNIQUE INDEX IF NOT EXISTS contribution_transaction ON contributions(mode,json_extract(document,'$.source'),json_extract(document,'$.sourceAccountId'),json_extract(document,'$.originalTransactionId'));
      CREATE UNIQUE INDEX IF NOT EXISTS contribution_intent ON contributions(json_extract(document,'$.intentId')) WHERE json_extract(document,'$.intentId') IS NOT NULL;
      CREATE INDEX IF NOT EXISTS journal_subject ON journal_transactions(campaign_id,mode,json_extract(document,'$.contributionId'),effective_at,id);
      CREATE INDEX IF NOT EXISTS journal_account ON journal_entries(campaign_id,mode,json_extract(document,'$.account'),effective_at,id);
      CREATE INDEX IF NOT EXISTS journal_transaction_entries ON journal_entries(json_extract(document,'$.transactionId'));
      CREATE UNIQUE INDEX IF NOT EXISTS source_result_unique ON source_event_results(json_extract(document,'$.sourceRecordId'));
      CREATE INDEX IF NOT EXISTS source_result_subject ON source_event_results(json_extract(document,'$.contributionId'));
      CREATE INDEX IF NOT EXISTS source_conflict_subject ON source_conflicts(json_extract(document,'$.contributionId'));
      CREATE INDEX IF NOT EXISTS source_conflict_original ON source_conflicts(json_extract(document,'$.originalContributionId'));
      CREATE TABLE IF NOT EXISTS finance_positions(id TEXT PRIMARY KEY REFERENCES contributions(id),campaign_id TEXT NOT NULL,mode TEXT NOT NULL,effective_at TEXT NOT NULL,document TEXT NOT NULL CHECK(json_valid(document)));
      CREATE INDEX IF NOT EXISTS finance_positions_page ON finance_positions(campaign_id,mode,effective_at,id);
      CREATE TABLE IF NOT EXISTS finance_pending(id TEXT PRIMARY KEY REFERENCES source_events(id),campaign_id TEXT NOT NULL,mode TEXT NOT NULL,effective_at TEXT NOT NULL,subject_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS finance_pending_page ON finance_pending(campaign_id,mode,effective_at,id);
      CREATE INDEX IF NOT EXISTS finance_pending_subject ON finance_pending(subject_id,effective_at,id);
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);`);
  for (const table of [
    "contributions",
    "gift_intents",
    "source_events",
    "source_conflicts",
    "source_event_results",
    "journal_transactions",
    "journal_entries",
    "reconciliation_runs",
  ]) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable financial fact'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable financial fact'); END;`);
  }
  for (const table of [
    "contributions",
    "journal_transactions",
    "journal_entries",
  ]) {
    db.exec(
      `CREATE TRIGGER IF NOT EXISTS ${table}_currency BEFORE INSERT ON ${table} WHEN json_extract(NEW.document,'$.currency') IS NOT 'USD' BEGIN SELECT RAISE(ABORT,'USD required'); END;`,
    );
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS contribution_amount BEFORE INSERT ON contributions WHEN
      json_type(NEW.document,'$.amountCents') IS NOT 'integer' OR json_extract(NEW.document,'$.amountCents')<=0 OR json_extract(NEW.document,'$.amountCents')>9007199254740991
      OR json_extract(NEW.document,'$.purpose') NOT IN ('public','restricted')
      BEGIN SELECT RAISE(ABORT,'Invalid contribution'); END;
      CREATE TRIGGER IF NOT EXISTS journal_entry_reference BEFORE INSERT ON journal_entries WHEN NOT EXISTS(SELECT 1 FROM journal_transactions WHERE id=json_extract(NEW.document,'$.transactionId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode) BEGIN SELECT RAISE(ABORT,'Journal transaction required'); END;
      CREATE TRIGGER IF NOT EXISTS journal_source_reference BEFORE INSERT ON journal_transactions WHEN NOT EXISTS(SELECT 1 FROM source_events WHERE id=json_extract(NEW.document,'$.sourceRecordId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode) BEGIN SELECT RAISE(ABORT,'Accepted source required'); END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS contribution_allocations BEFORE INSERT ON contributions WHEN
      (json_extract(NEW.document,'$.purpose')='restricted' AND (SELECT COALESCE(SUM(json_extract(value,'$.amountCents')),0) FROM json_each(NEW.document,'$.allocations')) != json_extract(NEW.document,'$.amountCents'))
      OR (json_extract(NEW.document,'$.purpose')='public' AND NOT EXISTS(SELECT 1 FROM gift_intents WHERE id=json_extract(NEW.document,'$.intentId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode AND json_extract(document,'$.amountCents')=json_extract(NEW.document,'$.amountCents')))
      BEGIN SELECT RAISE(ABORT,'Invalid purpose consent or allocation'); END;
      CREATE TRIGGER IF NOT EXISTS source_subject_reference BEFORE INSERT ON source_events WHEN NOT EXISTS(SELECT 1 FROM contributions WHERE id=json_extract(NEW.document,'$.contributionId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode) BEGIN SELECT RAISE(ABORT,'Contribution required'); END;
      CREATE TRIGGER IF NOT EXISTS journal_entry_amount BEFORE INSERT ON journal_entries WHEN json_type(NEW.document,'$.debitCents') IS NOT 'integer' OR json_type(NEW.document,'$.creditCents') IS NOT 'integer' OR json_extract(NEW.document,'$.debitCents')<0 OR json_extract(NEW.document,'$.creditCents')<0 OR json_extract(NEW.document,'$.debitCents')>9007199254740991 OR json_extract(NEW.document,'$.creditCents')>9007199254740991 OR (json_extract(NEW.document,'$.debitCents')>0)=(json_extract(NEW.document,'$.creditCents')>0) OR json_extract(NEW.document,'$.purpose') NOT IN ('public','restricted','seed','media') BEGIN SELECT RAISE(ABORT,'Invalid journal amount/purpose'); END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS journal_entry_closed BEFORE INSERT ON journal_entries WHEN EXISTS(SELECT 1 FROM source_event_results WHERE json_extract(document,'$.sourceRecordId')=json_extract(NEW.document,'$.sourceRecordId')) BEGIN SELECT RAISE(ABORT,'Immutable journal transaction is closed'); END;
    CREATE TRIGGER IF NOT EXISTS source_result_reference BEFORE INSERT ON source_event_results WHEN NOT EXISTS(SELECT 1 FROM source_events WHERE id=json_extract(NEW.document,'$.sourceRecordId') AND campaign_id=NEW.campaign_id AND mode=NEW.mode AND json_extract(document,'$.contributionId')=json_extract(NEW.document,'$.contributionId')) BEGIN SELECT RAISE(ABORT,'Applied source reference required'); END;`);
}

export function financeRepository(db: any, writable: any) {
  const decode = (row: any) => (row ? JSON.parse(row.document) : null);
  return {
    validateJournal(
      this: import("./demo-types.ts").DemoRecords,
      transactionId: any,
    ) {
      const tx = this.get("journal_transactions", transactionId);
      const rows = db
        .prepare(
          "SELECT document FROM journal_entries WHERE json_extract(document,'$.transactionId')=? LIMIT 101",
        )
        .all(transactionId)
        .map(decode);
      const result = db
        .prepare(
          "SELECT id FROM source_event_results WHERE json_extract(document,'$.sourceRecordId')=?",
        )
        .get(tx.sourceRecordId);
      if (
        !result ||
        !rows.length ||
        rows.length > 100 ||
        rows.reduce(
          (n: any, r: any) => n + BigInt(r.debitCents) - BigInt(r.creditCents),
          0n,
        ) !== 0n
      )
        throw new Error("Unbalanced or unapplied journal transaction");
    },
    appliedEventPage(contributionId: any, after: any = 0) {
      return db
        .prepare(
          "SELECT rowid,document FROM source_event_results WHERE json_extract(document,'$.contributionId')=? AND rowid>? ORDER BY rowid LIMIT 101",
        )
        .all(contributionId, after)
        .map((row: any) => ({ sequence: row.rowid, result: decode(row) }));
    },
    hasConflict(contributionId: any) {
      return !!db
        .prepare(
          "SELECT id FROM source_conflicts WHERE json_extract(document,'$.contributionId')=? OR json_extract(document,'$.originalContributionId')=? LIMIT 1",
        )
        .get(contributionId, contributionId);
    },
    position(id: any) {
      return decode(
        db.prepare("SELECT document FROM finance_positions WHERE id=?").get(id),
      );
    },
    putPosition(row: any) {
      if (!writable()) throw new Error("Position requires transaction owner");
      db.prepare(
        "INSERT INTO finance_positions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
      ).run(
        row.id,
        row.campaignId,
        row.mode,
        row.effectiveAt,
        JSON.stringify(row),
      );
      return row;
    },
    sourceByKey(mode: any, source: any, account: any, event: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM source_events WHERE mode=? AND json_extract(document,'$.source')=? AND json_extract(document,'$.sourceAccountId')=? AND json_extract(document,'$.sourceEventId')=?",
          )
          .get(mode, source, account, event),
      );
    },
    contributionByTransaction(
      mode: any,
      source: any,
      account: any,
      transaction: any,
    ) {
      return decode(
        db
          .prepare(
            "SELECT document FROM contributions WHERE mode=? AND json_extract(document,'$.source')=? AND json_extract(document,'$.sourceAccountId')=? AND json_extract(document,'$.originalTransactionId')=?",
          )
          .get(mode, source, account, transaction),
      );
    },
    contributionByIntent(intentId: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM contributions WHERE json_extract(document,'$.intentId')=?",
          )
          .get(intentId),
      );
    },
    setPending(event: any, pending: any) {
      if (!writable()) throw new Error("Queue requires transaction owner");
      if (pending)
        db.prepare(
          "INSERT OR IGNORE INTO finance_pending VALUES(?,?,?,?,?)",
        ).run(
          event.id,
          event.campaignId,
          event.mode,
          event.effectiveAt,
          event.contributionId,
        );
      else db.prepare("DELETE FROM finance_pending WHERE id=?").run(event.id);
    },
    pendingPage(
      this: import("./demo-types.ts").DemoRecords,
      {
        campaignId,
        mode = "simulated",
        contributionId,
        cursor,
        limit = 100,
      }: any,
    ) {
      limit = Math.min(100, Math.max(1, limit));
      const args = contributionId ? [contributionId] : [campaignId, mode];
      let where = contributionId ? "subject_id=?" : "campaign_id=? AND mode=?";
      if (cursor) {
        where += " AND (effective_at,id)>(?,?)";
        args.push(cursor.at, cursor.id);
      }
      const rows = db
        .prepare(
          `SELECT id,effective_at FROM finance_pending WHERE ${where} ORDER BY effective_at,id LIMIT ?`,
        )
        .all(...args, limit + 1);
      const items = rows
        .slice(0, limit)
        .map((row: any) => this.get("source_events", row.id));
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit ? { at: last.effectiveAt, id: last.id } : null,
      };
    },
    financeTotals(
      campaignId: any,
      mode: any = "simulated",
      creatorId: any = null,
    ) {
      const fields = [
        "capturedCents",
        "settledCents",
        "refundedCents",
        "publicGrossCents",
        "publicRefundCents",
        "publicNetCents",
        "unallocatedCents",
        "pendingCents",
        "pendingPublicCents",
        "creatorCents",
        "beneficiaryCents",
        "availableCreatorCents",
        "availableBeneficiaryCents",
        "votes",
        "settledVotes",
        "seedGuaranteeCents",
        "seedAppUseCents",
        "mediaCents",
        "availableSeedGuaranteeCents",
        "availableSeedAppUseCents",
        "availableMediaCents",
        "heldCents",
        "publicHeldCents",
      ];
      const row = db
        .prepare(
          `SELECT ${fields.map((f: any) => `COALESCE(SUM(json_extract(document,'$.${f}')),0) AS ${f}`).join(",")} FROM finance_positions WHERE campaign_id=? AND mode=? ${creatorId ? "AND json_extract(document,'$.creatorId')=?" : ""}`,
        )
        .get(
          ...(creatorId ? [campaignId, mode, creatorId] : [campaignId, mode]),
        );
      for (const v of Object.values(row))
        if (!Number.isSafeInteger(v))
          throw new AppError("Financial report exceeds safe integer bounds.");
      return row;
    },
    financeQueryPlans() {
      return {
        source: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM source_events WHERE mode=? AND json_extract(document,'$.source')=? AND json_extract(document,'$.sourceAccountId')=? AND json_extract(document,'$.sourceEventId')=?",
          )
          .all("simulated", "fixture", "account", "event"),
        journal: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM journal_transactions WHERE campaign_id=? AND mode=? AND json_extract(document,'$.contributionId')=? ORDER BY effective_at,id LIMIT 100",
          )
          .all("campaign", "simulated", "subject"),
        pending: db
          .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM finance_pending WHERE campaign_id=? AND mode=? ORDER BY effective_at,id LIMIT 100",
          )
          .all("campaign", "simulated"),
      };
    },
  };
}
