import { Check, Clock3, MessageSquare, Plus, Send } from "lucide-react";
import { Link } from "react-router-dom";
import {
  dateLabel,
  EmptyState,
  Instagram,
  relativeTime,
} from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";

export function ActivityPage() {
  const { activity, search } = useWorkspace();
  const filtered = activity.filter((e) =>
    `${e.title} ${e.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY SMALL STEP, ALL IN ONE PLACE</span>
          <h1>
            Workspace activity<span className="title-dot">.</span>
          </h1>
          <p>Project updates, creative checks and workspace changes.</p>
        </div>
      </div>
      {filtered.length ? (
        <div className="activity-list">
          {filtered.map((event) => {
            const Icon =
              event.action === "approved"
                ? Check
                : event.action === "instagram"
                  ? Instagram
                  : event.action === "changes"
                    ? MessageSquare
                    : event.action === "submitted" ||
                        event.action === "resubmitted"
                      ? Send
                      : event.action === "project"
                        ? Plus
                        : Clock3;
            return (
              <div className="activity-row" key={event.id}>
                <span
                  className={`stat-icon ${event.action === "approved" ? "green" : event.action === "changes" ? "amber" : "neutral"}`}
                >
                  <Icon size={20} />
                </span>
                <div>
                  {event.projectId ? (
                    <Link to={`/projects/${event.projectId}`}>
                      {event.title}
                    </Link>
                  ) : (
                    <strong>{event.title}</strong>
                  )}
                  <p>{event.detail}</p>
                </div>
                <time
                  dateTime={event.at}
                  title={new Date(event.at).toLocaleString()}
                >
                  {relativeTime(event.at)}
                  <small>{dateLabel(event.at, true)}</small>
                </time>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No activity here yet."
          description={
            search
              ? "Try another search."
              : "Project updates, evaluations and exception history will appear here."
          }
        />
      )}
    </>
  );
}
