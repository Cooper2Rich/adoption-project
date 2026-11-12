import {
  analyticsRepository,
  analyticsTables,
  migrateAnalyticsRecords,
} from "./analytics-records.ts";
import type { DemoState } from "./demo-types.ts";
import { AppError } from "./domain.ts";
import { financeRepository, migrateFinanceRecords } from "./finance-records.ts";
import {
  migrateSettlementRecords,
  settlementRepository,
} from "./settlement-records.ts";

// New histories live in indexed SQLite rows, never in the baseline workspace JSON.
// The workspace remains authoritative for legacy creative snapshots; snapshot_refs
// is an index of their IDs, not a second copy of their immutable contents.
const tables = [
  ...analyticsTables,
  "offer_versions",
  "participations",
  "participation_restrictions",
  "distributions",
  "distribution_events",
  "tracking_links",
  "tracking_link_events",
  "tracking_clicks",
  "gift_intents",
  "attribution_events",
  "attribution_adjudications",
  "audit_events",
  "media",
  "media_associations",
  "media_reviews",
  "source_events",
  "journal_transactions",
  "journal_entries",
  "reservations",
  "settlement_manifests",
  "contributions",
  "source_conflicts",
  "source_event_results",
  "reconciliation_runs",
  "finance_operations",
  "settlement_periods",
  "settlement_results",
];

export function migrateRecords(db: any) {
  // Called only by createStore inside its initialization transaction.
  {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS snapshot_refs (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, post_id TEXT NOT NULL,
        revision INTEGER NOT NULL, digest TEXT NOT NULL, effective_at TEXT NOT NULL,
        UNIQUE(post_id, revision));
      CREATE INDEX IF NOT EXISTS snapshot_campaign ON snapshot_refs(campaign_id, effective_at, id);`);
    db.exec(`CREATE TABLE IF NOT EXISTS campaign_index (
      id TEXT PRIMARY KEY,mode TEXT NOT NULL,effective_at TEXT NOT NULL,status TEXT NOT NULL,
      owner_id TEXT NOT NULL,cause TEXT NOT NULL,offer_state TEXT NOT NULL,terms_id TEXT,
      starts_at TEXT,ends_at TEXT,channels TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS campaign_discovery ON campaign_index(mode,status,effective_at,id);
      CREATE INDEX IF NOT EXISTS campaign_owner ON campaign_index(owner_id,mode,status,effective_at,id);`);
    db.exec(
      "CREATE TABLE IF NOT EXISTS organization_index(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('nonprofit','business')))",
    );
    for (const table of tables) {
      db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('simulated','live')),
        effective_at TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)));
        CREATE INDEX IF NOT EXISTS ${table}_page ON ${table}(campaign_id,mode,effective_at,id);`);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS offer_version_unique ON offer_versions(campaign_id,json_extract(document,'$.version'));
      CREATE UNIQUE INDEX IF NOT EXISTS participation_unique ON participations(campaign_id,json_extract(document,'$.creatorId'),json_extract(document,'$.termsId'));
      CREATE UNIQUE INDEX IF NOT EXISTS source_evidence_unique ON source_events(mode,json_extract(document,'$.source'),json_extract(document,'$.sourceAccountId'),json_extract(document,'$.sourceEventId'));
      CREATE UNIQUE INDEX IF NOT EXISTS reservation_key_unique ON reservations(mode,json_extract(document,'$.idempotencyKey'));
      CREATE INDEX IF NOT EXISTS click_visitor ON tracking_clicks(campaign_id,mode,json_extract(document,'$.visitorId'),effective_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS media_path ON media(json_extract(document,'$.storagePath'));
      CREATE INDEX IF NOT EXISTS distribution_state_lookup ON distribution_events(campaign_id,mode,json_extract(document,'$.distributionId'),effective_at DESC);
      CREATE INDEX IF NOT EXISTS participation_restriction_lookup ON participation_restrictions(campaign_id,mode,json_extract(document,'$.creatorId'),effective_at DESC);
      INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);`);
    migrateFinanceRecords(db);
    migrateSettlementRecords(db);
    migrateAnalyticsRecords(db);
  }
}

export function recordRepository(db: any, writable: any) {
  const dirtyTransactions = new Set();
  const newTransactions = new Set();
  const check = (table: any) => {
    if (!tables.includes(table)) throw new Error("Unknown record table");
  };
  const decode = (row: any) => (row ? JSON.parse(row.document) : null);
  return {
    ...financeRepository(db, writable),
    ...settlementRepository(db),
    ...analyticsRepository(db),
    beginWrite() {
      dirtyTransactions.clear();
      newTransactions.clear();
    },
    validateWrite() {
      for (const id of dirtyTransactions) this.validateJournal(id);
    },
    get(table: any, id: any) {
      check(table);
      return decode(
        db.prepare(`SELECT document FROM ${table} WHERE id=?`).get(id),
      );
    },
    append(table: any, row: any) {
      check(table);
      if (!writable())
        throw new Error("Records must share the workspace transaction owner");
      if (
        table === "journal_entries" &&
        !newTransactions.has(row.transactionId)
      )
        throw new Error("Immutable journal transaction is already closed");
      db.prepare(
        `INSERT INTO ${table}(id,campaign_id,mode,effective_at,document) VALUES(?,?,?,?,?)`,
      ).run(
        row.id,
        row.campaignId,
        row.mode || "simulated",
        row.effectiveAt,
        JSON.stringify(row),
      );
      if (table === "journal_transactions") dirtyTransactions.add(row.id);
      if (table === "journal_transactions") newTransactions.add(row.id);
      if (table === "journal_entries") dirtyTransactions.add(row.transactionId);
      return row;
    },
    page(
      table: any,
      { campaignId, mode = "simulated", limit = 50, cursor, through }: any = {},
    ) {
      check(table);
      if (!campaignId) throw new AppError("Campaign scope is required.");
      if (!["simulated", "live"].includes(mode))
        throw new AppError("Invalid mode.");
      limit = Number(limit);
      if (!Number.isInteger(limit) || limit < 1)
        throw new AppError("Invalid page size.");
      limit = Math.min(limit, 100);
      let after;
      try {
        after = cursor
          ? JSON.parse(Buffer.from(cursor, "base64url").toString())
          : null;
        if (
          after &&
          (after.campaignId !== campaignId ||
            after.mode !== mode ||
            typeof after.at !== "string" ||
            typeof after.id !== "string")
        )
          throw new Error();
      } catch {
        throw new AppError("Invalid scoped cursor.");
      }
      const args = [campaignId, mode];
      let where = "campaign_id=? AND mode=?";
      if (after) {
        where += " AND (effective_at,id)>(?,?)";
        args.push(after.at, after.id);
      }
      if (through) {
        where += " AND effective_at<=?";
        args.push(through);
      }
      const rows = db
        .prepare(
          `SELECT document FROM ${table} WHERE ${where} ORDER BY effective_at,id LIMIT ?`,
        )
        .all(...args, limit + 1)
        .map(decode);
      const more = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: more
          ? Buffer.from(
              JSON.stringify({
                campaignId,
                mode,
                at: last.effectiveAt,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
      };
    },
    lastClick(campaignId: any, visitorId: any, at: any) {
      return decode(
        db
          .prepare(
            `SELECT document FROM tracking_clicks WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.visitorId')=? AND effective_at<=? ORDER BY effective_at DESC,id DESC LIMIT 1`,
          )
          .get(campaignId, visitorId, at),
      );
    },
    restrictionFor(campaignId: any, creatorId: any, at: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM participation_restrictions WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.creatorId')=? AND effective_at<=? ORDER BY effective_at DESC,rowid DESC LIMIT 1",
          )
          .get(campaignId, creatorId, at),
      );
    },
    distributionStateAt(campaignId: any, distributionId: any, at: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM distribution_events WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.distributionId')=? AND effective_at<=? ORDER BY effective_at DESC,rowid DESC LIMIT 1",
          )
          .get(campaignId, distributionId, at),
      );
    },
    offerControlAt(campaignId: any, at: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM audit_events WHERE campaign_id=? AND mode='simulated' AND effective_at<=? AND json_extract(document,'$.operation') IN ('offer_opened','offer_open','offer_closed') ORDER BY effective_at DESC,rowid DESC LIMIT 1",
          )
          .get(campaignId, at),
      );
    },
    visitorClicks(campaignId: any, visitorId: any, at: any, before: any) {
      const where = before ? " AND (effective_at,id)<(?,?)" : "";
      const args = [
        campaignId,
        visitorId,
        new Date(Date.parse(at) - 7 * 86400000).toISOString(),
        at,
      ];
      if (before) args.push(before.at, before.id);
      return db
        .prepare(
          `SELECT document FROM tracking_clicks WHERE campaign_id=? AND mode='simulated' AND json_extract(document,'$.visitorId')=? AND effective_at>=? AND effective_at<=? ${where} ORDER BY effective_at DESC,id DESC LIMIT 100`,
        )
        .all(...args)
        .map(decode);
    },
    byMediaPath(path: any) {
      return decode(
        db
          .prepare(
            "SELECT document FROM media WHERE json_extract(document,'$.storagePath')=?",
          )
          .get(path),
      );
    },
    indexSnapshots(state: DemoState) {
      if (!writable()) throw new Error("Snapshot index requires transaction");
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO snapshot_refs(id,campaign_id,post_id,revision,digest,effective_at) VALUES(?,?,?,?,?,?)",
      );
      for (const post of state.posts)
        for (const snapshot of post.snapshots || []) {
          stmt.run(
            snapshot.id,
            post.projectId,
            post.id,
            snapshot.revision,
            snapshot.digest,
            snapshot.at,
          );
          const media = snapshot.content.media.startsWith("/api/media/")
            ? this.get("media", snapshot.content.media.slice(11))
            : this.byMediaPath(snapshot.content.media);
          if (media) {
            const id = `${media.id}:${snapshot.id}`;
            if (!this.get("media_associations", id))
              this.append("media_associations", {
                id,
                campaignId: post.projectId,
                mode: "simulated",
                effectiveAt: snapshot.at,
                mediaId: media.id,
                postId: post.id,
                snapshotId: snapshot.id,
              });
          }
        }
    },
    indexCampaigns(state: DemoState) {
      if (!writable()) throw new Error("Campaign index requires transaction");
      const stmt = db.prepare(
        `INSERT INTO campaign_index(id,mode,effective_at,status,owner_id,cause,offer_state,terms_id,starts_at,ends_at,channels) VALUES(?,'simulated',?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET effective_at=excluded.effective_at,status=excluded.status,owner_id=excluded.owner_id,cause=excluded.cause,offer_state=excluded.offer_state,terms_id=excluded.terms_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,channels=excluded.channels`,
      );
      for (const p of state.projects) {
        const terms = p.offerVersionId
          ? this.get("offer_versions", p.offerVersionId)
          : null;
        stmt.run(
          p.id,
          terms?.effectiveAt || p.createdAt,
          p.status,
          p.ownerOrganizationId,
          p.category,
          p.offerState || "draft",
          terms?.id || null,
          terms?.startsAt || null,
          terms?.endsAt || null,
          JSON.stringify(
            terms
              ? [...new Set(terms.combinations.map((c: any) => c.channel))]
              : [],
          ),
        );
      }
      const orgStmt = db.prepare(
        "INSERT INTO organization_index(id,name,type) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type",
      );
      for (const org of state.organizations)
        orgStmt.run(org.id, org.name, org.type);
    },
    organizationsPage({ organizationId = null, limit = 50, cursor }: any = {}) {
      limit = Number(limit);
      if (!Number.isInteger(limit) || limit < 1)
        throw new AppError("Invalid page size.");
      limit = Math.min(limit, 100);
      let after = "";
      try {
        if (cursor) {
          const data = JSON.parse(Buffer.from(cursor, "base64url").toString());
          if (
            data.organizationId !== organizationId ||
            typeof data.id !== "string"
          )
            throw new Error();
          after = data.id;
        }
      } catch {
        throw new AppError("Invalid organization cursor.");
      }
      const rows = db
        .prepare(
          `SELECT id,name,type FROM organization_index WHERE id>? ${organizationId ? "AND id=?" : ""} ORDER BY id LIMIT ?`,
        )
        .all(
          ...(organizationId
            ? [after, organizationId, limit + 1]
            : [after, limit + 1]),
        );
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor:
          rows.length > limit
            ? Buffer.from(
                JSON.stringify({ id: items.at(-1).id, organizationId }),
              ).toString("base64url")
            : null,
      };
    },
    discoveryQueryPlan() {
      return db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM campaign_index WHERE mode='simulated' AND status='active' AND effective_at<=? ORDER BY effective_at,id LIMIT 100",
        )
        .all(new Date().toISOString());
    },
    discoverOffers(query: any) {
      const filter = JSON.stringify({
        cause: query.cause,
        organizationId: query.organizationId,
        channel: query.channel,
        state: query.state,
        date: query.date,
      });
      let after: any = null,
        at = query.date || new Date().toISOString();
      try {
        if (query.cursor) {
          after = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
          if (
            after.filter !== filter ||
            typeof after.id !== "string" ||
            typeof after.effectiveAt !== "string" ||
            typeof after.at !== "string"
          )
            throw new Error();
          at = after.at;
        }
      } catch {
        throw new AppError("Invalid discovery cursor.");
      }
      const args = [at, at, at];
      let where =
        "mode='simulated' AND status='active' AND terms_id IS NOT NULL AND effective_at<=? AND starts_at<=? AND ends_at>?";
      if (query.cause) {
        where += " AND cause=?";
        args.push(query.cause);
      }
      if (query.organizationId) {
        where += " AND owner_id=?";
        args.push(query.organizationId);
      }
      if (query.state) {
        where += " AND offer_state=?";
        args.push(query.state);
      }
      if (query.channel) {
        where += " AND EXISTS(SELECT 1 FROM json_each(channels) WHERE value=?)";
        args.push(query.channel);
      }
      if (after) {
        where += " AND (effective_at,id)>(?,?)";
        args.push(after.effectiveAt, after.id);
      }
      const rows = db
        .prepare(
          `SELECT id,terms_id,effective_at FROM campaign_index WHERE ${where} ORDER BY effective_at,id LIMIT ?`,
        )
        .all(...args, query.limit + 1);
      const items = rows.slice(0, query.limit),
        last = items.at(-1);
      return {
        items: items.map((row: any) => ({
          campaignId: row.id,
          termsId: row.terms_id,
        })),
        nextCursor:
          rows.length > query.limit
            ? Buffer.from(
                JSON.stringify({
                  id: last.id,
                  effectiveAt: last.effective_at,
                  at,
                  filter,
                }),
              ).toString("base64url")
            : null,
      };
    },
    queryPlan(table: any) {
      check(table);
      return db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE campaign_id=? AND mode=? AND (effective_at,id)>(?,?) ORDER BY effective_at,id LIMIT 100`,
        )
        .all("fixture", "simulated", "", "");
    },
  };
}
