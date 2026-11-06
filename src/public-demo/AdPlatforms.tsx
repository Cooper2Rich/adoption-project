import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Link2, Play, Settings2, Unplug } from "lucide-react";
import { api } from "../api";
import { useWorkspace } from "../context";
import { Modal } from "../components/ui";
import { money } from "./catalog";
import {
  adPlatforms,
  demoAdAccounts,
  demoAdTargets,
  platformNames,
  type AdPlatform,
  type CampaignAdSetup,
} from "./ad-platforms";
import "./ad-platforms.css";
import { CompletedAdSpend } from "./CompletedAdSpend";
import { CampaignBudgetBreakdown } from "./CampaignBudgetBreakdown";
import { useFinancialSamples } from "./FinancialSamples";

export function AdPlatformsPage({
  embedded = false,
  onSetupChange,
}: {
  embedded?: boolean;
  onSetupChange?: (setup: CampaignAdSetup) => void;
}) {
  const { access, role, campaignScope: campaign } = useWorkspace();
  const [setup, setSetup] = useState<CampaignAdSetup>();
  const { enabled: includeSamples } = useFinancialSamples();
  const [daily, setDaily] = useState("100.00"),
    [cap, setCap] = useState("1000.00");
  const [metaPercent, setMetaPercent] = useState("50"),
    [enabled, setEnabled] = useState(false);
  const [connecting, setConnecting] = useState<AdPlatform>();
  const [loadVersion, setLoadVersion] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const base = `/management/campaigns/${campaign?.id}/ad-platforms`;
  function apply(next: CampaignAdSetup) {
    setSetup(next);
    onSetupChange?.(next);
    setDaily((next.rules.dailyLimitCents / 100).toFixed(2));
    setCap((next.rules.campaignLimitCents / 100).toFixed(2));
    setMetaPercent(String(next.rules.metaPercent));
    setEnabled(next.rules.enabled);
  }
  useEffect(() => {
    let current = true;
    setError("");
    void api<CampaignAdSetup>(base, access)
      .then((next) => {
        if (current) apply(next);
      })
      .catch((error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, [base, access, campaign?.status, loadVersion]);
  if (role !== "admin") return <Navigate to="/projects" replace />;
  if (!campaign) return <Navigate to="/campaigns" replace />;
  const archived = campaign.status === "archived";
  const locked = busy || archived;
  const preview =
    setup?.preview &&
    (setup.preview.includesSampleSpend ?? false) === includeSamples
      ? setup.preview
      : undefined;
  const dirty =
    !!setup &&
    (cents(daily) !== setup.rules.dailyLimitCents ||
      cents(cap) !== setup.rules.campaignLimitCents ||
      Number(metaPercent) !== setup.rules.metaPercent ||
      enabled !== setup.rules.enabled);
  async function mutate(action: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      apply(
        await api<CampaignAdSetup>(`${base}/${action}`, access, "POST", body),
      );
      setMessage(success);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function cents(value: string) {
    return /^\d+(\.\d{1,2})?$/.test(value)
      ? Math.round(Number(value) * 100)
      : NaN;
  }
  async function saveRules(event: FormEvent) {
    event.preventDefault();
    await mutate(
      "rules",
      {
        enabled,
        dailyLimitCents: cents(daily),
        campaignLimitCents: cents(cap),
        metaPercent: Number(metaPercent),
      },
      "Spending rules saved for this campaign. Demo only.",
    );
  }
  return (
    <section className="ad-platform-page">
      {!embedded && (
        <div className="page-heading">
          <div>
            <h1>Ad platforms.</h1>
            <p>Connect campaign destinations and plan automatic ad spending.</p>
          </div>
          <Link2 size={28} />
        </div>
      )}
      {!embedded && (
        <p className="ad-platform-notice">
          Demo setup · Accounts and allocations below are fictional. No Meta or
          TikTok authorization, ad purchases or background spending occurs.
        </p>
      )}
      {error && !connecting && (
        <p className="ad-platform-error" role="alert">
          {error}
        </p>
      )}
      <p className="ad-platform-message" role="status">
        {message}
      </p>
      {!setup ? (
        error ? (
          <button
            className="button secondary"
            onClick={() => setLoadVersion((value) => value + 1)}
          >
            Retry loading connections
          </button>
        ) : (
          <p>Loading campaign connections…</p>
        )
      ) : (
        <>
          {!embedded && (
            <div className="ad-platform-cards">
              {adPlatforms.map((provider) => {
                const connection = setup.connections[provider];
                return (
                  <section
                    className="ad-platform-card"
                    key={provider}
                    aria-labelledby={`${provider}-heading`}
                  >
                    <div className="ad-platform-card-heading">
                      <span
                        className={`ad-platform-mark ${provider}`}
                        aria-hidden="true"
                      >
                        {provider === "meta" ? "∞" : "♪"}
                      </span>
                      <div>
                        <h2 id={`${provider}-heading`}>
                          {platformNames[provider]}
                        </h2>
                        <p>
                          {provider === "meta"
                            ? "Facebook & Instagram"
                            : "TikTok Ads Manager"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`ad-platform-state ${connection ? "selected" : ""}`}
                    >
                      {connection ? "Demo account selected" : "Not connected"}
                    </span>
                    {connection ? (
                      <dl>
                        <dt>Ad account · USD</dt>
                        <dd>{connection.accountName}</dd>
                        <dt>Target campaign</dt>
                        <dd>{connection.targetName}</dd>
                      </dl>
                    ) : (
                      <p className="ad-platform-card-copy">
                        Choose a fictional ad account and target campaign to
                        explore the spending flow.
                      </p>
                    )}
                    <div className="ad-platform-card-actions">
                      <button
                        className="button secondary"
                        disabled={locked}
                        onClick={() => {
                          setError("");
                          setConnecting(provider);
                        }}
                      >
                        <Link2 size={15} />
                        {connection
                          ? "Change demo connection"
                          : `Connect ${platformNames[provider]} (demo)`}
                      </button>
                      {connection && (
                        <button
                          className="text-button"
                          disabled={locked}
                          onClick={() =>
                            void mutate(
                              "disconnect",
                              { platform: provider },
                              `${platformNames[provider]} disconnected. Demo automation paused.`,
                            )
                          }
                        >
                          <Unplug size={14} />
                          Disconnect {platformNames[provider]}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {!embedded && (
            <CampaignBudgetBreakdown
              rules={setup.rules}
              connections={setup.connections}
            />
          )}
          <form className="ad-platform-panel" onSubmit={saveRules}>
            <div className="ad-platform-section-heading">
              <Settings2 size={20} />
              <div>
                <h2>
                  {embedded
                    ? "Ad spend allocation"
                    : "Automatic spending rules"}
                </h2>
                <p>
                  Choose daily limits and how the budget is shared between
                  platforms.
                </p>
              </div>
              <span className="ad-platform-state">
                {setup.rules.enabled ? "Enabled for previews" : "Paused"}
              </span>
            </div>
            {embedded && (
              <p className="ad-platform-help">
                Set allocation here for this campaign.{" "}
                <Link to={`/campaigns/${campaign.id}/ad-platforms`}>
                  Configure Meta and TikTok connections ↗
                </Link>{" "}
                before enabling automation.
              </p>
            )}
            <fieldset disabled={locked} className="ad-platform-fields">
              <label>
                Daily limit (USD)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                />
              </label>
              <label>
                Campaign cap (USD)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                />
              </label>
              <label>
                Meta allocation (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={metaPercent}
                  onChange={(e) => setMetaPercent(e.target.value)}
                />
              </label>
              <div className="ad-platform-derived">
                <span>TikTok allocation</span>
                <strong>
                  {Math.max(0, Math.min(100, 100 - Number(metaPercent)))}%
                </strong>
                <small>The remaining share of the budget.</small>
              </div>
            </fieldset>
            <label className="ad-platform-toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={locked}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Enable demo automation for this campaign</span>
            </label>
            <p className="ad-platform-help">
              The budget is a planning amount, not a verified account balance or
              a withdrawal from contributions. Each preview splits one daily
              allocation equally among eligible creatives. TikTok uses videos
              only. Unused shares stay unallocated.
            </p>
            <div className="ad-platform-form-actions">
              <button className="button primary" disabled={locked || !dirty}>
                Save spending rules
              </button>
              {setup.rules.enabled && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={locked}
                  onClick={() =>
                    void mutate(
                      "rules",
                      { ...setup.rules, enabled: false },
                      "Demo automation paused.",
                    )
                  }
                >
                  Pause demo automation
                </button>
              )}
              <span>
                {dirty
                  ? "Unsaved rule changes"
                  : "Settings saved on this browser"}
              </span>
            </div>
          </form>
          <section
            className="ad-platform-panel"
            aria-labelledby="allocation-preview"
          >
            <div className="ad-platform-section-heading">
              <Play size={20} />
              <div>
                <h2 id="allocation-preview">Allocation preview</h2>
                <p>
                  See the next planned daily allocation before a live
                  integration is available.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={locked || dirty || !setup.rules.enabled}
                onClick={() =>
                  void mutate(
                    "preview",
                    { includeSamples },
                    "Allocation preview updated. No ad spend was placed.",
                  )
                }
              >
                Preview next allocation
              </button>
            </div>
            <div className="ad-platform-summary">
              <div>
                <small>Daily limit</small>
                <strong>{money(setup.rules.dailyLimitCents)}</strong>
              </div>
              <div>
                <small>Campaign cap</small>
                <strong>{money(setup.rules.campaignLimitCents)}</strong>
              </div>
              <div>
                <small>Actual platform spend</small>
                <strong>$0.00</strong>
              </div>
            </div>
            {preview ? (
              <>
                <p className="ad-platform-help">
                  Last preview: {new Date(preview.at).toLocaleString()}.
                  Repeating a preview does not consume the budget.
                </p>
                <div className="ad-platform-preview-totals">
                  <span>
                    Planned: <strong>{money(preview.plannedCents)}</strong>
                  </span>
                  <span>
                    Unallocated:{" "}
                    <strong>{money(preview.unallocatedCents)}</strong>
                  </span>
                </div>
                {preview.notes.map((note) => (
                  <p className="info-banner" key={note}>
                    {note}
                  </p>
                ))}
                {!!preview.rows.length && (
                  <div className="ad-platform-table">
                    <table>
                      <caption className="sr-only">
                        Demo allocations by platform and creative
                      </caption>
                      <thead>
                        <tr>
                          <th>Platform</th>
                          <th>Creative</th>
                          <th>Planned amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={`${row.platform}-${row.adId}`}>
                            <td>{platformNames[row.platform]}</td>
                            <td>{row.title}</td>
                            <td>{money(row.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="ad-platform-help">
                Connect the platforms receiving a budget share, enable and save
                the rules, then run a preview. Draft, held, withdrawn and
                inactive creatives are excluded. Run a fresh preview after
                changing sample visibility.
              </p>
            )}
          </section>
          {!embedded && <CompletedAdSpend />}
          {!embedded && (
            <details className="ad-platform-panel ad-platform-live">
              <summary>What changes when live connections are added?</summary>
              <p>
                A live setup will authorize each advertiser account, verify
                access and available budget, map the campaign’s creatives, and
                use a server to apply and reconcile spending. adoption.is
                eligibility does not replace platform ad review.
              </p>
              <div>
                <a
                  href="https://developers.facebook.com/docs/marketing-apis/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Meta Marketing API ↗
                </a>
                <a
                  href="https://business-api.tiktok.com/portal/docs/marketing-api/v2.0"
                  target="_blank"
                  rel="noreferrer"
                >
                  TikTok Marketing API ↗
                </a>
              </div>
            </details>
          )}
        </>
      )}
      {connecting && (
        <ConnectionDialog
          key={connecting}
          provider={connecting}
          busy={busy}
          error={error}
          onClose={() => setConnecting(undefined)}
          onConnect={async (account, target) => {
            if (
              await mutate(
                "connect",
                { platform: connecting, account, target },
                `${platformNames[connecting]} demo connection saved. Review and enable spending rules next.`,
              )
            )
              setConnecting(undefined);
          }}
        />
      )}
    </section>
  );
}

function ConnectionDialog({
  provider,
  busy,
  error,
  onClose,
  onConnect,
}: {
  provider: AdPlatform;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConnect: (account: string, target: string) => Promise<void>;
}) {
  const { campaignScope: campaign } = useWorkspace();
  const [account, setAccount] = useState("organization"),
    [target, setTarget] = useState("traffic");
  return (
    <Modal
      title={`Connect ${platformNames[provider]} (demo)`}
      subtitle={campaign!.name}
      onClose={onClose}
    >
      <form
        className="form-content"
        onSubmit={(event) => {
          event.preventDefault();
          void onConnect(account, target);
        }}
      >
        <p>
          Explore account selection with fictional USD accounts. This does not
          sign in to {platformNames[provider]} or grant adoption.is
          advertising access.
        </p>
        <label>
          {platformNames[provider]} demo ad account
          <select
            disabled={busy}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            {demoAdAccounts(campaign!, provider).map((item) => (
              <option value={item.key} key={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {platformNames[provider]} target campaign
          <select
            disabled={busy}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {demoAdTargets(campaign!, provider).map((item) => (
              <option value={item.key} key={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save demo connection"}
        </button>
      </form>
    </Modal>
  );
}
