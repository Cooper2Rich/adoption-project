import { Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { prepareProfileImage } from "../profile-image.ts";
import { Avatar } from "./ui.tsx";

export function ProfileImageUpload({
  image,
  name,
  organization,
  onChange,
  onBusyChange,
}: {
  image: string;
  name: string;
  organization: boolean;
  onChange: (image: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = organization ? "organization logo" : "profile picture";
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const request = ++version.current;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const next = await prepareProfileImage(file);
      if (request === version.current) onChange(next);
    } catch (error) {
      if (request === version.current) setError((error as Error).message);
    } finally {
      if (request === version.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  return (
    <div className="profile-image-upload">
      <Avatar
        name={name}
        src={image}
        logo={organization}
        alt={`Selected ${label}`}
        index={2}
      />
      <div>
        <h3>{organization ? "Organization logo" : "Profile picture"}</h3>
        <p>
          JPG, PNG or WebP · up to 5 MB. Save changes to update your profile and
          sidebar.
        </p>
        <div className="profile-image-buttons">
          <input
            ref={input}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Upload ${label}`}
            onChange={chooseImage}
            disabled={busy}
          />
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            {busy
              ? "Preparing image…"
              : `${image ? "Replace" : "Upload"} ${label}`}
          </button>
          {image && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                onChange("");
                setError("");
              }}
            >
              Remove {label}
            </button>
          )}
        </div>
        <span className="sr-only" role="status">
          {busy ? "Preparing image" : ""}
        </span>
        {error && (
          <p role="alert" className="profile-image-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
