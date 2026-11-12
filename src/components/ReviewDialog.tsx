import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  CircleAlert,
  Download,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { useState } from "react";
import { api, downloadMedia, downloadPost } from "../api.ts";
import { submissionsOpen } from "../calendar.ts";
import { useWorkspace } from "../context.tsx";
import type { Post } from "../types.ts";
import { SubmissionForm } from "./SubmissionForm.tsx";
import {
  Avatar,
  FormatLabel,
  Instagram,
  Media,
  Modal,
  relativeTime,
  StatusBadge,
} from "./ui.tsx";

export function ReviewDialog({
  post: initialPost,
  onClose,
}: {
  post: Post;
  onClose: () => void;
}) {
  const { projects, posts, role, access, refresh, notify } = useWorkspace();
  const post = posts.find((p) => p.id === initialPost.id) || initialPost;
  const project = projects.find((p) => p.id === post.projectId)!;
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const owns =
    role === "admin" ||
    (role === "creator" && post.creatorId === access.creatorId);
  const accepting = submissionsOpen(project);
  async function mutate(path: string, body: unknown) {
    setError("");
    setSaving(true);
    try {
      await api(path, access, "POST", body);
      await refresh();
      notify("Exception evidence saved; automatic rules applied");
      setNote("");
      setEvidence("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function exportPost() {
    try {
      await downloadPost(post.id, access);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (editing)
    return <SubmissionForm project={project} post={post} onClose={onClose} />;
  return (
    <Modal
      title={post.title}
      subtitle={project.name + " · Revision " + post.revision}
      onClose={onClose}
      wide
    >
      <div className="review-layout">
        <div className="preview-column">
          <span className="eyebrow">CREATIVE PREVIEW</span>
          <div className="instagram-preview">
            <div className="ig-top">
              <span className={`nonprofit-icon ${project.color}`}>
                <Instagram size={19} />
              </span>
              <div>
                <strong>{project.instagram || project.nonprofit}</strong>
                <small>{project.nonprofit}</small>
              </div>
              <MoreHorizontal size={21} />
            </div>
            <Media post={post} className="ig-media" />
            <div className="ig-actions" aria-hidden="true">
              <Heart />
              <MessageCircle />
              <Send />
              <Bookmark />
            </div>
            <p className="ig-caption">
              <strong>{project.instagram || project.nonprofit}</strong>{" "}
              {post.caption}
            </p>
          </div>
          <p className="preview-note">
            Preview only · This post has not been published.
          </p>
        </div>
        <div className="review-column">
          <div className="review-meta">
            <StatusBadge status={post.status} />
            <FormatLabel format={post.format} />
          </div>
          <div className="creator-info">
            <Avatar name={post.creator} />
            <div>
              <strong>{post.creator}</strong>
              <span>Submitted {relativeTime(post.createdAt)}</span>
            </div>
          </div>
          {post.eligibility && (
            <div
              className={"check-card " + (post.policy?.passed ? "" : "failed")}
            >
              {post.policy?.passed ? (
                <CheckCircle2 size={20} />
              ) : (
                <CircleAlert size={20} />
              )}
              <div>
                <strong>
                  {post.policy?.passed
                    ? "Automatically eligible"
                    : "Eligibility needs attention"}
                </strong>
                {post.eligibility.reasons.map((reason) => (
                  <p key={reason.code}>
                    <strong>{reason.code}</strong>: {reason.message}
                  </p>
                ))}
                <p>
                  Policy v{post.eligibility.policyVersion} ·{" "}
                  {post.eligibility.ruleVersion}
                </p>
                <small>
                  Snapshot {post.eligibility.snapshotDigest.slice(0, 16)} ·{" "}
                  {post.snapshots?.length} retained revisions
                </small>
                <p>
                  Rights are declarations. These checks cannot establish
                  ownership, truth, harmful meaning, or full platform
                  compliance. Structured blocks do not prove rendering. Live
                  authorization pending.
                </p>
              </div>
            </div>
          )}
          {post.disclosures && (
            <div className="feedback-card">
              <strong>Structured disclosure blocks</strong>
              <p>{post.disclosures.compensation}</p>
              <p>{post.disclosures.beneficiary}</p>
            </div>
          )}
          {owns && accepting && (
            <button
              className="button primary full"
              onClick={() => setEditing(true)}
            >
              Edit & resubmit
              <ArrowRight size={16} />
            </button>
          )}
          {role !== "creator" && post.readiness && (
            <div className="handoff-box">
              <strong>
                {post.readiness.ready
                  ? "Ready for Instagram handoff"
                  : "Handoff blocked"}
              </strong>
              <p>
                {post.readiness.ready
                  ? "Download the eligible snapshot and save the media. Live publishing is not enabled."
                  : post.readiness.reasons.join(". ")}
              </p>
              {post.readiness.ready && (
                <div className="handoff-links">
                  <button
                    className="button secondary"
                    onClick={() => void exportPost()}
                  >
                    <Download size={15} />
                    Post details
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      void downloadMedia(post.media, access).catch((error) =>
                        notify(error.message),
                      )
                    }
                  >
                    Save creative
                    <Download size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
          {owns && (
            <button
              className="button secondary"
              disabled={saving || post.status === "rejected"}
              onClick={() =>
                void mutate("/posts/" + post.id + "/withdraw", {
                  revision: post.revision,
                })
              }
            >
              Withdraw from new use
            </button>
          )}
          {post.eligibility &&
            (role === "admin" || (owns && post.status === "held")) && (
              <div className="decision-form">
                <h4>Platform exceptions</h4>
                <label>
                  Exception reason or corrected fact
                  <textarea
                    disabled={saving}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <label>
                  Supporting evidence
                  <textarea
                    disabled={saving}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                {role === "admin" && (
                  <button
                    className="button secondary"
                    disabled={saving || !note.trim() || !evidence.trim()}
                    onClick={() =>
                      void mutate("/posts/" + post.id + "/holds", {
                        code: "RIGHTS_COMPLAINT",
                        reason: note,
                        evidence,
                      })
                    }
                  >
                    Record scoped rights hold
                  </button>
                )}
                {owns &&
                  post.eligibility.facts.holds.map((hold) => (
                    <div key={hold.id}>
                      <p>
                        {hold.reason} · Evidence: {hold.evidence}
                      </p>
                      <button
                        className="button secondary"
                        disabled={saving || !note.trim()}
                        onClick={() =>
                          void mutate("/posts/" + post.id + "/appeals", {
                            holdId: hold.id,
                            note,
                          })
                        }
                      >
                        Appeal this hold
                      </button>
                    </div>
                  ))}
                {post.appeals?.map((appeal) => (
                  <div key={appeal.id}>
                    <p>Appeal: {appeal.note}</p>
                    {appeal.resolution ? (
                      <p>Fact correction: {appeal.resolution.correctedFact}</p>
                    ) : (
                      role === "admin" && (
                        <button
                          className="button secondary"
                          disabled={saving || !note.trim() || !evidence.trim()}
                          onClick={() =>
                            void mutate("/appeals/" + appeal.id + "/resolve", {
                              correctedFact: note,
                              evidence,
                              holdIncorrect: true,
                            })
                          }
                        >
                          Record corrected hold fact & rerun
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!!post.history.length && (
            <div className="review-history">
              <h4>Evaluation & history</h4>
              {[...post.history].reverse().map((event) => (
                <div className="history-item" key={event.id}>
                  <span className="history-dot" />
                  <div>
                    <strong>{event.action}</strong>
                    <p>{event.note}</p>
                    <small>
                      {event.actor} · {relativeTime(event.at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
