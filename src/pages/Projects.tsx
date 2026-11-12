import {
  ArrowDownUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  FolderHeart,
  LayoutGrid,
  List,
  Plus,
  Sprout,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ProjectForm } from "../components/ProjectForm.tsx";
import { Avatar, dateLabel, EmptyState, Instagram } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { ProjectRequestForm } from "../public-demo/ProjectRequests.tsx";
import { demoAsset, PUBLIC_DEMO } from "../runtime.ts";

export function ProjectsPage({ campaignId }: { campaignId?: string }) {
  const {
    projects,
    posts,
    approvedPosts,
    search,
    role,
    identity,
    campaignScope,
  } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [sort, setSort] = useState("recent");
  const [creating, setCreating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const filtered = projects
    .filter(
      (p) =>
        (!campaignId || p.status !== "archived") &&
        (filter === "all" || p.status === filter) &&
        `${p.name} ${p.nonprofit} ${p.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.createdAt.localeCompare(a.createdAt),
    );
  const pending = posts.filter((p) =>
    ["pending", "changes"].includes(p.status),
  ).length;
  const approved = (
    role === "creator"
      ? posts.filter((p) => p.status === "approved")
      : approvedPosts
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR IMPACT STARTS HERE</span>
          <h1>
            {role === "creator"
              ? "Published projects"
              : role === "nonprofit"
                ? "Our projects"
                : "Projects"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {PUBLIC_DEMO
              ? "Manage projects, creative briefs and submissions."
              : role === "nonprofit"
                ? `${identity?.name} — your projects, creators, and eligibility in one place.`
                : role === "creator"
                  ? `Welcome, ${identity?.name}. Find your next project and follow your own submissions.`
                  : "A little creativity. A lot of good. Bring your next story to life."}
          </p>
        </div>
        {role === "admin" && !PUBLIC_DEMO && (
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            New project
          </button>
        )}
        {PUBLIC_DEMO &&
          role === "admin" &&
          campaignScope?.status !== "archived" && (
            <Link className="button secondary" to="/project-requests">
              Review project requests
            </Link>
          )}
        {PUBLIC_DEMO && role === "nonprofit" && (
          <button
            className="button primary"
            onClick={() => setRequesting(true)}
          >
            <Plus size={18} />
            Request new project
          </button>
        )}
      </div>
      {!PUBLIC_DEMO && (
        <section className="workspace-hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span />
              CREATED TO MAKE A DIFFERENCE
            </span>
            <h2>
              Good stories.
              <br />
              <span>Greater impact.</span>
            </h2>
            <p>
              Give your mission a voice. Bring creators together
              <br className="desktop-br" /> to turn meaningful stories into
              real-world change.
            </p>
            <Link className="hero-link" to="/posts">
              {role !== "creator"
                ? "View campaign creatives"
                : "Explore your submissions"}
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-art">
            <img
              src={demoAsset(
                PUBLIC_DEMO
                  ? "images/coffee-afterhours.png"
                  : "images/seedling.jpg",
              )}
              alt={
                PUBLIC_DEMO
                  ? "A candlelit neighborhood coffee shop"
                  : "Garden tools and young plants ready for planting"
              }
            />
            <div className="hero-image-shade" />
            <span className="hero-sticker">
              <Sprout size={22} />
              Made for
              <br />
              <strong>more good.</strong>
            </span>
            <div className="hero-art-caption">
              <span>SMALL ACTS. LASTING CHANGE.</span>
              <span>↗</span>
            </div>
          </div>
        </section>
      )}
      {(!PUBLIC_DEMO || !campaignId) && (
        <section className="stats-row" aria-label="Workspace summary">
          <div>
            <span className="stat-icon green">
              <FolderHeart size={21} />
            </span>
            <div>
              <span>Published projects</span>
              <strong>
                {projects
                  .filter((p) => p.status === "active")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </div>
            {!PUBLIC_DEMO && (
              <span className="stat-note">Making things happen</span>
            )}
          </div>
          <Link to="/review">
            <span className="stat-icon amber">
              <Clock3 size={21} />
            </span>
            <div>
              <span>Checking / needs fixes</span>
              <strong>{pending.toString().padStart(2, "0")}</strong>
            </div>
            <span className="stat-note">
              Automatic checks
              <ArrowUpRight size={14} />
            </span>
          </Link>
          <Link to="/approved">
            <span className="stat-icon purple">
              <Check size={22} />
            </span>
            <div>
              <span>Eligible creatives</span>
              <strong>{approved.toString().padStart(2, "0")}</strong>
            </div>
            <span className="stat-note">
              {PUBLIC_DEMO ? "View creatives" : "Ready for the next chapter"}
              <ArrowUpRight size={14} />
            </span>
          </Link>
        </section>
      )}
      <div className="section-toolbar">
        <div className="tabs">
          {(role === "creator"
            ? ["all"]
            : campaignId
              ? ["all", "active", "draft"]
              : ["all", "active", "draft", "archived"]
          ).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={filter === value ? "active" : ""}
            >
              {value === "all"
                ? "All projects"
                : value === "active"
                  ? "Published"
                  : value[0].toUpperCase() + value.slice(1)}
              {value === "all" && (
                <span>
                  {campaignId
                    ? projects.filter((p) => p.status !== "archived").length
                    : projects.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="view-controls">
          <label className="sort-control">
            <ArrowDownUp size={14} />
            <select
              aria-label="Sort projects"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Newest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <div className="view-toggle">
            <button
              aria-label="Grid view"
              aria-pressed={layout === "grid"}
              className={layout === "grid" ? "active" : ""}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={layout === "list"}
              className={layout === "list" ? "active" : ""}
              onClick={() => setLayout("list")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
      </div>
      {filtered.length ? (
        <div
          className={`project-grid ${layout === "list" ? "list-layout" : ""}`}
        >
          {filtered.map((project) => {
            const projectPosts = posts.filter(
              (p) => p.projectId === project.id,
            );
            const awaiting = projectPosts.filter(
              (p) => p.status !== "approved",
            ).length;
            const creators = [...new Set(projectPosts.map((p) => p.creator))];
            return (
              <Link
                key={project.id}
                to={
                  PUBLIC_DEMO &&
                  role === "creator" &&
                  project.id === "fictional-river-showcase-v1"
                    ? `/opportunities/${project.id}`
                    : campaignId
                      ? `/campaigns/${campaignId}/projects/${project.id}`
                      : `/projects/${project.id}`
                }
                className="project-card"
              >
                <div className="project-cover">
                  <img
                    src={demoAsset(
                      project.coverMedia || `images/${project.cover}.jpg`,
                    )}
                    alt=""
                  />
                  <span className="category-pill">{project.category}</span>
                  <span className="card-arrow">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <div className="project-card-body">
                  <div className="project-org">
                    <span className={`org-dot ${project.color}`} />
                    {project.nonprofit}
                    <span className={`project-status ${project.status}`}>
                      {project.status === "active"
                        ? "Published"
                        : project.status === "draft"
                          ? "Draft"
                          : "Archived"}
                    </span>
                  </div>
                  <h3>{project.name}</h3>
                  <p className="project-description">{project.description}</p>
                  {role !== "creator" && (
                    <div className="project-account">
                      <Instagram size={15} />
                      <span>
                        {project.instagram
                          ? `@${project.instagram}`
                          : "Instagram account pending"}
                      </span>
                      {project.instagram && <Check size={13} />}
                    </div>
                  )}
                  <div className="project-progress">
                    <div>
                      <span>
                        {projectPosts.length}{" "}
                        {role === "creator"
                          ? "of your submissions"
                          : "submissions"}
                      </span>
                      <strong>
                        {awaiting > 0
                          ? `${awaiting} need attention`
                          : "All caught up"}
                      </strong>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${projectPosts.length ? ((projectPosts.length - awaiting) / projectPosts.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="project-card-footer">
                    <span className="avatar-stack">
                      {creators.slice(0, 3).map((name, i) => (
                        <Avatar key={name} name={name} index={i} />
                      ))}
                      <span>
                        {creators.length
                          ? `${creators.length} creators`
                          : role === "creator"
                            ? "Your next story starts here"
                            : "Open to creators"}
                      </span>
                    </span>
                    <span>
                      <CalendarDays size={13} />
                      {dateLabel(project.endDate, true)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            PUBLIC_DEMO
              ? "No projects found."
              : "A little room for something new."
          }
          description={
            search
              ? "No projects match your search. Try a different name or cause."
              : `There are no ${filter === "all" ? "" : filter + " "}projects here yet.`
          }
          action={
            role === "admin" && (
              <button
                className="button secondary"
                onClick={() => setCreating(true)}
              >
                <Plus size={16} />
                Create a project
              </button>
            )
          }
        />
      )}
      <div className="page-bottom-note">
        <Sprout size={16} />
        <span>
          {PUBLIC_DEMO
            ? "Projects and creators in this workspace."
            : "Every project starts with a purpose. Every creator helps it grow."}
        </span>
        <span className="sample-note">
          Sample organizations · Demo workspace
        </span>
      </div>
      {creating && (
        <ProjectForm
          campaignId={campaignId}
          onClose={() => setCreating(false)}
        />
      )}
      {requesting && (
        <ProjectRequestForm onClose={() => setRequesting(false)} />
      )}
    </>
  );
}
