import { ArrowRight, Building2, Plus, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import type { DemoAccess, DemoOptions, Identity } from "../types.ts";

export function IdentityPicker({
  access,
  options,
  onSelect,
  refreshOptions,
}: {
  access: DemoAccess;
  options: DemoOptions;
  onSelect: (id: string) => void;
  refreshOptions: () => Promise<void>;
}) {
  const nonprofit = access.role === "nonprofit";
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await api<Identity>("/demo-creators", access, "POST", {
        name,
      });
      await refreshOptions();
      onSelect(profile.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="identity-picker">
      <span className="identity-picker-icon">
        {nonprofit ? <Building2 size={30} /> : <UserRound size={30} />}
      </span>
      <span className="eyebrow">
        {nonprofit
          ? "YOUR ORGANIZATION. YOUR WORKSPACE."
          : "YOUR IDEAS. YOUR CREATOR STUDIO."}
      </span>
      <h1>
        {nonprofit ? "Choose your nonprofit." : "Choose your creator profile."}
      </h1>
      <p>
        {nonprofit
          ? "Select an organization to open only its projects, submissions, and scoped exceptions."
          : "See published projects, follow your submissions, and explore eligible creative work."}
      </p>
      <div className="identity-picker-form">
        <label>
          {nonprofit ? "Nonprofit organization" : "Creator profile"}
          <select
            aria-label={
              nonprofit ? "Nonprofit organization" : "Creator profile"
            }
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">
              {nonprofit ? "Select a nonprofit" : "Select a creator"}
            </option>
            {(nonprofit ? options.nonprofits : options.creators).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary full"
          disabled={!selected || busy}
          onClick={() => onSelect(selected)}
        >
          Open {nonprofit ? "nonprofit workspace" : "creator studio"}
          <ArrowRight size={16} />
        </button>
        {!nonprofit &&
          (!adding ? (
            <button className="text-button" onClick={() => setAdding(true)}>
              <Plus size={15} />
              Create a demo creator profile
            </button>
          ) : (
            <form onSubmit={createProfile} className="new-creator-form">
              <label>
                Your name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Creator name"
                />
              </label>
              <button className="button secondary full" disabled={busy}>
                {busy ? "Creating…" : "Create profile & continue"}
              </button>
            </form>
          ))}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <small>
        Demo selection now. Account sign-in will choose this view later.
      </small>
    </section>
  );
}
