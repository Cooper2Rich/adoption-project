import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { incidentApi, type OperatorIncident } from "./incident-api.ts";
import { timestamp } from "./format.ts";
function deliveryLabel(state: string) {
  return state === "failed"
    ? "Email delivery failed"
    : state === "accepted"
      ? "Provider accepted; awaiting delivery confirmation"
      : state === "delivered"
        ? "Recipient mail server accepted"
        : state === "unknown" || state === "sending"
          ? "Send outcome uncertain; reconciliation pending"
          : state === "held"
            ? "Email held for review"
            : "Email queued / retry scheduled";
}
function IncidentCard({ incident }: { incident: OperatorIncident }) {
  return (
    <article
      className="panel operator-incident"
      data-testid={`incident-${incident.key}`}
    >
      <div className="panel-heading">
        <h2>{incident.kind.replaceAll("-", " ")}</h2>
        <strong>{incident.status === "open" ? "Open" : "Resolved"}</strong>
      </div>
      <p>{incident.reason}</p>
      <p>Resolution role: {incident.resolutionRole.replaceAll("-", " ")}</p>
      <p className="muted">
        Detected {timestamp(incident.detectedAt)} · Updated{" "}
        {timestamp(incident.updatedAt)}
      </p>
      {incident.synthetic ? (
        <p className="tag">
          Controlled verification incident · unvalidated email transport
        </p>
      ) : null}
      {incident.notices.map((notice) => (
        <section key={notice.id} aria-label={`${notice.kind} notice`}>
          <h3>
            {notice.kind === "recovery"
              ? "Recovery notice"
              : "Detection notice"}
          </h3>
          {notice.hold ? <p role="status">{notice.hold}</p> : null}
          {notice.emails.length ? (
            <ul>
              {notice.emails.map((email) => (
                <li key={email.id}>
                  <strong>
                    {email.recipientRole}: {deliveryLabel(email.state)}
                  </strong>
                  {email.hold ? <p>{email.hold}</p> : null}
                  {email.state === "pending" ? (
                    <p>Next attempt: {timestamp(email.nextAt)}</p>
                  ) : null}
                  <p>
                    {email.attempts.length} journaled attempts ·{" "}
                    {email.failures} confirmed failures
                  </p>
                  <details>
                    <summary>Delivery attempts</summary>
                    <ol>
                      {email.attempts.map((attempt) => (
                        <li key={attempt.id}>
                          Attempt {attempt.ordinal + 1}: {attempt.state} ·
                          Started {timestamp(attempt.sendStartedAt)} ·{" "}
                          {attempt.transportCalls} transport calls ·{" "}
                          {attempt.source}{" "}
                          {attempt.providerEvent
                            ? `· Provider event: ${attempt.providerEvent}`
                            : ""}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p>Email waiting for verified recipient configuration.</p>
          )}
        </section>
      ))}
      <details>
        <summary>
          Source and incident history ({incident.evidence.length})
        </summary>
        <p>
          Original source: {incident.producer} · Evidence:{" "}
          {incident.originalEvidence} · Version {incident.version}
        </p>
        <ol>
          {incident.evidence.map((event) => (
            <li key={event._id}>
              {event.active ? "Observed problem" : "Observed recovery"}:{" "}
              {event.reason} · {timestamp(event.at)} · {event.actor} /{" "}
              {event.source} · sequence {event.sequence} · evidence{" "}
              {event.evidence}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
export function OperatorIncidents() {
  const scope = { campaignId: "adoption" };
  const incidents = useQuery(incidentApi.list, scope);
  const register = useMutation(incidentApi.register),
    configure = useMutation(incidentApi.configure),
    resume = useMutation(incidentApi.resume);
  const [designated, setDesignated] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch {
      setMessage(
        "The change could not be saved. Check your current campaign permission, verified Clerk email and designated active operator identity.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="operator-incidents">
      <section className="preview-intro">
        <p className="eyebrow">Campaign operations</p>
        <h1>Operator incidents</h1>
        <p>
          Problems stay visible until trusted source evidence confirms recovery.
          Email delivery does not resolve an incident.
        </p>
      </section>
      <section className="panel">
        <h2>Notification recipients</h2>
        <p>
          Each operator registers their own verified Clerk email. Selected
          operational blocks also notify active platform administrators and the
          designated operator.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void perform(
              () => register(scope),
              "Your verified email is registered.",
            )
          }
        >
          Register my verified email
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(
              () =>
                configure({ ...scope, designatedOperator: designated.trim() }),
              "Designated operator saved.",
            );
          }}
        >
          <label htmlFor="designated-operator">
            Designated platform operator identity
          </label>
          <input
            id="designated-operator"
            value={designated}
            onChange={(event) => setDesignated(event.target.value)}
            required
            maxLength={128}
          />
          <button disabled={busy || !designated.trim()}>
            Save designated operator
          </button>
        </form>
        <button
          disabled={busy}
          onClick={() =>
            void perform(
              () => resume(scope),
              "Unsent notices scheduled for configuration review.",
            )
          }
        >
          Resume unsent notices after configuration repair
        </button>
        <p role="status">{message}</p>
        <p className="muted">
          Email sending requires verified provider and sender setup. Provider
          acceptance is separate from recipient mail-server acceptance; neither
          guarantees inbox placement.
        </p>
      </section>
      {incidents === undefined ? (
        <p role="status">Loading incidents…</p>
      ) : incidents.length ? (
        incidents.map((incident) => (
          <IncidentCard key={incident._id} incident={incident} />
        ))
      ) : (
        <section className="panel">
          <h2>No recorded incidents</h2>
          <p>
            Monitoring coverage and provider validation remain separate launch
            requirements.
          </p>
        </section>
      )}
    </main>
  );
}
