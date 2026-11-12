import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Plus,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { submissionsOpen } from "../calendar.ts";
import { ProjectForm } from "../components/ProjectForm.tsx";
import { SubmissionForm } from "../components/SubmissionForm.tsx";
import { dateLabel, EmptyState, Instagram } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { demoAsset } from "../runtime.ts";
import { PostList } from "./Posts.tsx";

export function ProjectDetail() {
  const { id } = useParams();
  const { projects, posts, role, search, campaignScope } = useWorkspace();
  const project = projects.find((p) => p.id === id);
  const [settings, setSettings] = useState<false | "details" | "account">(
    false,
  );
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("all");
  if (!project)
    return (
      <EmptyState
        title="Project not found."
        description="This project may no longer be available."
        action={
          <Link className="button primary" to="/projects">
            Back to projects
          </Link>
        }
      />
    );
  const projectPosts = posts.filter((p) => p.projectId === id);
  const filtered = projectPosts.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.title} ${p.creator} ${p.caption}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const accepting = submissionsOpen(project);
  return (
    <>
      <Link
        to={campaignScope ? `/campaigns/${campaignScope.id}` : "/projects"}
        className="back-link"
      >
        <ArrowLeft size={15} />
        All projects
      </Link>
      <div className="project-detail-cover">
        <img
          src={demoAsset(project.coverMedia || `images/${project.cover}.jpg`)}
          alt=""
        />
        <div>
          <span className="category-pill">{project.category}</span>
          <h1>{project.name}</h1>
          <p>{project.nonprofit}</p>
        </div>
      </div>
      <div className="detail-topline">
        {project.campaignPaused && (
          <p className="metrics-note">
            Admin has paused this project. Saved creatives and funding records
            remain available.
          </p>
        )}
        <span className={`project-status ${project.status}`}>
          {project.status === "active" ? "Published" : project.status}
        </span>
        <span>
          <CalendarDays size={15} />
          {dateLabel(project.startDate)} – {dateLabel(project.endDate)}
        </span>
        <div>
          {role !== "creator" &&
            campaignScope?.status !== "archived" &&
            !project.campaignPaused && (
              <button
                className="button secondary"
                onClick={() => setSettings("details")}
              >
                <Settings2 size={16} />
                Project settings
              </button>
            )}
          {role !== "nonprofit" && (
            <button
              className="button primary"
              disabled={!accepting}
              onClick={() => {
                setSubmitting(true);
              }}
            >
              <Plus size={16} />
              Submit a post
            </button>
          )}
        </div>
      </div>
      <div
        className={`project-info-grid ${role === "creator" ? "creator-project-info" : ""}`}
      >
        <div className="project-brief">
          <span className="eyebrow">A MISSION WORTH SHARING</span>
          <h2>About this project</h2>
          <p>{project.description}</p>
          <h4>The creator brief</h4>
          <p>{project.brief}</p>
          {!accepting && (
            <span className="closed-note">
              {project.status === "draft"
                ? "This project is still being prepared."
                : project.status === "archived"
                  ? "This project has been archived."
                  : "Submissions open during the project dates."}
            </span>
          )}
        </div>
        {role !== "creator" && (
          <div className="account-panel">
            <div className="account-panel-title">
              <span className="instagram-icon">
                <Instagram size={24} />
              </span>
              <span
                className={`badge ${project.instagram ? "approved" : "pending"}`}
              >
                {project.instagram ? <Check size={12} /> : null}
                {project.instagram ? "Account paired" : "Pair when ready"}
              </span>
            </div>
            <h3>
              {project.instagram
                ? `@${project.instagram}`
                : "Your mission. Your account."}
            </h3>
            <p>
              {project.instagram
                ? `Eligible creatives for this project are prepared for ${project.nonprofit}’s Instagram account.`
                : "Add the nonprofit’s Instagram account to give eligible creatives a destination."}
            </p>
            {
              <button
                className="button secondary full"
                onClick={() => setSettings("account")}
              >
                <Instagram size={16} />
                {project.instagram ? "Manage account" : "Add Instagram account"}
                <ArrowRight size={15} />
              </button>
            }
            <small>
              {project.instagram
                ? "Pairing saved · Live authorization pending"
                : "Automatic eligibility does not require pairing."}
            </small>
          </div>
        )}
      </div>
      <div className="section-toolbar project-post-toolbar">
        <h2>
          {role === "creator" ? "Your submissions" : "Project submissions"}
          <span className="count-pill">{projectPosts.length}</span>
        </h2>
        <div className="tabs">
          {[
            ["all", "All"],
            ["pending", "Checking"],
            ["approved", "Eligible"],
            ["changes", "Needs fixes"],
            ["held", "On hold"],
            ["rejected", "Blocked"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <PostList posts={filtered} showProject={false} />
      ) : (
        <EmptyState
          title="Make the first move."
          description={
            search || filter !== "all"
              ? "No submissions match this view. Try another filter."
              : "The best stories start with someone like you. Submit a creative to get things going."
          }
          action={
            accepting &&
            role !== "nonprofit" && (
              <button
                className="button secondary"
                onClick={() => {
                  setSubmitting(true);
                }}
              >
                <Plus size={16} />
                Submit a post
              </button>
            )
          }
        />
      )}
      {settings && (
        <ProjectForm
          campaignId={project.campaignId}
          project={project}
          accountFocus={settings === "account"}
          onClose={() => setSettings(false)}
        />
      )}
      {submitting && (
        <SubmissionForm
          project={project}
          onClose={() => setSubmitting(false)}
        />
      )}
    </>
  );
}
