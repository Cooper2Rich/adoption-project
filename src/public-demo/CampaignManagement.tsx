import { Archive, ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { api } from "../api.ts";
import { EmptyState, Modal } from "../components/ui.tsx";
import { WorkspaceContext, useWorkspace } from "../context.tsx";
import { CampaignsPage } from "../pages/Campaigns.tsx";
import { PostsPage } from "../pages/Posts.tsx";
import { ProjectDetail } from "../pages/ProjectDetail.tsx";
import { ProjectsPage } from "../pages/Projects.tsx";
import type { DemoOptions } from "../types.ts";
import { AdPlatformsPage } from "./AdPlatforms.tsx";
import { CampaignSpendOverview } from "./CampaignSpendOverview.tsx";
import { ArchivesPage, SpendingPage } from "./WorkspaceViews.tsx";

export function AdminCampaigns({ archived = false }: { archived?: boolean }) {
  const {
    managedCampaigns = [],
    projects,
    role,
    search,
    refresh,
    access,
    notify,
  } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  if (role !== "admin") return <Navigate to="/projects" replace />;
  const campaigns = managedCampaigns
    .filter(
      (c) =>
        (c.status === "archived") === archived &&
        `${c.name} ${c.ownerName}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const projectCounts = new Map(
    campaigns.map((c) => [
      c.id,
      projects.filter((p) => p.campaignId === c.id).length,
    ]),
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{archived ? "Archived campaigns" : "Campaigns"}.</h1>
          <p>
            {archived
              ? "Retained campaigns, projects and funding records."
              : "Open a campaign to manage its projects, creatives and ad spending."}
          </p>
        </div>
        {!archived && (
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={15} />
            New campaign
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="managed-campaign-list">
        {campaigns.map((campaign) => (
          <article className="managed-campaign" key={campaign.id}>
            <Link to={`/campaigns/${campaign.id}`}>
              <div>
                <span className="metrics-note">{campaign.ownerName}</span>
                <h2>{campaign.name}</h2>
                <p>{campaign.description}</p>
              </div>
              <ArrowUpRight size={18} />
            </Link>
            <footer>
              <span>
                {projectCounts.get(campaign.id)}{" "}
                {projectCounts.get(campaign.id) === 1 ? "project" : "projects"}{" "}
                · {campaign.status === "active" ? "Open" : campaign.status}
              </span>
              <Link
                to={`/campaigns/${campaign.id}/ad-platforms`}
                aria-label={`Ad platforms for ${campaign.name}`}
              >
                Ad platforms ↗
              </Link>
              {archived && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await api(
                        `/management/campaigns/${campaign.id}/restore`,
                        access,
                        "POST",
                        {},
                      );
                      await refresh();
                      notify(
                        "Campaign restored with its previous project states.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Restore campaign
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      {!campaigns.length && (
        <EmptyState
          title={archived ? "No archived campaigns." : "No campaigns found."}
          description={
            archived
              ? "Campaigns archived by Admin appear here."
              : "Create a campaign or change your search."
          }
        />
      )}
      {creating && <NewCampaign onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewCampaign({ onClose }: { onClose: () => void }) {
  const { access, refresh, notify } = useWorkspace();
  const [owners, setOwners] = useState<DemoOptions["nonprofits"]>([]);
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<DemoOptions>("/demo-options", access)
      .then((data) => setOwners(data.nonprofits))
      .catch((e) => setError(e.message));
  }, [access]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/management/campaigns", access, "POST", {
        name,
        description,
        ownerOrganizationId: owner,
      });
      await refresh();
      notify("Campaign created. Project pricing remains pending.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="New campaign"
      subtitle="Admin campaign setup"
      onClose={onClose}
    >
      <form className="form-content" onSubmit={submit}>
        <label>
          Campaign name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Organization
          <select
            aria-label="Organization"
            required
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Choose organization</option>
            {owners.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            required
            maxLength={600}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p className="metrics-note">
          Project pricing has not been set. Creating a campaign does not charge
          anyone.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </form>
    </Modal>
  );
}

export function CampaignWorkspace() {
  const context = useWorkspace();
  const { campaignId } = useParams();
  const campaign = context.managedCampaigns?.find((c) => c.id === campaignId);
  const [error, setError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  if (context.role !== "admin") return <Navigate to="/projects" replace />;
  if (!campaign)
    return (
      <EmptyState
        title="Campaign not found."
        description="Choose a campaign from your workspace."
        action={
          <Link to="/campaigns" className="button primary">
            All campaigns
          </Link>
        }
      />
    );
  const projects = context.projects.filter((p) => p.campaignId === campaign.id);
  const ids = new Set(projects.map((p) => p.id));
  const scoped = {
    ...context,
    campaignScope: campaign,
    projects,
    posts: context.posts.filter((p) => ids.has(p.projectId)),
    approvedPosts: context.approvedPosts.filter((p) => ids.has(p.projectId)),
    activity: context.activity.filter(
      (e) => e.projectId && ids.has(e.projectId),
    ),
  };
  return (
    <WorkspaceContext.Provider value={scoped}>
      <div className="campaign-context-heading">
        <div>
          <Link to="/campaigns" className="text-button">
            <ArrowLeft size={14} />
            All campaigns
          </Link>
          <h2>{campaign.name}</h2>
          <p>{campaign.ownerName}</p>
        </div>
        {campaign.status !== "archived" && (
          <button
            className="button secondary"
            onClick={() => setConfirmArchive(true)}
          >
            <Archive size={14} />
            Archive campaign
          </button>
        )}
      </div>
      {campaign.status === "archived" && (
        <p className="info-banner">
          Archived campaign. Restore it from Archived campaigns before changing
          its projects.
        </p>
      )}
      <Routes>
        <Route
          index
          element={
            <>
              <CampaignSpendOverview key={campaign.id} />
              <ProjectsPage campaignId={campaign.id} />
            </>
          }
        />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="creatives" element={<PostsPage mode="all" />} />
        <Route path="spending" element={<SpendingPage />} />
        <Route
          path="ad-platforms"
          element={<AdPlatformsPage key={campaign.id} />}
        />
        <Route path="archives" element={<ArchivesPage />} />
        <Route path="gift-records/:id" element={<ProjectGiftRecords />} />
        <Route
          path="*"
          element={<Navigate to={`/campaigns/${campaign.id}`} replace />}
        />
      </Routes>
      {confirmArchive && (
        <Modal
          title="Archive campaign"
          subtitle={campaign.name}
          onClose={() => setConfirmArchive(false)}
        >
          <div className="form-content">
            <p>
              Archive this campaign and pause its projects. Ads, requests and
              funding records are retained. Restoring the campaign restores its
              prior project states.
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(
                    `/management/campaigns/${campaign.id}/archive`,
                    context.access,
                    "POST",
                    {},
                  );
                  await context.refresh();
                  setConfirmArchive(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Archive campaign
            </button>
          </div>
        </Modal>
      )}
    </WorkspaceContext.Provider>
  );
}

export function AdminProjectRedirect() {
  const { id } = useParams();
  const { projects } = useWorkspace();
  const project = projects.find((p) => p.id === id);
  return (
    <Navigate
      to={
        project?.campaignId
          ? `/campaigns/${project.campaignId}/projects/${id}`
          : "/campaigns"
      }
      replace
    />
  );
}

function ProjectGiftRecords() {
  const { id } = useParams();
  const { projects, campaignScope } = useWorkspace();
  if (!projects.some((project) => project.id === id))
    return <Navigate to={`/campaigns/${campaignScope?.id}`} replace />;
  return (
    <>
      <p className="metrics-note">
        Historical cause-gift and seed simulation. These records are separate
        from ad-fund contributions and retain their original allocations.
      </p>
      <CampaignsPage />
    </>
  );
}
