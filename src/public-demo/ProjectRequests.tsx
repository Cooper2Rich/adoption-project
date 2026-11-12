import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.ts";
import { EmptyState, Modal, dateLabel } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import type { ProjectRequest } from "../types.ts";

export function ProjectRequestForm({ onClose }: { onClose: () => void }) {
  const { access, refresh, notify } = useWorkspace();
  const [requestId] = useState(() => crypto.randomUUID());
  const [data, setData] = useState({
    name: "",
    description: "",
    brief: "",
    category: "Environment",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) =>
    setData((old) => ({ ...old, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/project-requests", access, "POST", { ...data, requestId });
      await refresh();
      notify(
        "Project request sent to Admin for review. No project was activated or charged.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Request new project"
      subtitle="Admin approval required"
      onClose={onClose}
    >
      <form className="form-content" onSubmit={submit}>
        <p className="metrics-note">
          Admin will review your request and assign an approved project to a
          campaign. Pricing is pending; submitting a request creates no charge.
        </p>
        <label>
          Project name
          <input
            required
            maxLength={80}
            value={data.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label>
          Cause
          <select
            aria-label="Cause"
            value={data.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {[
              "Environment",
              "Food & community",
              "Education",
              "Health & wellbeing",
              "Animal welfare",
              "Arts & culture",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          About the project
          <textarea
            required
            maxLength={600}
            value={data.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label>
          Creator brief
          <textarea
            required
            maxLength={1200}
            value={data.brief}
            onChange={(e) => set("brief", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Start date
            <input
              type="date"
              required
              value={data.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              required
              min={data.startDate}
              value={data.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Sending…" : "Send request to Admin"}
        </button>
      </form>
    </Modal>
  );
}

export function ProjectRequestsPage() {
  const { role, projectRequests = [], search } = useWorkspace();
  const [reviewing, setReviewing] = useState<ProjectRequest | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("all");
  if (role === "creator") return <Navigate to="/projects" replace />;
  const visible = projectRequests.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      `${r.name} ${r.ownerName} ${r.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Project requests.</h1>
          <p>
            {role === "admin"
              ? "Review owner requests and assign approved drafts to campaigns."
              : "Track your project requests and Admin’s decisions."}
          </p>
        </div>
        {role === "nonprofit" && (
          <button className="button primary" onClick={() => setCreating(true)}>
            Request new project
          </button>
        )}
      </div>
      <div className="section-toolbar">
        <span className="metrics-note">
          Pricing pending · no charges configured
        </span>
        <select
          aria-label="Filter project requests"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All requests</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
      </div>
      <div className="project-request-list">
        {visible.map((request) => (
          <article className="project-request" key={request.id}>
            <div>
              <span
                className={`badge ${request.status === "approved" ? "approved" : request.status === "declined" ? "rejected" : "pending"}`}
              >
                {request.status === "approved"
                  ? "Approved · draft"
                  : request.status}
              </span>
              <h2>{request.name}</h2>
              <p>{request.description}</p>
              <small>
                {role === "admin" ? `${request.ownerName} · ` : ""}
                {dateLabel(request.createdAt)}
              </small>
              {request.reviewNote && <p>Admin note: {request.reviewNote}</p>}
            </div>
            <div className="request-actions">
              {role === "admin" && request.status === "pending" && (
                <button
                  className="button primary"
                  onClick={() => setReviewing(request)}
                >
                  Review request
                </button>
              )}
              {request.projectId && (
                <Link
                  className="button secondary"
                  to={
                    role === "admin"
                      ? `/campaigns/${request.campaignId}/projects/${request.projectId}`
                      : `/projects/${request.projectId}`
                  }
                >
                  Open project
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <EmptyState
          title="No project requests found."
          description="New requests and their review status appear here."
        />
      )}
      {creating && <ProjectRequestForm onClose={() => setCreating(false)} />}
      {reviewing && (
        <ReviewRequest request={reviewing} onClose={() => setReviewing(null)} />
      )}
    </section>
  );
}

function ReviewRequest({
  request,
  onClose,
}: {
  request: ProjectRequest;
  onClose: () => void;
}) {
  const { managedCampaigns = [], access, refresh, notify } = useWorkspace();
  const available = managedCampaigns.filter(
    (c) =>
      c.ownerOrganizationId === request.ownerOrganizationId &&
      c.status !== "archived",
  );
  const [campaignId, setCampaign] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(decision: "approve" | "decline") {
    setBusy(true);
    setError("");
    try {
      await api(`/project-requests/${request.id}/decision`, access, "POST", {
        decision,
        campaignId,
        note,
      });
      await refresh();
      notify(
        decision === "approve"
          ? "Request approved as a draft. Pricing remains pending; no charge was created."
          : "Request declined with your note.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Review project request"
      subtitle={request.name}
      onClose={onClose}
    >
      <div className="form-content">
        <p>{request.ownerName}</p>
        <p>{request.description}</p>
        <p>
          <strong>Creator brief:</strong> {request.brief}
        </p>
        <p className="metrics-note">
          {request.startDate} – {request.endDate} · {request.category}
        </p>
        <label>
          Assign to campaign
          <select
            aria-label="Assign to campaign"
            value={campaignId}
            onChange={(e) => setCampaign(e.target.value)}
          >
            <option value="">Choose this organization’s campaign</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!available.length && (
          <p>
            No campaign is available for this organization.{" "}
            <Link className="text-button" to="/campaigns">
              Create a campaign first.
            </Link>
          </p>
        )}
        <label>
          Admin note
          <textarea
            maxLength={600}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Required when declining"
          />
        </label>
        <p className="metrics-note">
          Approval creates a draft project only. Project pricing has not been
          set, and no charge or launch is authorized.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="request-actions">
          <button
            className="button primary"
            disabled={busy || !campaignId}
            onClick={() => void decide("approve")}
          >
            Approve as draft
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void decide("decline")}
          >
            Decline request
          </button>
        </div>
      </div>
    </Modal>
  );
}
