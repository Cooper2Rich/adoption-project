import { SpreadsheetFile,Workbook } from "@oai/artifact-tool";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const workbook = Workbook.create();
const market = workbook.worksheets.add("Market comparison");
const concept = workbook.worksheets.add("Your concept");

const rows = [
  ["Your proposed app", "Nonprofit ad competition", "Open creative submissions; donation-linked votes; leaderboards; creator rewards", "Publishes screened ads on nonprofit Instagram; ranks by CTR, views, votes and donations; per-ad commission and portfolio tiers", "1 completed donation = 1 vote; amount scored separately", "10% of donations attributed to each ad at launch; seed guarantees a minimum payout", "Instagram ad metrics and app-attributed donations", "Design from interview; see Your concept tab"],
  ["Givebutter", "Peer fundraising", "Individual fundraiser pages, trackable links, donation credit and leaderboards", "Reviewed pages do not document creator-made ads, ad CTR ranking, or donation commissions", "Donate-to-vote examples, but not its core payout model", "No creator donation commission documented", "Fundraising and link tracking; ad CTR not documented", "https://givebutter.com/features/peer-to-peer-fundraising"],
  ["RallyUp", "Peer fundraising", "Open participant access, credited donations, leaderboards and contest formats", "Reviewed pages do not document creator ad publishing, CTR ranking or commission tiers", "Donation-driven contest examples; some use dollars as votes", "No creator donation commission documented", "Donation and participant activity; ad CTR not documented", "https://rallyup.com/peer-to-peer/"],
  ["GoGo Photo Contest", "Donate-to-vote contest", "Public entries, donation-linked votes and winner selection for nonprofits", "Photo contest focus; $1 = 1 vote differs from one vote per donation; no ad CTR ranking documented", "$1 of donation buys 1 vote; funds go to nonprofit bank account less fees", "No creator donation commission documented", "Ad CTR or Meta publishing not documented", "https://support.gogophotocontest.com/hc/en-us/articles/4409707754259-How-does-the-donate-to-vote-aspect-work"],
  ["ShortStack", "UGC voting contest", "Accepts photos, video and Instagram entries; moderation, galleries and voting", "Reviewed features do not document donation processing, creator commission or ad CTR ranking", "Voting available; donation-required voting not documented", "No creator donation commission documented", "Social content collection; paid ad metrics not documented", "https://www.shortstack.com/features"],
  ["Billo", "Creator ad marketplace", "Creator-made ads, Meta connection and CTR-based creative analysis", "Creators are selected and paid for content; reviewed pages do not document nonprofit donation voting or per-donation commissions", "Not documented in reviewed sources", "Creator selection and content payment; donation share not documented", "Meta ad performance including CTR and ROAS", "https://help.billo.app/en/articles/10595375-meta-integration-unlocking-deeper-insights-for-your-brand"],
  ["impact.com Creator", "Creator affiliate platform", "Performance tracking, creator campaigns and commission-based payouts", "Reviewed pages do not document donation voting, open ad contest or nonprofit Instagram publishing", "Not documented in reviewed sources", "Flexible flat-fee and performance commissions", "Tracks creator posts, links and campaign results", "https://impact.com/creator/"],
  ["Tongal", "Creative crowdsourcing", "Broad creator community submits creative work for brands", "Reviewed pages do not document donation voting, ad CTR leaderboards or per-ad donation commissions", "Not documented in reviewed sources", "Creators earn through projects; donation share not documented", "Ad performance ranking not documented", "https://tongal.com/"],
];

market.getRange("A2").values = [["Nonprofit creator-ad platform: market comparison"]];
market.getRange("A3").values = [["Research checked 24 Sep 2026. “Not documented” means absent from the linked pages reviewed, not proof the product lacks the feature."]];
market.getRange("A5:H5").values = [["Product", "Category", "Similarities", "Differences from your app", "Donation voting", "Creator payment", "Social / ad metrics", "Primary source"]];
market.getRange("A6:H13").values = rows;
market.getRange("A2:H13").format.font = { name: "Arial", size: 10, color: "#202124" };
market.getRange("A2").format.font = { name: "Arial", size: 14, bold: true, color: "#202124" };
market.getRange("A3").format.font = { name: "Arial", size: 10, italic: true, color: "#5F6368" };
market.getRange("A5:H5").format.fill = "#E8EAED";
market.getRange("A5:H5").format.font = { name: "Arial", size: 10, bold: true, color: "#202124" };
market.getRange("A6:H6").format.fill = "#F1F3F4";
market.getRange("A5:H13").format.verticalAlignment = "center";
market.getRange("A5:H13").format.wrapText = true;
market.getRange("A5:H5").format.rowHeight = 30;
market.getRange("A6:H13").format.rowHeight = 106;
const widths = [23, 22, 47, 52, 39, 44, 40, 64];
for (let i = 0; i < widths.length; i++) market.getRangeByIndexes(0, i, 13, 1).format.columnWidth = widths[i];
market.freezePanes.freezeRows(5);
market.freezePanes.freezeColumns(1);

const decisions = [
  ["Audience", "Nonprofits first; businesses can also fund campaigns", "Confirmed"],
  ["Platform", "Mobile-friendly web app; Instagram launch", "Confirmed"],
  ["Access", "Anyone may submit a creative; automated policy check before publication", "Confirmed"],
  ["Publication", "Nonprofit administrator connects official Instagram account; approved creatives can publish automatically", "Confirmed"],
  ["Formats", "Creators may propose any ad format; actual Instagram support must be checked per format", "Confirmed intent; platform-dependent"],
  ["Campaign timing", "Approximately 2.5 months, with weekly payouts, monthly winners and a final winner", "Confirmed; exact calendar set by administrator"],
  ["Donation attribution", "Each completed donation is tied to one ad and counts as one vote; donation amount is tracked separately", "Confirmed"],
  ["Creator commission", "Launch rate 10% of donations attributed to the creator's ad; rate changes affect future donations only", "Confirmed"],
  ["Remaining donation", "At launch, 90% of each attributed donation goes to the nonprofit, before any processor fees or adjustments", "Confirmed split; fee treatment open"],
  ["Seed investment", "Nonprofit seed guarantees a minimum payout and pays the app for its use", "Confirmed purpose; guarantee formula open"],
  ["Ranking", "CTR 40%; views 30%; donation-linked votes 15%; donation amount 15%; minimum view threshold", "Accepted starting recommendation; threshold and normalization open"],
  ["Creator tiers", "Portfolio tier depends on number of top-20 ads and time in top 20; publish thresholds before activation", "Confirmed concept; rates and thresholds open"],
  ["Payment custody", "Separate nonprofit payment account with recorded creator/nonprofit split", "Interpreted from grill reply; verify before build"],
  ["Key platform decision", "Decide whether Instagram placements are paid ads or organic posts; Meta documents ad-level clicks/impressions for paid ads", "Validation needed"],
  ["Compliance review", "Review donor disclosure, paid creator disclosure, fundraiser compensation, receipts and applicable state rules", "Validation needed"],
];

concept.getRange("A2").values = [["Current app concept and open design decisions"]];
concept.getRange("A3").values = [["Interview summary as of 24 Sep 2026; validation items are design questions, not settled rules."]];
concept.getRange("A5:C5").values = [["Area", "Current rule", "Status"]];
concept.getRange("A6:C20").values = decisions;
concept.getRange("A2:C20").format.font = { name: "Arial", size: 10, color: "#202124" };
concept.getRange("A2").format.font = { name: "Arial", size: 14, bold: true, color: "#202124" };
concept.getRange("A3").format.font = { name: "Arial", size: 10, italic: true, color: "#5F6368" };
concept.getRange("A5:C5").format.fill = "#E8EAED";
concept.getRange("A5:C5").format.font = { name: "Arial", size: 10, bold: true, color: "#202124" };
concept.getRange("A5:C20").format.verticalAlignment = "center";
concept.getRange("A5:C20").format.wrapText = true;
concept.getRange("A5:C5").format.rowHeight = 30;
concept.getRange("A6:C20").format.rowHeight = 58;
concept.getRange("A:A").format.columnWidth = 25;
concept.getRange("B:B").format.columnWidth = 100;
concept.getRange("C:C").format.columnWidth = 37;
concept.freezePanes.freezeRows(5);

workbook.recalculate();
for (const [sheetName, range, fileName] of [
  ["Market comparison", "A2:D13", "comparison-preview.png"],
  ["Your concept", "A2:C20", "concept-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, fileName), new Uint8Array(await preview.arrayBuffer()));
}
const check = await workbook.inspect({ kind: "table", range: "'Market comparison'!A5:H13", include: "values", tableMaxRows: 10, tableMaxCols: 8, maxChars: 6000 });
console.log(check.ndjson);
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "nonprofit-creator-ad-market-comparison.xlsx"));
console.log(path.join(outputDir, "nonprofit-creator-ad-market-comparison.xlsx"));
