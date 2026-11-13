import { createServer } from "node:http";
import { once } from "node:events";

export async function createPaidMetricFixture(runId: string) {
  let configuration: any = {
      mappings: [],
      period: { start: 0, end: 1 },
      revision: 1,
      dataAsOf: Date.now(),
    },
    mode = "normal";
  let requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    if (req.headers.authorization !== `Bearer owned-${runId}`) {
      res.writeHead(403);
      res.end();
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const url = new URL(req.url!, "http://127.0.0.1"),
      provider = url.pathname === "/meta/insights" ? "meta" : "tiktok";
    if (
      !["/meta/insights", "/open_api/v2.0/report/integrated/get/"].includes(
        url.pathname,
      )
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const input =
      provider === "meta"
        ? {
            page: Number(url.searchParams.get("after") || 1),
            account: url.searchParams.get("account"),
            start: Number(url.searchParams.get("start")),
            end: Number(url.searchParams.get("end")),
            adIds: JSON.parse(url.searchParams.get("ad_ids") || "[]"),
          }
        : (() => {
            const b = JSON.parse(raw);
            return {
              page: b.page,
              account: b.advertiser_ids?.[0],
              start: b.start,
              end: b.end,
              adIds: b.ad_ids,
            };
          })();
    const selected = structuredClone(configuration),
      selectedMode = mode;
    if (selectedMode === "slow")
      await new Promise((resolve) => setTimeout(resolve, 1200));
    if (selectedMode === "rate-limit") {
      res.writeHead(429, { "Retry-After": selected.retryAfter ?? "120" });
      res.end();
      return;
    }
    if (selectedMode === "authorization") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (selectedMode === "page-failure" && input.page === 2) {
      res.writeHead(503);
      res.end();
      return;
    }
    const mappings = selected.mappings.filter(
      (m: any) =>
        m.proof.provider === provider &&
        m.proof.account === input.account &&
        input.adIds.includes(m.adId),
    );
    const pages =
      selectedMode === "page-failure" || selectedMode === "paged" ? 2 : 1;
    const rows = mappings.map((m: any, i: number) => {
      const common = {
        ad_id: m.adId,
        account_id: m.proof.account,
        campaign_id: m.proof.providerCampaign,
        creative_digest: m.proof.creativeDigest,
        grant_revision: m.proof.grantRevision,
        destination: m.proof.destination,
        paid: true,
      };
      const metrics: any = {
        impressions: String(
          selected.values?.[m.platform]?.impressions ?? (i + 1) * 100,
        ),
        [provider === "meta" ? "inline_link_clicks" : "clicks"]: String(
          selected.values?.[m.platform]?.linkClicks ?? (i + 1) * 10,
        ),
      };
      if (selectedMode === "missing-field")
        delete metrics[provider === "meta" ? "inline_link_clicks" : "clicks"];
      if (selectedMode === "suppressed") metrics.impressions = "-";
      if (selectedMode === "malformed") metrics.impressions = "-1";
      if (selectedMode === "wrong-account")
        common.account_id = "foreign-account";
      if (selectedMode === "wrong-grant")
        common.grant_revision = "foreign-grant";
      if (selectedMode === "wrong-creative")
        common.creative_digest = "0".repeat(64);
      if (selectedMode === "wrong-campaign")
        common.campaign_id = "foreign-campaign";
      return provider === "meta"
        ? { ...common, publisher_platform: m.platform, ...metrics }
        : { ...common, dimensions: { ad_id: m.adId }, metrics };
    });
    if (selectedMode === "missing-placement") rows.pop();
    if (selectedMode === "duplicate") rows.push({ ...rows[0] });
    if (selectedMode === "organic") for (const r of rows) r.paid = false;
    rows.push({
      ad_id: "unrelated-paid-ad",
      account_id: input.account,
      publisher_platform: "facebook",
      impressions: "99999",
      inline_link_clicks: "99999",
      page_views: "99999",
      estimated_donations: "99999",
    } as any);
    const owned = {
      runId,
      provider,
      account: input.account,
      start: input.start,
      end: input.end,
      schema: `owned-${provider}-report-v1`,
      page: input.page,
      totalPages: pages,
      revision: selected.revision,
      ...(selectedMode === "unknown-time"
        ? {}
        : { dataAsOf: selected.dataAsOf }),
      completeScopes:
        selectedMode === "incomplete"
          ? []
          : mappings.flatMap((m: any) =>
              ["impressions", "linkClicks"].map((metric) => ({
                adId: m.adId,
                platform: m.platform,
                metric,
                start: input.start,
                end: input.end,
              })),
            ),
    };
    if (selectedMode === "wrong-report") owned.start--;
    const pageRows =
      pages === 2
        ? input.page === 1
          ? rows.slice(0, 1)
          : rows.slice(1)
        : rows;
    const result =
      provider === "meta"
        ? {
            owned,
            data: pageRows,
            paging:
              input.page < pages
                ? { cursors: { after: String(input.page + 1) } }
                : {},
          }
        : {
            owned,
            code: 0,
            data: {
              list: pageRows,
              page_info: { page: input.page, total_page: pages },
            },
          };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Owned peer unavailable");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    configure(value: any) {
      configuration = { ...configuration, ...value };
    },
    mode(value: string) {
      mode = value;
    },
    requests: () => requests,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
