import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { campaign, creatorApi } from "./creator-api.ts";
import { timestamp } from "./format.ts";
import { CreatorPhotos } from "./Photos.tsx";
import { CreatorVideos } from "./Videos.tsx";

export function CreatorInvitations() {
  const invitations = useQuery(creatorApi.manager, campaign);
  const history = useQuery(creatorApi.history, campaign);
  const invite = useMutation(creatorApi.invite);
  const revoke = useMutation(creatorApi.revoke);
  const dispatch = useAction(creatorApi.dispatch);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const operation = useRef<{ email: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    if (operation.current?.email !== email)
      operation.current = { email, id: crypto.randomUUID() };
    try {
      const saved = await invite({
        ...campaign,
        email,
        operationId: operation.current.id,
      });
      const result = await dispatch({
        ...campaign,
        invitationId: saved._id,
        kind: "create",
      });
      setMessage(
        result.state === "confirmed"
          ? "Clerk invitation confirmed. Only the invited identity can enter."
          : `Clerk invitation ${result.state}. Access remains blocked; retry the saved invitation to reconcile.`,
      );
    } catch {
      setMessage(
        "Invitation could not be saved. Lock campaign rules first, check the email and retry. An existing invitation stays unchanged.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="preview-layout campaign-setup">
      <p className="eyebrow">adoption.is / Creator invitations</p>
      <h1>Invite your creators.</h1>
      <p>
        Access belongs to the invited verified email identity. Revocation
        immediately removes application access.
      </p>
      <form className="panel" onSubmit={submit}>
        <label>
          Invited email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="primary-button" disabled={pending}>
          Save invitation
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <section className="panel" aria-label="Creator invitations">
        <h2>Current invitations</h2>
        {!invitations ? (
          <p>Loading…</p>
        ) : invitations.length === 0 ? (
          <p>No creators invited yet.</p>
        ) : (
          invitations.map((i) => (
            <article key={i._id}>
              <h3>{i.email}</h3>
              {history
                ?.filter((row) => row.invitationId === i._id)
                .map((row) => (
                  <p key={row.kind}>
                    Clerk {row.kind}: {row.state} · {timestamp(row.updatedAt)}
                  </p>
                ))}
              <p>
                {i.active ? "Invited" : "Revoked"} · Clerk {i.providerState}
                {i.subject ? " · Identity bound" : " · Awaiting acceptance"}
              </p>
              {!i.active && (
                <button
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      const result = await dispatch({
                        ...campaign,
                        invitationId: i._id,
                        kind: "revoke",
                      });
                      setMessage(
                        `Creator access revoked. Clerk revocation: ${result.state}.`,
                      );
                    } catch {
                      setMessage(
                        "Clerk revocation is unconfirmed. Application access remains revoked; retry to reconcile.",
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Check Clerk revocation
                </button>
              )}
              {i.active && (
                <>
                  <button
                    disabled={pending}
                    onClick={async () => {
                      setPending(true);
                      try {
                        const result = await dispatch({
                          ...campaign,
                          invitationId: i._id,
                          kind: "create",
                        });
                        setMessage(`Clerk invitation: ${result.state}.`);
                      } catch {
                        setMessage(
                          "Clerk invitation could not be confirmed. Retry to reconcile.",
                        );
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    Check or retry Clerk invitation
                  </button>
                  <a href={`?workspace=creator&invitation=${i._id}`}>
                    Creator entry link
                  </a>
                  <button
                    disabled={pending}
                    onClick={async () => {
                      setPending(true);
                      try {
                        await revoke({
                          ...campaign,
                          invitationId: i._id,
                          operationId: crypto.randomUUID(),
                        });
                        const result = await dispatch({
                          ...campaign,
                          invitationId: i._id,
                          kind: "revoke",
                        });
                        setMessage(
                          `Creator access revoked. Clerk invitation revocation: ${result.state}.`,
                        );
                      } catch {
                        setMessage(
                          "Revocation could not be confirmed. Retry to check current access.",
                        );
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    Revoke {i.email}
                  </button>
                </>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
function PrivateStatus() {
  const records = useQuery(creatorApi.records, campaign);
  return (
    <section className="panel" aria-label="Private creator records">
      <h2>Your private status</h2>
      {!records ? (
        <p>Loading private records…</p>
      ) : records.length ? (
        records.map((record) => (
          <p key={record._id}>
            {record.kind}: {record.summary}
          </p>
        ))
      ) : (
        <p>No earnings or payment setup records yet.</p>
      )}
    </section>
  );
}
export function CreatorWorkspace() {
  const invitation = new URLSearchParams(location.search).get("invitation");
  // IDs from a link are validated by Convex; they never authorize a creator.
  const workspace = useQuery(creatorApi.workspace, {
    ...campaign,
    ...(invitation
      ? {
          invitationId:
            invitation as import("../../convex/functions.ts").Doc<"creatorInvitations">["_id"],
        }
      : {}),
  });
  const accept = useMutation(creatorApi.accept);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef(crypto.randomUUID());
  if (!workspace)
    return (
      <main className="setup-message" role="status">
        Loading your invitation…
      </main>
    );
  const { terms, acceptance } = workspace;
  return (
    <main className="preview-layout campaign-setup">
      <p className="eyebrow">{workspace.name} / Private creator workspace</p>
      <h1>
        {acceptance
          ? "Your participation is recorded."
          : "Review participation before joining."}
      </h1>
      <p>Signed in as the invited identity: {workspace.invitation.email}</p>
      {acceptance ? (
        <>
          {!terms && (
            <p role="alert">
              Applicable terms are unavailable. Signup and submission remain
              blocked. Your historical acceptance is retained.
            </p>
          )}
          <section className="panel" aria-label="Participation acceptance">
            <h2>Accepted {acceptance.version}</h2>
            <p>
              {acceptance.subject} · {timestamp(acceptance.acceptedAt)} ·{" "}
              {acceptance.source}
            </p>
            {acceptance.synthetic && (
              <p role="note">
                Synthetic agreement · isolated verification only · no production
                signup.
              </p>
            )}
            <h3>{acceptance.termsTitle}</h3>
            <pre className="terms-body">{acceptance.termsBody}</pre>
          </section>
          <PrivateStatus />
          <CreatorPhotos canSubmit={terms?._id === acceptance.termsId} />
          <CreatorVideos canSubmit={terms?._id === acceptance.termsId} />
        </>
      ) : !terms ? (
        <section className="panel" role="alert">
          <h2>Participation terms unavailable</h2>
          <p>
            The actual applicable agreement has not been supplied. Campaign
            signup and submission are blocked. Ask the campaign manager to
            arrange the approved agreement.
          </p>
          <button disabled>Complete campaign signup</button>
        </section>
      ) : (
        <section className="panel" aria-label="Participation terms">
          <h2>
            {terms.title} · {terms.version}
          </h2>
          {terms.synthetic && (
            <p role="note">
              Synthetic agreement · isolated verification only · no production
              signup.
            </p>
          )}
          <pre className="terms-body">{terms.body}</pre>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I have read and accept this versioned participation agreement.
          </label>
          <button
            className="primary-button"
            disabled={!confirmed || pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await accept({
                  ...campaign,
                  invitationId: workspace.invitation._id,
                  termsId: terms._id,
                  version: terms.version,
                  operationId: operation.current,
                  confirmed,
                });
              } catch {
                setError(
                  "Acceptance could not be confirmed. Check your session and current invitation, then retry. Your unchanged retry is safe.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            Complete campaign signup
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </main>
  );
}
