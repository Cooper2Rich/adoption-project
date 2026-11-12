import { Component, useCallback, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
} from "convex/react";
import { harnessSession } from "./api";
import { PreviewWorkspace } from "./PreviewWorkspace";
import { CampaignSetup } from "./CampaignSetup";
import { ClerkProvider, SignIn, UserButton, useAuth } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import "./preview.css";

class AccessBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="setup-message">
        <h1>Workspace unavailable</h1>
        <p>Your session or campaign access has changed. Reload to reconnect.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
function useHarnessIdentity() {
  const fetchAccessToken = useCallback(
    async () => (await harnessSession()).token,
    [],
  );
  return { isLoading: false, isAuthenticated: true, fetchAccessToken };
}
function LocalWorkspace() {
  const [screen, setScreen] = useState("preview");
  return (
    <>
      <nav className="workspace-tabs" aria-label="Workspace">
        <button onClick={() => setScreen("preview")}>Allocation preview</button>
        <button onClick={() => setScreen("setup")}>Campaign setup</button>
      </nav>
      {screen === "preview" ? (
        <PreviewWorkspace />
      ) : (
        <>
          <div className="preview-notice">
            Isolated verification · synthetic identity · real Clerk evidence
            pending T38
          </div>
          <CampaignSetup />
        </>
      )}
    </>
  );
}
function AuthenticatedWorkspace({ local = false }: { local?: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading)
    return (
      <main className="setup-message" role="status">
        Connecting to your workspace…
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className="setup-message" role="alert">
        Session unavailable. Reload to reconnect.
      </main>
    );
  return local ? <LocalWorkspace /> : <CampaignSetup />;
}
function ClerkEntry() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <main className="setup-message" role="status">
        Loading sign-in…
      </main>
    );
  if (!isSignedIn)
    return (
      <main className="setup-message">
        <h1>adoption.is manager sign-in</h1>
        <SignIn routing="hash" />
      </main>
    );
  return (
    <>
      <header className="preview-header">
        <a className="wordmark" href="/">
          adoption.is
        </a>
        <span>Campaign workspace</span>
        <UserButton />
      </header>
      <AuthenticatedWorkspace />
    </>
  );
}
async function start() {
  const element = document.getElementById("root");
  if (!element) throw new Error("Application root is missing");
  const root = createRoot(element);
  try {
    if (!(
      import.meta.env.DEV &&
      import.meta.env.VITE_LOCAL_LAUNCH_HARNESS === "owned-isolated-run"
    )) {
      const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
      const url = import.meta.env.VITE_CONVEX_URL;
      if (!publishableKey || !url || new URL(url).protocol !== "https:") {
        root.render(
          <main className="setup-message" role="alert">
            <h1>Manager sign-in unavailable</h1>
            <p>
              Clerk sign-in and the secure campaign service must be configured
              before this workspace can open.
            </p>
          </main>,
        );
        return;
      }
      const client = new ConvexReactClient(url);
      root.render(
        <ClerkProvider publishableKey={publishableKey}>
          <ConvexProviderWithClerk client={client} useAuth={useAuth}>
            <AccessBoundary>
              <ClerkEntry />
            </AccessBoundary>
          </ConvexProviderWithClerk>
        </ClerkProvider>,
      );
      return;
    }
    const session = await harnessSession();
    const client = new ConvexReactClient(session.url);
    root.render(
      <AccessBoundary>
        <ConvexProviderWithAuth client={client} useAuth={useHarnessIdentity}>
          <AuthenticatedWorkspace local />
        </ConvexProviderWithAuth>
      </AccessBoundary>,
    );
  } catch (err) {
    root.render(
      <main className="setup-message">
        <h1>Allocation preview</h1>
        <p>
          {err instanceof Error ? err.message : "Workspace could not start."}
        </p>
      </main>,
    );
  }
}
void start();
