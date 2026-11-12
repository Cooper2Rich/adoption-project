import { Component, useCallback, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
} from "convex/react";
import { harnessSession } from "./api";
import { PreviewWorkspace } from "./PreviewWorkspace";
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
function AuthenticatedWorkspace() {
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
  return <PreviewWorkspace />;
}
async function start() {
  const element = document.getElementById("root");
  if (!element) throw new Error("Application root is missing");
  const root = createRoot(element);
  try {
    const session = await harnessSession();
    const client = new ConvexReactClient(session.url);
    root.render(
      <AccessBoundary>
        <ConvexProviderWithAuth client={client} useAuth={useHarnessIdentity}>
          <AuthenticatedWorkspace />
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
