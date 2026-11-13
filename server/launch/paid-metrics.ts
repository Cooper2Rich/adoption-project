import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHmac } from "node:crypto";
import { stable, digest } from "./fundraising.ts";

type Config = {
  url?: string;
  secret?: string;
  fixtureRunId?: string;
  providerOrigin?: string;
};
class ReportError extends Error {
  category: string;
  retryMs: number;
  retryHold?: string;
  constructor(category: string, retryMs = 60_000, retryHold?: string) {
    super(category);
    this.category = category;
    this.retryMs = retryMs;
    this.retryHold = retryHold;
  }
}
function count(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "-") return undefined;
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
    throw new ReportError("processing: invalid integer metric");
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new ReportError("processing: unsafe metric");
  return n;
}
export function reportRetryDelay(
  header: string | null,
  receivedAt = Date.now(),
) {
  if (header === null) return { retryMs: 60_000 };
  const trimmed = header.trim();
  const milliseconds = /^\d+$/.test(trimmed)
    ? Number(trimmed) * 1000
    : Date.parse(trimmed) - receivedAt;
  // Unrepresentable/unsupported provider backoff is held indefinitely by the
  // owned contract, rather than shortened to a more aggressive retry interval.
  if (
    !Number.isSafeInteger(milliseconds) ||
    receivedAt + milliseconds > 8_640_000_000_000_000
  )
    return {
      retryMs: 30_000,
      retryHold:
        "Unsupported provider Retry-After policy; trusted contract review required",
    };
  return { retryMs: Math.max(30_000, milliseconds) };
}
// Deliberately restricted to a run-owned loopback peer. Candidate fields alone
// prove neither live metric comparability nor account/timezone/coverage facts.
export function createPaidMetricService(config: Config) {
  const { url, secret, fixtureRunId, providerOrigin } = config;
  const enabled = !!(
    url &&
    secret &&
    secret.length >= 32 &&
    fixtureRunId &&
    providerOrigin &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(providerOrigin)
  );
  async function receipt(name: string, value: any) {
    const input = { ...value, fixtureRunId, at: Date.now() };
    return new ConvexHttpClient(url!).mutation(
      makeFunctionReference<"mutation">(`paidMetrics:${name}`),
      {
        value: input,
        signature: createHmac("sha256", secret!)
          .update(stable(input))
          .digest("hex"),
      },
    );
  }
  async function perform(token: string, input: any) {
    if (!enabled)
      throw new ReportError(
        "PAID_HELD: Actual provider reporting approval required (#12)",
      );
    const client = new ConvexHttpClient(url!);
    client.setAuth(token);
    const operationId = await client.mutation(
      makeFunctionReference<"mutation">("paidMetrics:requestImport"),
      input,
    );
    const claimed: any = await receipt("claim", { operationId });
    if (!claimed)
      return {
        operationId,
        state: "existing-or-superseded",
        productionEligible: false,
      };
    const { source, period, mappings } = claimed;
    let outcome = "success",
      reason =
        "Provider operation completed; exact coverage evaluated independently",
      retryMs = 30_000,
      retryHold: string | undefined,
      rows: any[] = [],
      evidence = "owned report unavailable";
    try {
      if (new Set(mappings.map((m: any) => m.adId)).size > 100)
        throw new ReportError(
          "scope-limit: owned selected report contract permits at most 100 distinct ads; batching contract remains held",
        );
      const seenCursors = new Set<string>(),
        seenRows = new Set<string>();
      let cursor = "",
        page = 1,
        report: any;
      for (;;) {
        if (page > 100)
          throw new ReportError("pagination: page limit exceeded");
        const target = new URL(
          source.provider === "meta"
            ? "/meta/insights"
            : "/open_api/v2.0/report/integrated/get/",
          providerOrigin,
        );
        const body = {
          advertiser_ids: [source.account],
          dimensions: ["ad_id"],
          metrics: ["impressions", "clicks"],
          ad_ids: [...new Set(mappings.map((m: any) => m.adId))],
          start: period.start,
          end: period.end,
          page,
          page_size: 100,
        };
        if (source.provider === "meta")
          for (const [k, v] of Object.entries({
            account: source.account,
            fields:
              "ad_id,campaign_id,account_id,publisher_platform,impressions,inline_link_clicks",
            breakdowns: "publisher_platform",
            start: period.start,
            end: period.end,
            ad_ids: JSON.stringify(body.ad_ids),
            after: cursor,
          }))
            target.searchParams.set(k, String(v));
        const response = await fetch(target, {
          method: source.provider === "meta" ? "GET" : "POST",
          headers: {
            Authorization: `Bearer owned-${fixtureRunId}`,
            "Content-Type": "application/json",
          },
          ...(source.provider === "meta" ? {} : { body: JSON.stringify(body) }),
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          const policy =
            response.status === 429
              ? reportRetryDelay(response.headers.get("retry-after"))
              : { retryMs: 60_000 };
          throw new ReportError(
            response.status === 429
              ? "rate-limit: provider requested backoff"
              : response.status === 401 || response.status === 403
                ? "authorization: provider grant unavailable"
                : "transport: provider request failed",
            policy.retryMs,
            policy.retryHold,
          );
        }
        const raw = await response.text();
        if (raw.length > 2_000_000)
          throw new ReportError("processing: report page too large");
        const data = JSON.parse(raw);
        if (data.error || (data.code !== undefined && data.code !== 0))
          throw new ReportError("authorization-or-provider: report error");
        if (data.extra_info?.search_ads_throttle)
          throw new ReportError("rate-limit: report throttled", 60_000);
        const proof = data.owned;
        if (
          !proof ||
          proof.runId !== fixtureRunId ||
          proof.provider !== source.provider ||
          proof.account !== source.account ||
          proof.start !== period.start ||
          proof.end !== period.end ||
          proof.schema !== `owned-${source.provider}-report-v1` ||
          proof.page !== page ||
          !Number.isSafeInteger(proof.totalPages) ||
          proof.totalPages < page ||
          proof.totalPages > 100 ||
          !Number.isSafeInteger(proof.revision) ||
          proof.revision < 1 ||
          !Array.isArray(proof.completeScopes)
        )
          throw new ReportError(
            "processing: report scope or selected schema mismatch",
          );
        const normalized = { ...proof, page: 0 };
        if (report && stable(normalized) !== stable(report))
          throw new ReportError("pagination: inconsistent report revision");
        report = normalized;
        const list = source.provider === "meta" ? data.data : data.data?.list;
        if (!Array.isArray(list) || list.length > 100)
          throw new ReportError("processing: malformed report rows");
        for (const item of list) {
          const adId =
            source.provider === "meta" ? item.ad_id : item.dimensions?.ad_id;
          const platform =
            source.provider === "meta" ? item.publisher_platform : "tiktok";
          const mapping = mappings.find(
            (m: any) => m.adId === adId && m.platform === platform,
          );
          // Unrelated and organic activity is excluded, never mapped by position.
          if (item.organic === true || item.paid === false || !mapping)
            continue;
          if (
            item.account_id !== source.account ||
            item.campaign_id !== mapping.proof.providerCampaign ||
            item.creative_digest !== mapping.proof.creativeDigest ||
            item.grant_revision !== mapping.proof.grantRevision ||
            item.destination !== mapping.proof.destination
          )
            throw new ReportError(
              "processing: object, grant or unchanged creative mismatch",
            );
          const key = `${adId}:${platform}`;
          if (seenRows.has(key))
            throw new ReportError(
              "processing: duplicate or overlapping placement row",
            );
          seenRows.add(key);
          for (const [metric, field] of [
            ["impressions", "impressions"],
            [
              "linkClicks",
              source.provider === "meta" ? "inline_link_clicks" : "clicks",
            ],
          ]) {
            const value = count(
              (source.provider === "meta" ? item : item.metrics)?.[field],
            );
            if (value === undefined) continue;
            const complete = proof.completeScopes.some(
              (s: any) =>
                s.adId === adId &&
                s.platform === platform &&
                s.metric === metric &&
                s.start === period.start &&
                s.end === period.end,
            );
            rows.push({
              mappingId: mapping._id,
              metric,
              value,
              start: period.start,
              end: period.end,
              ...(proof.dataAsOf === undefined
                ? {}
                : { dataAsOf: proof.dataAsOf }),
              revision: proof.revision,
              complete,
              evidence: `owned:${digest(stable({ proof, item, metric }))}`,
            });
          }
        }
        if (source.provider === "meta") {
          const next = data.paging?.cursors?.after;
          if (page < proof.totalPages) {
            if (typeof next !== "string" || !next || seenCursors.has(next))
              throw new ReportError("pagination: required page unavailable");
            seenCursors.add(next);
            cursor = next;
          } else if (next || data.paging?.next)
            throw new ReportError("pagination: unexpected additional page");
        } else if (
          data.data?.page_info?.page !== page ||
          data.data?.page_info?.total_page !== proof.totalPages
        )
          throw new ReportError("pagination: incomplete page manifest");
        if (page === proof.totalPages) {
          evidence = `owned:${digest(stable(report))}`;
          break;
        }
        page++;
      }
    } catch (error) {
      outcome = "failed";
      reason =
        error instanceof ReportError
          ? error.category
          : "transport-or-processing: report unavailable";
      retryMs = error instanceof ReportError ? error.retryMs : 60_000;
      retryHold = error instanceof ReportError ? error.retryHold : undefined;
      rows = [];
    }
    try {
      return {
        operationId,
        ...(await receipt("complete", {
          operationId,
          outcome,
          reason,
          retryMs,
          ...(retryHold ? { retryHold } : {}),
          rows,
          reportEvidence: evidence,
        })),
        productionEligible: false,
      };
    } catch (error) {
      // A rejected malformed/correction report is an operational processing failure;
      // mutation rollback retained prior accepted values and this failure is durable.
      if (outcome === "failed") throw error;
      return {
        operationId,
        ...(await receipt("complete", {
          operationId,
          outcome: "failed",
          reason: "processing: report failed source validation",
          retryMs: 60_000,
          rows: [],
          reportEvidence: evidence,
        })),
        productionEligible: false,
      };
    }
  }
  const service = async (request: Request) => {
    try {
      if (
        request.method !== "POST" ||
        new URL(request.url).searchParams.get("action") !== "import"
      )
        return Response.json(
          { error: "PAID_ROUTE: Unsupported operation" },
          { status: 400 },
        );
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
      if (!token)
        return Response.json(
          { error: "FORBIDDEN: Sign in required" },
          { status: 403 },
        );
      const raw = await request.text();
      if (raw.length > 2048)
        throw new ReportError("PAID_INPUT: Request too large");
      const result = await perform(token, JSON.parse(raw));
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message = String(error),
        match = message.match(/(?:FORBIDDEN|PAID_[A-Z_]+):[^\r\n]*/);
      return Response.json(
        { error: match?.[0] ?? "PAID_UNAVAILABLE: Import could not complete" },
        {
          status: message.includes("FORBIDDEN") ? 403 : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
  return Object.assign(service, { perform });
}
