import { Waves } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "../styles.css";
import { initializeTheme } from "../theme.ts";
import "./styles.css";
import "./night-theme.css";
import PublicApp from "./PublicApp.tsx";
import "./refinements.css";
import "./ripple-ui.css";
import { ThemePicker } from "./ThemePicker.tsx";
import "./themes.css";
import "../adoption-is.css";

document.body.classList.add("public-demo");
initializeTheme();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <div className="public-notice">
        <Waves size={16} />
        <span className="notice-copy">
          <span className="notice-full">
            Public demo · fictional workspace saved in this browser · no real
            payments
          </span>
          <span className="notice-compact">
            Public demo · fictional data · no real payments
          </span>
        </span>
        <a href="https://github.com/Cooper2Rich/slander/tree/main">
          Project repository ↗
        </a>
        <ThemePicker />
      </div>
      <PublicApp />
    </HashRouter>
  </StrictMode>,
);
