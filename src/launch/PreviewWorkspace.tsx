import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { previewApi } from "./api.ts";
import { DraftForm } from "./DraftForm.tsx";
import { timestamp } from "./format.ts";
import { PreviewPlan } from "./PreviewPlan.tsx";

export function PreviewWorkspace() {
  const campaignId = "adoption";
  const campaign = useQuery(previewApi.campaign, { campaignId });
  const previews = useQuery(previewApi.list, { campaignId });
  const incidents = useQuery(previewApi.incidents, { campaignId });
  const save = useMutation(previewApi.save);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    previews?.find((record) => record._id === selectedId) ?? previews?.[0];
  if (!campaign || !previews || !incidents)
    return (
      <main className="setup-message" role="status">
        Loading your campaign…
      </main>
    );

  return (
    <>
      <div className="preview-notice">
        Isolated preview workspace · synthetic campaign data · saving reserves
        no money or ad slots
      </div>
      <header className="preview-header">
        <a className="wordmark" href="/">
          adoption<span>.is</span>
        </a>
        <span>Campaign workspace</span>
        <span className="session-label">Campaign manager</span>
      </header>
      <main className="preview-layout">
        <section className="preview-intro">
          <p className="eyebrow">{campaign.name} / Advertising</p>
          <h1>Plan before you spend.</h1>
          <p>
            Explore baseline funding and performance boosts, then save a clear
            record of the proposed allocation.
          </p>
        </section>
        <div className="preview-columns">
          <DraftForm
            campaign={campaign}
            initialInput={previews[0]?.input}
            onSave={async (input, operationId) => {
              const record = await save({ campaignId, operationId, input });
              setSelectedId(record._id);
              return record;
            }}
          />
          <div className="results-column">
            {selected ? (
              <PreviewPlan record={selected} />
            ) : (
              <section className="panel empty-plan">
                <span aria-hidden="true">↗</span>
                <h2>Your allocation, explained.</h2>
                <p>
                  Save a preview to see each entry's baseline, boost and
                  provider shares. Nothing is committed to spend.
                </p>
              </section>
            )}
            <section
              className="panel history-panel"
              aria-labelledby="history-title"
            >
              <div className="panel-heading">
                <h2 id="history-title">Saved previews</h2>
                <span className="tag">{previews.length}</span>
              </div>
              {previews.length ? (
                <ul className="history-list">
                  {previews.map((record, index) => (
                    <li key={record._id}>
                      <button
                        onClick={() => setSelectedId(record._id)}
                        aria-pressed={record._id === selected?._id}
                      >
                        <span>
                          Preview {previews.length - index}
                          <small>
                            {timestamp(record.createdAt)} ·{" "}
                            {record.input.authority.revision}
                          </small>
                        </span>
                        <span>
                          {record.result.status === "ready"
                            ? "Ready"
                            : record.result.status === "boosts-held"
                              ? "Boosts held"
                              : "Blocked"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Your saved calculations will appear here.
                </p>
              )}
            </section>
            {!!incidents.length && (
              <section className="panel" aria-labelledby="incidents-title">
                <h2 id="incidents-title">Simulated operator notifications</h2>
                <ul className="incident-list">
                  {incidents.map((incident) => (
                    <li key={incident._id}>
                      <strong>
                        {incident.status === "open" ? "Open" : "Resolved"}
                      </strong>
                      <p>
                        {incident.reasons.join(" ") ||
                          "The blocking condition has cleared."}
                      </p>
                      {!!incident.incompleteEntryIds.length && (
                        <p>
                          Incomplete entries:{" "}
                          {incident.incompleteEntryIds.join(", ")}
                        </p>
                      )}
                      <small>
                        Recipients: {incident.recipients.join(", ")} ·{" "}
                        {incident.history.length} recorded updates · no email
                        sent
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
