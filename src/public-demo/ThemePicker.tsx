import { useEffect, useState } from "react";

const storageKey = "blue-ripple-theme-v1";
type Theme = "ripple" | "acu" | "theme1";

function isTheme(value: string | null): value is Theme {
  return value === "ripple" || value === "acu" || value === "theme1";
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    return isTheme(saved) ? saved : "ripple";
  } catch {
    return "ripple";
  }
}

export function initializeTheme() {
  document.body.dataset.theme = readTheme();
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const next = readTheme();
      document.body.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <label className="theme-picker">
      <span>Theme</span>
      <select
        aria-label="Website theme"
        value={theme}
        onChange={(event) => {
          const selected = event.target.value;
          const next = isTheme(selected) ? selected : "ripple";
          document.body.dataset.theme = next;
          setTheme(next);
          try {
            localStorage.setItem(storageKey, next);
          } catch {
            // The theme still works for this session when storage is unavailable.
          }
        }}
      >
        <option value="ripple">Blue Ripple</option>
        <option value="acu">Austin Christian</option>
        <option value="theme1">Theme 1</option>
      </select>
    </label>
  );
}
