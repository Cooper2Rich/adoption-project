import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const storageKey = "adoption-is-theme-v1";
const changeEvent = "adoption-is-theme-change";

function readTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme: Theme) {
  document.body.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#131b2b" : "#25344f");
}

export function initializeTheme() {
  applyTheme(readTheme());
}

function subscribe(notify: (...args: any[]) => any) {
  const sync = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    applyTheme(readTheme());
    notify();
  };
  window.addEventListener("storage", sync);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener(changeEvent, notify);
  };
}

function getSnapshot(): Theme {
  return document.body.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light");
  const setTheme = (next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
    window.dispatchEvent(new Event(changeEvent));
  };
  return { theme, setTheme };
}
