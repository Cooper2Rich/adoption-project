import { Check, Image as ImageIcon, Send, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { useWorkspace } from "../context.tsx";
import { demoAsset } from "../runtime.ts";
import type { Format, Post, Project } from "../types.ts";
import { Media, Modal } from "./ui.tsx";

export function SubmissionForm({
  project,
  post,
  onClose,
}: {
  project: Project;
  post?: Post;
  onClose: () => void;
}) {
  const { role, access, identity, refresh, notify } = useWorkspace();
  const [data, setData] = useState({
    title: post?.title || "",
    creator: post?.creator || (role === "creator" ? identity?.name || "" : ""),
    caption: post?.caption || "",
    format: post?.format || ("photo" as Format),
    media: post?.media || "",
    mediaType: post?.mediaType || ("image" as "image" | "video"),
    rights: post?.rights || false,
    channel: post?.channel || project.eligibilityPolicy.allowedChannels[0],
    destination: post?.destination || project.eligibilityPolicy.destinations[0],
    disclosures: post?.disclosures || { compensation: "", beneficiary: "" },
    factualClaims: post?.factualClaims || [],
    acceptedTermsVersion: post?.acceptedTermsVersion || "",
  });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 30 * 1024 * 1024) {
      setError("Choose a file smaller than 30 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("media", file);
      const media = await api<{ media: string; mediaType: "image" | "video" }>(
        "/uploads",
        access,
        "POST",
        form,
      );
      setData((d) => ({
        ...d,
        ...media,
        format: media.mediaType === "video" ? "reel" : "photo",
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!data.media) {
      setError("Upload a creative or choose a sample image first.");
      return;
    }
    setSaving(true);
    try {
      await api(
        post ? `/posts/${post.id}` : `/projects/${project.id}/posts`,
        access,
        post ? "PUT" : "POST",
        { ...data, ...(post ? { revision: post.revision } : {}) },
      );
      await refresh();
      notify(
        post
          ? "Updated creative evaluated automatically"
          : "Your creative has been evaluated automatically",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={post ? "A fresh take." : "Your story starts here."}
      subtitle={`Submit a creative for ${project.name}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-content">
          {post?.feedback && (
            <div className="callout amber">
              <p>
                <strong>Historical feedback</strong>
                <br />
                {post.feedback}
              </p>
            </div>
          )}
          <div className="brief-mini">
            <span className="eyebrow">THE BRIEF</span>
            <p>{project.brief}</p>
          </div>
          <div className="form-grid">
            <label>
              Post title
              <input
                required
                maxLength={100}
                value={data.title}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                placeholder="Give your idea a name"
              />
            </label>
            <label>
              Your name
              <input
                required
                maxLength={80}
                value={data.creator}
                readOnly={role === "creator" || !!post}
                onChange={(e) => setData({ ...data, creator: e.target.value })}
                placeholder="Creator name"
              />
            </label>
          </div>
          <label className="upload-zone">
            {data.media ? (
              <Media
                post={{
                  ...data,
                  title: data.title || "Your selected creative",
                }}
              />
            ) : (
              <Upload size={25} />
            )}
            <strong>
              {uploading
                ? "Uploading your creative…"
                : data.media
                  ? "Change your creative"
                  : "Choose a photo or video"}
            </strong>
            <span>JPG, PNG, WebP, MP4 or MOV · up to 30 MB</span>
            <input
              type="file"
              aria-label="Upload creative"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
              disabled={uploading || saving}
            />
          </label>
          <div className="sample-picker">
            <span>
              <ImageIcon size={14} />
              Or try a sample
            </span>
            {["forest", "food", "seedling"].map((cover) => (
              <button
                key={cover}
                type="button"
                className={
                  data.media === `/images/${cover}.jpg` ? "selected" : ""
                }
                onClick={() =>
                  setData({
                    ...data,
                    media: `/images/${cover}.jpg`,
                    mediaType: "image",
                    format: "photo",
                  })
                }
                aria-label={`Use ${cover} sample`}
                disabled={uploading}
              >
                <img src={demoAsset(`images/${cover}.jpg`)} alt="" />
                {data.media === `/images/${cover}.jpg` && <Check size={12} />}
              </button>
            ))}
          </div>
          <label>
            Format
            <select
              value={data.format}
              onChange={(e) =>
                setData({ ...data, format: e.target.value as Format })
              }
            >
              <option value="photo">Photo post</option>
              <option value="reel">Reel</option>
              <option value="carousel">Carousel proposal</option>
              <option value="story">Story proposal</option>
              <option value="other">Other format proposal</option>
            </select>
          </label>
          {!["photo", "reel"].includes(data.format) && (
            <p className="field-help">
              We’ll retain and check this proposal. This format needs a separate
              handoff plan.
            </p>
          )}
          <label>
            Instagram caption
            <textarea
              required
              maxLength={2200}
              rows={5}
              value={data.caption}
              onChange={(e) => setData({ ...data, caption: e.target.value })}
              placeholder="A story worth stopping the scroll for…"
            />
            <span className="character-count">
              {data.caption.length.toLocaleString()} / 2,200
            </span>
          </label>
          <label>
            Campaign channel
            <select
              value={data.channel}
              onChange={(e) => setData({ ...data, channel: e.target.value })}
            >
              {project.eligibilityPolicy.allowedChannels.map((channel) => (
                <option key={channel}>{channel}</option>
              ))}
            </select>
          </label>
          <label>
            Authorized destination
            <select
              value={data.destination}
              onChange={(e) =>
                setData({ ...data, destination: e.target.value })
              }
            >
              {project.eligibilityPolicy.destinations.map((destination) => (
                <option key={destination}>{destination}</option>
              ))}
            </select>
          </label>
          <div className="callout">
            <p>
              <strong>Required disclosure blocks</strong>
              <br />
              {project.eligibilityPolicy.compensationDisclosure}
              <br />
              {project.eligibilityPolicy.beneficiaryDisclosure}
              <br />
              {project.eligibilityPolicy.factualClaims.join(" ")}
            </p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={
                data.disclosures.compensation ===
                  project.eligibilityPolicy.compensationDisclosure &&
                data.disclosures.beneficiary ===
                  project.eligibilityPolicy.beneficiaryDisclosure &&
                data.acceptedTermsVersion ===
                  project.eligibilityPolicy.termsVersion
              }
              onChange={(e) =>
                setData({
                  ...data,
                  disclosures: e.target.checked
                    ? {
                        compensation:
                          project.eligibilityPolicy.compensationDisclosure,
                        beneficiary:
                          project.eligibilityPolicy.beneficiaryDisclosure,
                      }
                    : { compensation: "", beneficiary: "" },
                  factualClaims: e.target.checked
                    ? project.eligibilityPolicy.factualClaims
                    : [],
                  acceptedTermsVersion: e.target.checked
                    ? project.eligibilityPolicy.termsVersion
                    : "",
                })
              }
            />
            <span>
              I include these exact disclosure and fact blocks and accept
              campaign terms {project.eligibilityPolicy.termsVersion}.
              <small>
                Structured fields do not prove these blocks appear in the
                exported media. Include them visibly in your creative.
              </small>
            </span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={data.rights}
              onChange={(e) => setData({ ...data, rights: e.target.checked })}
            />
            <span>
              I have the rights and necessary permissions to share this
              creative.
              <small>
                Eligibility requires this declaration. It does not verify
                ownership.
              </small>
            </span>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving || uploading}>
            {saving
              ? "Submitting…"
              : post
                ? "Save & evaluate revision"
                : "Submit & evaluate"}
            <Send size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
