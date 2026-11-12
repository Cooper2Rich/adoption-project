import { Bell, Check, Settings2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ProfileImageUpload } from "../components/ProfileImageUpload.tsx";
import { Avatar } from "../components/ui.tsx";
import { useWorkspace } from "../context.tsx";
import {
  profileRoles,
  useRoleProfile,
  type RoleProfile,
} from "../role-profile.ts";
import { useTheme } from "../theme.ts";
import "./profile.css";

export function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { role, identity, access } = useWorkspace();
  const { profile, save } = useRoleProfile(access, identity);
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const config = profileRoles[role];
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  function update<Key extends keyof RoleProfile>(
    field: Key,
    value: RoleProfile[Key],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (imageBusy) return;
    try {
      const next = {
        ...draft,
        name: draft.name.trim(),
        email: draft.email.trim(),
      };
      if (!next.name) {
        setError("Enter a name before saving your profile.");
        return;
      }
      save(next);
      setDraft(next);
      setMessage("Changes saved on this browser.");
      setError("");
    } catch {
      setError(
        "Your changes could not be saved. Your edits are still here; try again.",
      );
    }
  };
  return (
    <div className="role-profile-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
          <h1>{config.label} profile</h1>
          <p>{config.description}</p>
        </div>
      </div>
      <section className="role-profile-summary" aria-label="Profile overview">
        <Avatar
          name={profile.name}
          src={profile.image}
          logo={role === "nonprofit"}
          index={2}
        />
        <div>
          <span className="role-profile-badge">{config.label}</span>
          <h2>{profile.name}</h2>
          <p>{profile.bio || config.description}</p>
          {identity && <small>Workspace: {identity.name}</small>}
        </div>
        <span className="role-profile-local">Browser-local demo profile</span>
      </section>
      <form onSubmit={submit} className="role-profile-form">
        <section className="role-profile-panel" aria-labelledby="appearance">
          <div className="role-profile-section-heading">
            <Settings2 size={20} />
            <div>
              <h2 id="appearance">Appearance</h2>
              <p>
                Choose your adoption.is theme. Changes apply immediately and
                stay on this browser.
              </p>
            </div>
          </div>
          <div className="profile-theme-picker">
            <label htmlFor="color-theme">Color theme</label>
            <select
              id="color-theme"
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value === "dark" ? "dark" : "light")
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </section>
        <section className="role-profile-panel" aria-labelledby="role-details">
          <div className="role-profile-section-heading">
            <UserRound size={20} />
            <div>
              <h2 id="role-details">{config.details}</h2>
              <p>Choose how you appear in your workspace.</p>
            </div>
          </div>
          <ProfileImageUpload
            image={draft.image}
            name={draft.name}
            organization={role === "nonprofit"}
            onChange={(image) => update("image", image)}
            onBusyChange={setImageBusy}
          />
          <div className="role-profile-fields">
            <label>
              {role === "nonprofit" ? "Organization name" : "Display name"}
              <input
                required
                maxLength={80}
                autoComplete="off"
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                maxLength={254}
                autoComplete="off"
                placeholder="you@example.com"
                value={draft.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </label>
            {role === "admin" ? (
              <>
                <label>
                  Team
                  <input
                    maxLength={100}
                    value={draft.team}
                    onChange={(e) => update("team", e.target.value)}
                  />
                </label>
                <label>
                  Admin title
                  <input
                    maxLength={100}
                    value={draft.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  {role === "creator"
                    ? "Portfolio URL"
                    : "Organization website"}
                  <input
                    type="url"
                    maxLength={300}
                    placeholder="https://"
                    value={draft.website}
                    onChange={(e) => update("website", e.target.value)}
                  />
                </label>
                <label>
                  {role === "creator" ? "Creative focus" : "Organization focus"}
                  <input
                    maxLength={160}
                    placeholder={
                      role === "creator"
                        ? "Short-form video, storytelling…"
                        : "The causes your organization supports…"
                    }
                    value={draft.focus}
                    onChange={(e) => update("focus", e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="role-profile-wide">
              {role === "creator"
                ? "About your work"
                : role === "nonprofit"
                  ? "Organization mission"
                  : "Responsibilities"}
              <textarea
                rows={3}
                maxLength={600}
                value={draft.bio}
                onChange={(e) => update("bio", e.target.value)}
              />
            </label>
            {role === "creator" && (
              <label>
                Project availability
                <select
                  value={draft.availability}
                  onChange={(e) => update("availability", e.target.value)}
                >
                  <option>Open to projects</option>
                  <option>Limited availability</option>
                  <option>Not accepting projects</option>
                </select>
              </label>
            )}
          </div>
        </section>
        <section
          className="role-profile-panel"
          aria-labelledby="account-settings"
        >
          <div className="role-profile-section-heading">
            <Settings2 size={20} />
            <div>
              <h2 id="account-settings">Account settings</h2>
              <p>
                Set your reporting preferences for this{" "}
                {config.label.toLowerCase()} profile.
              </p>
            </div>
          </div>
          <div className="role-profile-fields">
            <label>
              Preferred reporting time zone
              <select
                value={draft.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                <option value="America/New_York">Eastern time</option>
                <option value="America/Chicago">Central time</option>
                <option value="America/Denver">Mountain time</option>
                <option value="America/Los_Angeles">Pacific time</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label>
              {config.digest}
              <select
                value={draft.digest}
                onChange={(e) => update("digest", e.target.value)}
              >
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Off</option>
              </select>
            </label>
          </div>
        </section>
        <section className="role-profile-panel" aria-labelledby="notifications">
          <div className="role-profile-section-heading">
            <Bell size={20} />
            <div>
              <h2 id="notifications">Notifications</h2>
              <p>Choose the updates that matter to your role.</p>
            </div>
          </div>
          <div className="role-profile-alerts">
            {config.alerts.map((label, index) => (
              <label key={label}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={draft.notifications[index]}
                  onChange={(e) =>
                    update(
                      "notifications",
                      draft.notifications.map((enabled, item) =>
                        item === index ? e.target.checked : enabled,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p className="role-profile-note">
            These preferences are saved for the demo. Emails and scheduled
            reports are not sent.
          </p>
        </section>
        <div className="role-profile-actions">
          <div aria-live="polite">
            {message ? (
              <span className="role-profile-saved">
                <Check size={16} />
                {message}
              </span>
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              "Your profile settings stay on this browser."
            )}
            {error && <p role="alert">{error}</p>}
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={!dirty || imageBusy}
            onClick={() => {
              setDraft(profile);
              setMessage("");
              setError("");
            }}
          >
            Discard changes
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!dirty || imageBusy}
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
