import { ArrowRight, Check, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { useWorkspace } from "../context.tsx";
import { PUBLIC_DEMO } from "../runtime.ts";
import type { Project } from "../types.ts";
import { Instagram, Modal } from "./ui.tsx";

export function ProjectForm({
  project,
  onClose,
  accountFocus = false,
  campaignId,
}: {
  project?: Project;
  onClose: () => void;
  accountFocus?: boolean;
  campaignId?: string;
}) {
  const {
    refresh,
    notify,
    role,
    access,
    managedCampaigns = [],
  } = useWorkspace();
  const campaign = managedCampaigns.find((c) => c.id === campaignId);
  const pricingPending =
    PUBLIC_DEMO && (!project || project.pricingStatus === "pending");
  const [tab, setTab] = useState(accountFocus ? "account" : "details");
  const [data, setData] = useState({
    name: project?.name || "",
    nonprofit: project?.nonprofit || campaign?.ownerName || "",
    category: project?.category || "Environment",
    description: project?.description || "",
    brief: project?.brief || "",
    cover: project?.cover || "forest",
    startDate: project?.startDate || new Date().toISOString().slice(0, 10),
    endDate:
      project?.endDate ||
      new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10),
    status: project?.status || "draft",
    instagram: project?.instagram || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [policyConfig, setPolicyConfig] = useState(
    project?.policyConfig ||
      (project
        ? {
            allowedChannels: project.eligibilityPolicy.allowedChannels,
            allowedFormats: project.eligibilityPolicy.allowedFormats,
            destinations: project.eligibilityPolicy.destinations,
            beneficiaryDisclosure:
              project.eligibilityPolicy.beneficiaryDisclosure,
            compensationDisclosure:
              project.eligibilityPolicy.compensationDisclosure,
            factualClaims: project.eligibilityPolicy.factualClaims,
            termsVersion: project.eligibilityPolicy.termsVersion,
            maxFileBytes: project.eligibilityPolicy.maxFileBytes,
          }
        : undefined),
  );
  const set = (key: string, value: string) =>
    setData((d) => ({ ...d, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api(
        project ? `/projects/${project.id}` : "/projects",
        access,
        project ? "PUT" : "POST",
        {
          ...data,
          ...(campaignId ? { campaignId } : {}),
          ...(policyConfig ? { policyConfig } : {}),
        },
      );
      await refresh();
      notify(project ? "Project settings saved" : "Your new project is ready");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        project
          ? "Project settings"
          : PUBLIC_DEMO
            ? "New project"
            : "Make room for something good."
      }
      subtitle={
        project
          ? project.name
          : PUBLIC_DEMO
            ? "Create a campaign project draft"
            : "Start with a mission. Your creators will bring the stories."
      }
      onClose={onClose}
    >
      <div className="form-tabs">
        <button
          className={tab === "details" ? "selected" : ""}
          onClick={() => setTab("details")}
        >
          Project details
        </button>
        <button
          className={tab === "account" ? "selected" : ""}
          onClick={() => setTab("account")}
        >
          <Instagram size={15} />
          Instagram account
        </button>
        {policyConfig && (
          <button
            className={tab === "policy" ? "selected" : ""}
            onClick={() => setTab("policy")}
          >
            Eligibility policy
          </button>
        )}
      </div>
      <form
        onSubmit={save}
        className="project-form"
        onInvalidCapture={(event) =>
          setTab(
            (event.target as HTMLElement)
              .closest("[data-section]")
              ?.getAttribute("data-section") || "details",
          )
        }
      >
        {policyConfig && (
          <div
            className="form-content"
            hidden={tab !== "policy"}
            data-section="policy"
          >
            <p>
              Policy v{project?.eligibilityPolicy.version}. Saving changed rules
              creates a version and reruns checks. Rights and fixed compensation
              disclosures are mandatory.
            </p>
            <label>
              Allowed channels (comma separated)
              <input
                value={policyConfig.allowedChannels.join(",")}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    allowedChannels: e.target.value.split(","),
                  })
                }
              />
            </label>
            <label>
              Allowed formats (comma separated)
              <input
                value={policyConfig.allowedFormats.join(",")}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    allowedFormats: e.target.value.split(","),
                  })
                }
              />
            </label>
            <label>
              Authorized destinations (one per line)
              <textarea
                value={policyConfig.destinations.join("\n")}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    destinations: e.target.value.split("\n"),
                  })
                }
              />
            </label>
            <label>
              Required beneficiary disclosure
              <input
                value={policyConfig.beneficiaryDisclosure}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    beneficiaryDisclosure: e.target.value,
                  })
                }
              />
            </label>
            <p>{policyConfig.compensationDisclosure}</p>
            <label>
              Required factual claim blocks (one per line)
              <textarea
                value={policyConfig.factualClaims.join("\n")}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    factualClaims: e.target.value
                      ? e.target.value.split("\n")
                      : [],
                  })
                }
              />
            </label>
            <label>
              Campaign terms version
              <input
                value={policyConfig.termsVersion}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    termsVersion: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Maximum file bytes
              <input
                type="number"
                min="1"
                max={30 * 1024 * 1024}
                value={policyConfig.maxFileBytes}
                onChange={(e) =>
                  setPolicyConfig({
                    ...policyConfig,
                    maxFileBytes: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <div
          className="form-content"
          hidden={tab !== "details"}
          data-section="details"
        >
          {pricingPending && (
            <p className="metrics-note">
              Project pricing is pending. This project can be saved as a draft
              without a charge; publishing is unavailable until pricing is
              configured.
            </p>
          )}
          <label>
            Project name
            <input
              required
              maxLength={80}
              value={data.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="A name for your next big idea"
            />
          </label>
          <div className="form-grid">
            <label>
              Nonprofit name
              <input
                required
                maxLength={80}
                value={data.nonprofit}
                readOnly={role === "nonprofit" || !!campaignId}
                onChange={(e) => set("nonprofit", e.target.value)}
                placeholder="Your organization"
              />
            </label>
            <label>
              Cause
              <select
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
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            About the project
            <textarea
              required
              maxLength={600}
              value={data.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What change are you hoping to make?"
              rows={3}
            />
          </label>
          <label>
            Creator brief
            <textarea
              required
              maxLength={1200}
              value={data.brief}
              onChange={(e) => set("brief", e.target.value)}
              placeholder="Tell creators what makes a great story for this project."
              rows={3}
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
          <div className="form-grid">
            <label>
              Project status
              <select
                value={data.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft — preparing the project</option>
                <option value="active" disabled={pricingPending}>
                  Published — accept submissions within dates
                </option>
                <option value="archived">
                  Archived — close new submissions and handoff
                </option>
              </select>
            </label>
            <label>
              Cover image
              <select
                value={data.cover}
                onChange={(e) => set("cover", e.target.value)}
              >
                <option value="forest">Into the green</option>
                <option value="food">Around the table</option>
                <option value="education">A world of possibility</option>
                <option value="seedling">New beginnings</option>
              </select>
            </label>
          </div>
        </div>
        <div
          className="form-content"
          hidden={tab !== "account"}
          data-section="account"
        >
          <div className="instagram-intro">
            <span className="instagram-icon">
              <Instagram size={30} />
            </span>
            <h3>One project. One official voice.</h3>
            <p>
              Pair this project with the nonprofit’s Instagram account so every
              eligible creative has a clear destination.
            </p>
          </div>
          <label>
            Nonprofit Instagram account{" "}
            <span className="optional">Optional</span>
            <div className="input-with-prefix">
              <span>@</span>
              <input
                value={data.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="your.nonprofit"
                maxLength={150}
                aria-label="Nonprofit Instagram account"
              />
            </div>
          </label>
          <p className="field-help">
            Enter a username or Instagram profile URL. You can add it later or
            clear it to remove the pairing.
          </p>
          <div className="callout">
            <Info size={18} />
            <p>
              This saves the destination for this project. Live Instagram
              authorization and publishing are not enabled in this demo.
            </p>
          </div>
          <div className="account-checks">
            <span>
              <Check size={16} />
              Evaluate creatives before an account is added
            </span>
            <span>
              <Check size={16} />
              Keep each nonprofit’s destination separate
            </span>
            <span>
              <Check size={16} />
              Only eligible creatives can be handed off
            </span>
          </div>
          {!project && (
            <button
              type="button"
              className="text-button"
              onClick={() => setTab("details")}
            >
              Complete project details <ArrowRight size={15} />
            </button>
          )}
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
          <button
            className="button primary"
            disabled={saving}
            onClick={() => {
              if (
                !data.name ||
                !data.nonprofit ||
                !data.description ||
                !data.brief
              )
                setTab("details");
            }}
          >
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
