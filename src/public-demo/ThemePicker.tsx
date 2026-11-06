import { useTheme } from "../theme";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <label className="theme-picker">
      <span>Theme</span>
      <select
        aria-label="Website theme"
        value={theme}
        onChange={(event) =>
          setTheme(event.target.value === "dark" ? "dark" : "light")
        }
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
