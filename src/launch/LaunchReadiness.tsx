import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { readinessApi } from "./readiness-api.ts";
import { timestamp } from "./format.ts";

export function LaunchReadiness() {
  const data = useQuery(readinessApi.read, { campaignId: "adoption" });
  const evaluate = useMutation(readinessApi.evaluate),
    check = useMutation(readinessApi.check);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Opening this intended workspace detects and persists blockers; the query
    // itself stays read-only. Server-side checks independently reevaluate.
    void evaluate({ campaignId: "adoption" }).catch(() =>
      setMessage(
        "Readiness evaluation could not be saved. Reconnect with current campaign permission.",
      ),
    );
  }, [evaluate]);
  async function perform(activation: boolean) {
    setBusy(true);
    try {
      if (activation) {
        const result = await check({
          campaignId: "adoption",
          expectedRevision: data?.revision,
        });
        setMessage(
          `Paid activation denied. ${result.denial}. Current blockers remain recorded.`,
        );
      } else {
        await evaluate({ campaignId: "adoption" });
        setMessage(
          "Current readiness evaluated. Unmet required conditions remain recorded as operator incidents.",
        );
      }
    } catch {
      setMessage(
        "Readiness could not be saved. Check your current campaign permission and reconnect.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="launch-readiness">
      <section className="preview-intro">
        <p className="eyebrow">Campaign operations</p>
        <h1>Launch readiness</h1>
        <p>
          Required approvals and evidence stay visible until their trusted
          validators confirm the current campaign scope. Email delivery never
          clears a blocker.
        </p>
      </section>
      <section className="panel">
        <h2>Paid activation blocked</h2>
        <p>
          {data?.capabilityReason ?? "Loading current campaign prerequisites…"}
        </p>
        {data?.synthetic ? (
          <p className="tag">
            Controlled verification only · evidence is unvalidated and cannot
            authorize production activation
          </p>
        ) : null}
        <button disabled={busy} onClick={() => void perform(false)}>
          Evaluate current readiness
        </button>{" "}
        <button disabled={busy || !data} onClick={() => void perform(true)}>
          Check paid activation
        </button>
        <p role="status">{message}</p>
        <p>
          <a href="#readiness-permitted">Permitted prelaunch activity</a> · Use
          Operator incidents to review notification recipients and delivery.
        </p>
      </section>
      {!data ? (
        <p role="status">Loading readiness…</p>
      ) : (
        <>
          <section className="panel" id="readiness-permitted">
            <h2>Permitted prelaunch activity</h2>
            <p>{data.prelaunch}.</p>
            <p>
              Advertising crowdfunding eligibility:{" "}
              <strong>{data.collection.eligibility}</strong>.{" "}
              {data.collection.reason}.
            </p>
            <p>
              A balance, terms acceptance, research closure or successful
              controlled test does not establish provider approval. Unsupported
              routes require a reviewed decision.
            </p>
          </section>
          {["PG-01", "PG-02", "PG-03", "PG-04", "PG-05", "PG-06"].map(
            (gate) => (
              <section
                className="panel readiness-gate"
                key={gate}
                data-testid={`gate-${gate}`}
              >
                <h2>{gate}</h2>
                {data.components
                  .filter((c) => c.gate === gate)
                  .map((component) => (
                    <article
                      key={component.id}
                      className="readiness-component"
                      data-testid={`readiness-${component.id}`}
                    >
                      <h3>{component.title}</h3>
                      <p>
                        <strong>
                          {component.status === "unvalidated"
                            ? "Controlled pass · unvalidated"
                            : component.status === "approved"
                              ? "Approved"
                              : component.status === "not-applicable"
                                ? "Not selected in current scope"
                                : "Unmet"}
                        </strong>
                      </p>
                      <p>
                        {component.reason ??
                          "Current evidence is recorded for this scope."}
                      </p>
                      <p>Owner: {component.owner ?? "Unassigned"}</p>
                      <p>
                        Resolution role:{" "}
                        {component.resolutionRole === "manager"
                          ? "campaign manager or platform administrator"
                          : "platform administrator"}
                      </p>
                      <p>
                        Scope: {component.scope.nonprofitId} /{" "}
                        {component.scope.campaignId} / {component.scope.account}
                      </p>
                      <details>
                        <summary>Scope and evidence</summary>
                        <p>Revision: {component.scope.revision}</p>
                        {component.scope.releaseTarget ? (
                          <p>
                            Build and environment verification target:{" "}
                            {component.scope.releaseTarget}
                          </p>
                        ) : null}
                        <p>
                          Account binding:{" "}
                          {component.scope.accountBinding ?? "Unconfigured"}
                        </p>
                        {component.evidence ? (
                          <>
                            <p>Evidence digest: {component.evidence.digest}</p>
                            <p>
                              Reviewed owner: {component.evidence.reviewer} ·
                              Actor: {component.evidence.actor} · Source:{" "}
                              {component.evidence.source}
                            </p>
                            <p>
                              Observed{" "}
                              {timestamp(component.evidence.observedAt)} ·
                              Expires {timestamp(component.evidence.expiresAt)}{" "}
                              · Sequence {component.evidence.sequence} · Version{" "}
                              {component.evidence.version}
                            </p>
                            {component.evidence.values ? (
                              <p>
                                Verified available / required cents:{" "}
                                {component.evidence.values.availableCents} /{" "}
                                {component.evidence.values.requiredCents}
                              </p>
                            ) : null}
                            {component.evidence.safety ? (
                              <p>
                                Reviewed reserve cents:{" "}
                                {component.evidence.safety.reserveCents} ·
                                Freshness milliseconds:{" "}
                                {component.evidence.safety.freshnessMs} ·
                                Release rule digest:{" "}
                                {component.evidence.safety.releaseRuleDigest}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p>
                            No trusted evidence. Provider environment
                            configuration alone does not approve this
                            prerequisite.
                          </p>
                        )}
                        <p>
                          Recorded blocker:{" "}
                          {data.blockers.find(
                            (b) => b.component === component.id,
                          )?.active
                            ? "Open"
                            : data.blockers.some(
                                  (b) => b.component === component.id,
                                )
                              ? "Resolved / not required"
                              : "Evaluation pending"}
                        </p>
                      </details>
                    </article>
                  ))}
              </section>
            ),
          )}
          <section className="panel">
            <h2>Readiness audit</h2>
            <p>
              Current scope configuration version: {data.configurationVersion}
            </p>
            <p>
              Current trusted release target:{" "}
              {data.releaseTarget?.binding ??
                "Missing; production acceptance remains held"}
            </p>
            <details>
              <summary>
                Validation evidence history ({data.evidenceHistory.length})
              </summary>
              <ol>
                {data.evidenceHistory.map((proof) => (
                  <li key={proof._id}>
                    {proof.component}: {proof.outcome} ·{" "}
                    {proof.synthetic
                      ? "Controlled / unvalidated"
                      : "Trusted validator"}{" "}
                    · {proof.digest} · Reviewed owner {proof.reviewer} ·{" "}
                    {proof.actor} / {proof.source} · Observed{" "}
                    {timestamp(proof.observedAt)} · Recorded{" "}
                    {timestamp(proof.at)} · Sequence {proof.sequence} · Version{" "}
                    {proof.version}
                  </li>
                ))}
              </ol>
            </details>
            <details>
              <summary>
                Actor, source and version history ({data.audit.length})
              </summary>
              <ol>
                {data.audit.map((event) => (
                  <li key={event._id}>
                    {event.action} · {event.actor} · {event.source} ·{" "}
                    {timestamp(event.at)} · Version {event.version}
                    <details>
                      <summary>Recorded scope and reasons</summary>
                      <p>{event.revision}</p>
                      <pre>{event.details}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          </section>
        </>
      )}
    </main>
  );
}
