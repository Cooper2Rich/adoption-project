import { ClerkProvider, SignIn, UserButton, useAuth } from "@clerk/react";
import {
  ConvexProvider,
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Component, useCallback, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { harnessSession } from "./api.ts";
import { CampaignSetup } from "./CampaignSetup.tsx";
import { CreatorInvitations, CreatorWorkspace } from "./CreatorWorkspace.tsx";
import { PublicCampaign } from "./PublicCampaign.tsx";
import { PhotoAuth } from "./photo-auth.tsx";
import { PhotoReview } from "./Photos.tsx";
import "./preview.css";
import { OperatorIncidents } from "./OperatorIncidents.tsx";
import { PreviewWorkspace } from "./PreviewWorkspace.tsx";
import { LaunchReadiness } from "./LaunchReadiness.tsx";
import { FundraisingLedger } from "./Fundraising.tsx";
import { PaidMetrics } from "./PaidMetrics.tsx";

function PublicFailure() {
  return (
    <main className="setup-message">
      <h1>Campaign unavailable</h1>
      <p>This page could not be loaded. Reconnect and retry.</p>
      <a href="/">Return to campaign</a>
      <p>
        <button onClick={() => location.reload()}>Retry campaign</button>
      </p>
    </main>
  );
}
class PublicBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? <PublicFailure /> : this.props.children;
  }
}
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
        <p>
          Your session or campaign access has changed. Use the invited identity,
          then sign in again through Clerk.
        </p>
        <a href="?workspace=creator">Retry creator access</a>
        <p>
          <a href="?workspace=signin">Clerk sign-in and recovery</a>
        </p>
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
  if (new URLSearchParams(location.search).get("workspace") === "creator")
    return (
      <>
        <div className="preview-notice">
          Isolated verification · synthetic identity · real Clerk evidence
          pending T38
        </div>
        <CreatorWorkspace />
      </>
    );
  return <ManagerWorkspace local />;
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
  return local ? (
    <LocalWorkspace />
  ) : new URLSearchParams(location.search).get("workspace") === "creator" ? (
    <CreatorWorkspace />
  ) : (
    <ManagerWorkspace />
  );
}
// Local verification and Clerk sessions share the exact navigation/renderer.
// Only the isolated advisory-preview tab and fixture banner differ.
function ManagerWorkspace({ local = false }: { local?: boolean }) {
  const [screen, setScreen] = useState(local ? "preview" : "setup");
  return (
    <>
      <nav className="workspace-tabs" aria-label="Workspace">
        {local ? (
          <button onClick={() => setScreen("preview")}>
            Allocation preview
          </button>
        ) : null}
        <button onClick={() => setScreen("setup")}>Campaign setup</button>
        <button onClick={() => setScreen("invitations")}>
          Creator invitations
        </button>
        <button onClick={() => setScreen("photos")}>Creative review</button>
        <button onClick={() => setScreen("incidents")}>
          Operator incidents
        </button>
        <button onClick={() => setScreen("readiness")}>Launch readiness</button>
        <button onClick={() => setScreen("fundraising")}>
          Fundraising ledger
        </button>
        <button onClick={() => setScreen("paid")}>Paid performance</button>
        <a href="?workspace=creator">My creator workspace</a>
      </nav>
      {local && screen !== "preview" ? (
        <div className="preview-notice">
          Isolated verification · synthetic identity · real Clerk evidence
          pending T38
        </div>
      ) : null}
      {screen === "preview" && local ? (
        <PreviewWorkspace />
      ) : screen === "paid" ? (
        <PaidMetrics />
      ) : screen === "fundraising" ? (
        <main className="preview-layout">
          <FundraisingLedger audience="manager" />
        </main>
      ) : screen === "readiness" ? (
        <LaunchReadiness />
      ) : screen === "incidents" ? (
        <OperatorIncidents />
      ) : screen === "photos" ? (
        <PhotoReview />
      ) : screen === "setup" ? (
        <CampaignSetup />
      ) : (
        <CreatorInvitations />
      )}
    </>
  );
}
function ClerkEntry() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const photoToken = useCallback(
    () => getToken({ template: "convex" }),
    [getToken],
  );
  if (!isLoaded)
    return (
      <main className="setup-message" role="status">
        Loading sign-in…
      </main>
    );
  if (
    !isSignedIn ||
    new URLSearchParams(location.search).get("workspace") === "signin"
  )
    return (
      <main className="setup-message">
        <h1>adoption.is campaign sign-in</h1>
        <p>
          Use your invited email. Clerk provides sign-in, email verification and
          supported account recovery.
        </p>
        {isSignedIn ? (
          <>
            <p>
              Manage your Clerk session or sign out to use another invited
              identity.
            </p>
            <UserButton />
          </>
        ) : (
          <SignIn
            routing="hash"
            fallbackRedirectUrl={
              new URLSearchParams(location.search).get("workspace") ===
              "creator"
                ? "?workspace=creator"
                : "/?workspace=manager"
            }
          />
        )}
        <a href="?workspace=public">View the public campaign</a>
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
      <PhotoAuth.Provider value={photoToken}>
        <AuthenticatedWorkspace />
      </PhotoAuth.Provider>
    </>
  );
}
async function start() {
  const element = document.getElementById("root");
  if (!element) throw new Error("Application root is missing");
  const root = createRoot(element);
  const workspace = new URLSearchParams(location.search).get("workspace");
  if (!workspace || workspace === "public") {
    try {
      const url =
        import.meta.env.DEV &&
        import.meta.env.VITE_LOCAL_LAUNCH_HARNESS === "owned-isolated-run"
          ? (await (await fetch("/__allocation/public-config")).json()).url
          : import.meta.env.VITE_CONVEX_URL;
      if (!url) throw new Error("Campaign service unavailable");
      root.render(
        <PublicBoundary>
          <ConvexProvider client={new ConvexReactClient(url)}>
            <PublicCampaign />
          </ConvexProvider>
        </PublicBoundary>,
      );
    } catch {
      root.render(<PublicFailure />);
    }
    return;
  }
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
          <PhotoAuth.Provider
            value={async () => (await harnessSession()).token}
          >
            <AuthenticatedWorkspace local />
          </PhotoAuth.Provider>
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
