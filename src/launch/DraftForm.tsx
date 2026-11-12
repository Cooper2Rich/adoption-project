import { useRef, useState, type FormEvent } from "react";
import type { AllocationInput } from "../../convex/allocation/planner.ts";
import type { Campaign, SavedPreview } from "./api";
import { allocationInput } from "./fixture-input";
import { dollars, money } from "./format";

const scenarios = [
  { id: "complete", name: "Complete daily scores" },
  { id: "startup", name: "Healthy startup" },
  { id: "incomplete", name: "Missing new-entry reports" },
  { id: "unknown", name: "Unknown finances" },
  { id: "provider", name: "TikTok unavailable" },
] as const;

export function DraftForm({
  campaign,
  onSave,
  initialInput,
}: {
  campaign: Campaign;
  initialInput?: AllocationInput;
  onSave: (
    input: AllocationInput,
    operationId: string,
  ) => Promise<SavedPreview>;
}) {
  const [draft, setDraft] = useState(() => {
    const input = initialInput ?? allocationInput();
    return {
      baseline: (input.settings.baselineCents / 100).toFixed(2),
      boost: String(input.settings.boostPercent),
      topCount: String(input.settings.topCount),
      meta: String(input.settings.metaPercent),
      available: (input.finance.availableCents / 100).toFixed(2),
      protectedFunding: (
        input.finance.remainingBaselineReserveCents / 100
      ).toFixed(2),
    };
  });
  const [scenario, setScenario] = useState<(typeof scenarios)[number]["id"]>(
    () => {
      if (initialInput?.finance.status === "unknown") return "unknown";
      if (initialInput?.providers.tiktok === "blocked") return "provider";
      if (initialInput?.scoreCoverage === "startup") return "startup";
      if (initialInput?.scoreCoverage === "incomplete") return "incomplete";
      return "complete";
    },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef<{ key: string; operationId: string } | null>(null);
  const update = (field: keyof typeof draft, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const input = allocationInput();
      input.authority = campaign.authority;
      input.settings = {
        ...input.settings,
        baselineCents: dollars(draft.baseline),
        boostPercent: Number(draft.boost),
        topCount: Number(draft.topCount),
        metaPercent: Number(draft.meta),
        tiktokPercent: 100 - Number(draft.meta),
      };
      input.finance.availableCents = dollars(draft.available);
      input.finance.remainingBaselineReserveCents = dollars(
        draft.protectedFunding,
      );
      if (scenario === "startup") {
        input.scoreCoverage = "startup";
        input.entries.forEach(
          (entry) =>
            (entry.metrics = {
              impressions: null,
              clicks: null,
              raisedCents: null,
            }),
        );
      }
      if (scenario === "incomplete") {
        input.scoreCoverage = "incomplete";
        input.entries[3].metrics = {
          impressions: null,
          clicks: null,
          raisedCents: null,
        };
      }
      if (scenario === "unknown") input.finance.status = "unknown";
      if (scenario === "provider") input.providers.tiktok = "blocked";
      const key = JSON.stringify(input);
      if (request.current?.key !== key)
        request.current = { key, operationId: crypto.randomUUID() };
      await onSave(input, request.current.operationId);
      request.current = null;
      setMessage("Preview saved. No money or ad slots reserved.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Preview could not be saved. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <h2 id="settings-title">Draft allocation</h2>
        <span className="tag">Advisory</span>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend>Spending settings</legend>
          <label>
            Daily baseline per funded entry <span>USD</span>
            <input
              inputMode="decimal"
              value={draft.baseline}
              onChange={(event) => update("baseline", event.target.value)}
              required
            />
          </label>
          <div className="field-pair">
            <label>
              Residual boost share <span>%</span>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={draft.boost}
                onChange={(event) => update("boost", event.target.value)}
                required
              />
            </label>
            <label>
              Top entries
              <input
                type="number"
                min="1"
                step="1"
                value={draft.topCount}
                onChange={(event) => update("topCount", event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Meta share{" "}
            <span>% · TikTok receives {100 - Number(draft.meta)}%</span>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              value={draft.meta}
              onChange={(event) => update("meta", event.target.value)}
              required
            />
          </label>
        </fieldset>
        <fieldset disabled={pending}>
          <legend>Illustrative evidence</legend>
          <label>
            Snapshot scenario
            <select
              value={scenario}
              onChange={(event) => {
                const choice = scenarios.find(
                  (item) => item.id === event.target.value,
                );
                if (choice) setScenario(choice.id);
              }}
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Available advertising funds <span>USD</span>
            <input
              inputMode="decimal"
              value={draft.available}
              onChange={(event) => update("available", event.target.value)}
              required
            />
          </label>
          <label>
            Protected full-run baseline <span>USD</span>
            <input
              inputMode="decimal"
              value={draft.protectedFunding}
              onChange={(event) =>
                update("protectedFunding", event.target.value)
              }
              required
            />
          </label>
          <p className="field-help">
            Sample funding and safety settings illustrate the calculation. They
            are not approved live balances or safety values.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save new preview"}
          <span aria-hidden="true">↗</span>
        </button>
        <p role="status" className="save-status">
          {message}
        </p>
      </form>
      <dl className="authority-details">
        <div>
          <dt>Approved daily authority</dt>
          <dd>{money(campaign.authority.dailyLimitCents)}</dd>
        </div>
        <div>
          <dt>Approved campaign authority</dt>
          <dd>{money(campaign.authority.totalLimitCents)}</dd>
        </div>
        <div>
          <dt>Funded ad slots</dt>
          <dd>{campaign.authority.capacity}</dd>
        </div>
        <div>
          <dt>Authority version</dt>
          <dd>{campaign.authority.revision}</dd>
        </div>
      </dl>
    </section>
  );
}
