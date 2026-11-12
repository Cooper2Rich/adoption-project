import {
  ArrowRight,
  CheckCheck,
  Clock3,
  Filter,
  Image as ImageIcon,
} from "lucide-react";
import { useState } from "react";
import { Leaderboard } from "../components/Leaderboard.tsx";
import { ReviewDialog } from "../components/ReviewDialog.tsx";
import {
  Avatar,
  EmptyState,
  FormatLabel,
  Media,
  relativeTime,
  StatusBadge,
} from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import { AdMedia } from "../public-demo/AdMedia.tsx";
import { PUBLIC_DEMO } from "../runtime.ts";
import type { Post } from "../types.ts";

export function PostList({
  posts,
  showProject = true,
}: {
  posts: Post[];
  showProject?: boolean;
}) {
  const { projects, role, access } = useWorkspace();
  const [selected, setSelected] = useState<Post | null>(null);
  return (
    <>
      <div className="post-list">
        {posts.map((post, i) => {
          const project = projects.find((p) => p.id === post.projectId)!;
          return (
            <button
              className="post-row"
              key={post.id}
              onClick={() => setSelected(post)}
            >
              <div className="post-thumbnail">
                {PUBLIC_DEMO ? (
                  <AdMedia ad={post} access={access} previewOnly />
                ) : post.mediaType === "video" ? (
                  <ImageIcon size={26} />
                ) : (
                  <Media post={post} />
                )}
              </div>
              <div className="post-row-main">
                <h3>{post.title}</h3>
                <p>
                  {showProject ? project.name : post.creator} <span>·</span>{" "}
                  <FormatLabel format={post.format} />
                </p>
                {PUBLIC_DEMO && (
                  <p className="creative-byline">By {post.creator}</p>
                )}
              </div>
              <div className="post-author">
                <Avatar name={post.creator} index={i} />
                <span>
                  {post.creator}
                  <small>{relativeTime(post.createdAt)}</small>
                </span>
              </div>
              <div className="post-state">
                <StatusBadge status={post.status} />
                {post.policy && !post.policy.passed && (
                  <small className="danger-text">Checks need attention</small>
                )}
                {role !== "creator" &&
                  post.status === "approved" &&
                  post.readiness && (
                    <small>
                      {post.readiness.ready
                        ? "Ready for handoff"
                        : post.readiness.reasons[0]}
                    </small>
                  )}
              </div>
              <span className="row-action">
                {role !== "creator" && post.status === "pending"
                  ? "Review"
                  : "View"}
                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <ReviewDialog post={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
export function PostsPage({ mode }: { mode: "review" | "approved" | "all" }) {
  const { posts, approvedPosts, projects, search, role, identity } =
    useWorkspace();
  const [projectFilter, setProjectFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const base = (mode === "approved" ? approvedPosts : posts).filter((p) =>
    mode === "review"
      ? role === "creator"
        ? true
        : p.status === "held"
      : mode === "approved"
        ? p.status === "approved"
        : true,
  );
  const filtered = base.filter(
    (p) =>
      (projectFilter === "all" || p.projectId === projectFilter) &&
      (status === "all" || p.status === status) &&
      `${p.title} ${p.creator} ${p.caption} ${projects.find((x) => x.id === p.projectId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const title =
    mode === "review"
      ? role === "creator"
        ? "My creatives"
        : "Platform exceptions"
      : mode === "approved"
        ? role === "creator"
          ? "Eligible library & counts"
          : "Eligible creatives"
        : PUBLIC_DEMO
          ? "Creatives"
          : "All submissions";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {mode === "review"
              ? "A FRESH PERSPECTIVE AWAITS"
              : mode === "approved"
                ? "GOOD TO GO. READY TO GROW."
                : "THE STORIES BEHIND THE CHANGE"}
          </span>
          <h1>
            {title}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {role === "creator"
              ? mode === "approved"
                ? "Discover eligible stories from published projects and the creators behind them."
                : `Submissions and feedback for ${identity?.name}. Only your work appears here.`
              : mode === "review"
                ? "Scoped holds and appeals for platform exception handling. Eligible content needs no owner action."
                : mode === "approved"
                  ? "Your eligible creatives, with a clear path to Instagram handoff."
                  : "Browse ads by creator, campaign and eligibility status."}
          </p>
        </div>
        <span className="big-count">
          {base.length.toString().padStart(2, "0")}
        </span>
      </div>
      {mode === "approved" && role === "creator" && (
        <Leaderboard posts={filtered} />
      )}
      {mode === "approved" && role !== "creator" && (
        <div className="info-banner">
          <CheckCheck size={24} />
          <div>
            <strong>Eligibility is automatic.</strong>
            <p>
              Add the nonprofit’s Instagram account to prepare a post for
              handoff. Live publishing is not enabled in this demo.
            </p>
          </div>
        </div>
      )}
      {mode === "review" && (
        <div className="queue-summary">
          <span className="stat-icon amber">
            <Clock3 size={22} />
          </span>
          <div>
            <strong>
              {base.length
                ? `${base.length} creative records in this view.`
                : "You’re all caught up."}
            </strong>
            <p>
              {role !== "creator"
                ? "Only scoped holds require exception handling. Mechanical failures go directly to creators."
                : "Track automatic checks, exact fixes, and scoped appeals."}
            </p>
          </div>
        </div>
      )}
      <div className="section-toolbar">
        <h2>
          {mode === "approved"
            ? "Eligible library"
            : mode === "review"
              ? role === "creator"
                ? "Your creatives"
                : "Scoped exceptions"
              : "Creator submissions"}
          <span className="count-pill">{filtered.length}</span>
        </h2>
        <div className="post-filters">
          <Filter size={15} />
          <select
            aria-label="Filter by project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {mode === "all" && (
            <select
              aria-label="Filter by post status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Checking</option>
              <option value="changes">Needs fixes</option>
              <option value="held">On hold</option>
              <option value="approved">Eligible</option>
              <option value="rejected">Blocked</option>
            </select>
          )}
        </div>
      </div>
      {filtered.length ? (
        <PostList posts={filtered} />
      ) : (
        <EmptyState
          title={
            search || projectFilter !== "all" || status !== "all"
              ? "No matching stories."
              : PUBLIC_DEMO
                ? "No creatives found."
                : mode === "review"
                  ? "A clear inbox. A good feeling."
                  : "The next good story is on its way."
          }
          description={
            search || projectFilter !== "all" || status !== "all"
              ? "Try changing your search or filters."
              : mode === "approved"
                ? "Current eligible snapshots appear here automatically."
                : "New creator submissions will appear here."
          }
        />
      )}
    </>
  );
}
