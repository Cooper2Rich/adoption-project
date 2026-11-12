import { count, ctr, money, type PublicAd } from "./catalog.ts";
export function AdStats({
  ad,
}: {
  ad: Pick<PublicAd, "impressions" | "clicks" | "donatedCents">;
}) {
  return (
    <dl className="ad-stats">
      <div>
        <dt>Impressions</dt>
        <dd>{count(ad.impressions)}</dd>
      </div>
      <div>
        <dt>CTR</dt>
        <dd>{ctr(ad)}</dd>
      </div>
      <div>
        <dt>$ donated</dt>
        <dd>{ad.donatedCents === null ? "N/A" : money(ad.donatedCents)}</dd>
      </div>
    </dl>
  );
}
