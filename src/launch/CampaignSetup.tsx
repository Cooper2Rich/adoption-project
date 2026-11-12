import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import type { CampaignRules } from "../../convex/campaignRules.ts";
import { setupApi } from "./api.ts";
import { chicagoInstant } from "./campaign-dates.ts";
import { dollars, money, timestamp } from "./format.ts";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function CampaignSetup() {
  const workspace = useQuery(setupApi.workspace, { campaignId: "adoption" });
  const create = useMutation(setupApi.create);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ fingerprint: string; operationId: string } | null>(
    null,
  );
  if (!workspace)
    return (
      <main className="setup-message" role="status">
        Loading campaign setup…
      </main>
    );
  const saved = workspace.settings;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "");
    const schedule = (key: string) => ({
      weekday: Number(text(`${key}Day`)),
      time: text(`${key}Time`),
    });
    setError("");
    setPending(true);
    try {
      const rules: CampaignRules = {
        currency: "USD",
        timezone: "America/Chicago",
        campaignStart: chicagoInstant(text("campaignStart")),
        campaignEnd: chicagoInstant(text("campaignEnd")),
        earningStart: chicagoInstant(text("earningStart")),
        earningEnd: chicagoInstant(text("earningEnd")),
        commissionBasisPoints: dollars(text("commission")),
        dailyTargets: {
          impressions: Number(text("dailyImpressions")),
          totalClicks: Number(text("dailyClicks")),
          fundraisingCents: dollars(text("dailyFundraising")),
        },
        weeklyTargets: {
          impressions: Number(text("weeklyImpressions")),
          totalClicks: Number(text("weeklyClicks")),
          fundraisingCents: dollars(text("weeklyFundraising")),
        },
        dailyPrizeCents: dollars(text("dailyPrize")),
        weeklyPrizeCents: dollars(text("weeklyPrize")),
        dailyPrizeTime: text("dailyPrizeTime"),
        weeklyPrizeSchedule: schedule("prize"),
        weeklyReplenishmentCents: dollars(text("replenishment")),
        weeklyReplenishmentSchedule: schedule("replenishment"),
        creatorPaymentSchedule: schedule("payment"),
      };
      const fingerprint = JSON.stringify(rules);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, operationId: crypto.randomUUID() };
      await create({
        campaignId: "adoption",
        operationId: retry.current.operationId,
        rules,
      });
    } catch {
      setError(
        "Campaign rules could not be saved. Check dates, targets and amounts, then retry. Choose times outside daylight-saving clock changes. If access changed, sign in again. Your unchanged retry is safe.",
      );
    } finally {
      setPending(false);
    }
  }
  const weeklyFields = (prefix: string, label: string) => (
    <div className="field-pair">
      <label>
        {label} day
        <select required name={`${prefix}Day`} defaultValue="3">
          {days.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label>
        {label} time
        <input
          required
          type="time"
          name={`${prefix}Time`}
          defaultValue="12:00"
        />
      </label>
    </div>
  );
  const targetFields = (period: string, label: string) => (
    <fieldset disabled={pending}>
      <legend>{label} competition targets</legend>
      <div className="field-pair">
        <label>
          {label} impressions target
          <input
            required
            name={`${period}Impressions`}
            type="number"
            min="1"
            step="1"
          />
        </label>
        <label>
          {label} total clicks target
          <input
            required
            name={`${period}Clicks`}
            type="number"
            min="1"
            step="1"
          />
        </label>
      </div>
      <label>
        {label} fundraising target USD
        <input
          required
          name={`${period}Fundraising`}
          type="number"
          min="0.01"
          step="0.01"
        />
      </label>
    </fieldset>
  );
  return (
    <main className="preview-layout campaign-setup">
      <p className="eyebrow">{workspace.name} / Campaign setup</p>
      <h1>
        {saved ? "Campaign rules are locked." : "Set your campaign rules."}
      </h1>
      <p>
        USD · America/Chicago · Manager access
        {workspace.isAdministrator
          ? " · Platform administrator"
          : " · No platform administrator authority"}
      </p>
      <p>
        Rules lock immediately when created, before invitations. Batch
        preparation always runs Wednesday at noon Chicago time.
      </p>
      <p>
        Dates use Chicago time. Start is included; end is excluded. The earning
        window may extend beyond competition dates.
      </p>
      {saved ? (
        <section className="panel" aria-label="Locked campaign rules">
          <h2>Saved campaign · version {saved.version}</h2>
          <dl className="rules-summary">
            <dt>Campaign dates</dt>
            <dd>
              {timestamp(Date.parse(saved.rules.campaignStart))} until{" "}
              {timestamp(Date.parse(saved.rules.campaignEnd))} (exclusive)
            </dd>
            <dt>Earning window</dt>
            <dd>
              {timestamp(Date.parse(saved.rules.earningStart))} until{" "}
              {timestamp(Date.parse(saved.rules.earningEnd))} (exclusive)
            </dd>
            <dt>Fundraising commission</dt>
            <dd>{saved.rules.commissionBasisPoints / 100}%</dd>
            <dt>Daily targets</dt>
            <dd>
              {saved.rules.dailyTargets.impressions} impressions ·{" "}
              {saved.rules.dailyTargets.totalClicks} total clicks ·{" "}
              {money(saved.rules.dailyTargets.fundraisingCents)} fundraising
            </dd>
            <dt>Weekly targets</dt>
            <dd>
              {saved.rules.weeklyTargets.impressions} impressions ·{" "}
              {saved.rules.weeklyTargets.totalClicks} total clicks ·{" "}
              {money(saved.rules.weeklyTargets.fundraisingCents)} fundraising
            </dd>
            <dt>Daily prize</dt>
            <dd>
              {money(saved.rules.dailyPrizeCents)} at{" "}
              {saved.rules.dailyPrizeTime}
            </dd>
            <dt>Weekly prize</dt>
            <dd>
              {money(saved.rules.weeklyPrizeCents)} ·{" "}
              {days[saved.rules.weeklyPrizeSchedule.weekday]}{" "}
              {saved.rules.weeklyPrizeSchedule.time}
            </dd>
            <dt>Weekly replenishment</dt>
            <dd>
              {money(saved.rules.weeklyReplenishmentCents)} ·{" "}
              {days[saved.rules.weeklyReplenishmentSchedule.weekday]}{" "}
              {saved.rules.weeklyReplenishmentSchedule.time}
            </dd>
            <dt>Creator payment batch</dt>
            <dd>
              {days[saved.rules.creatorPaymentSchedule.weekday]}{" "}
              {saved.rules.creatorPaymentSchedule.time}
            </dd>
            <dt>Batch preparation</dt>
            <dd>Wednesday 12:00 America/Chicago</dd>
            <dt>Creation audit</dt>
            <dd>
              {saved.actor} · {saved.source} · {timestamp(saved.createdAt)} ·{" "}
              {saved.acceptedTermsVersion}
            </dd>
          </dl>
          <p role="status">Saved and locked. These rules cannot be edited.</p>
        </section>
      ) : (
        <form className="panel" onSubmit={submit}>
          <fieldset disabled={pending}>
            <legend>Campaign and earnings</legend>
            <div className="field-pair">
              <label>
                Campaign start
                <input required type="datetime-local" name="campaignStart" />
              </label>
              <label>
                Campaign end
                <input required type="datetime-local" name="campaignEnd" />
              </label>
            </div>
            <div className="field-pair">
              <label>
                Earning start
                <input required type="datetime-local" name="earningStart" />
              </label>
              <label>
                Earning end
                <input required type="datetime-local" name="earningEnd" />
              </label>
            </div>
            <label>
              Commission percent
              <input
                required
                type="number"
                min="0"
                max="100"
                step="0.01"
                name="commission"
              />
            </label>
          </fieldset>
          {targetFields("daily", "Daily")}
          {targetFields("weekly", "Weekly")}
          <fieldset disabled={pending}>
            <legend>Fixed prizes and schedules · Chicago time</legend>
            <label>
              Daily prize USD
              <input
                required
                type="number"
                min="0"
                step="0.01"
                name="dailyPrize"
              />
            </label>
            <label>
              Daily prize time
              <input required type="time" name="dailyPrizeTime" />
            </label>
            <label>
              Weekly prize USD
              <input
                required
                type="number"
                min="0"
                step="0.01"
                name="weeklyPrize"
              />
            </label>
            {weeklyFields("prize", "Weekly prize")}
            <label>
              Weekly replenishment USD
              <input
                required
                type="number"
                min="0"
                step="0.01"
                name="replenishment"
              />
            </label>
            {weeklyFields("replenishment", "Replenishment")}
            {weeklyFields("payment", "Creator payment")}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Saving…" : "Create and lock campaign"}
          </button>
        </form>
      )}
    </main>
  );
}
