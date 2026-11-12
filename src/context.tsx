import { createContext, useContext } from "react";
import type { DemoAccess, Identity, Role, Workspace } from "./types.ts";

export interface WorkspaceContextValue extends Workspace {
  role: Role;
  access: DemoAccess;
  identity: Identity | null;
  setRole: (role: Role) => void;
  search: string;
  setSearch: (query: string) => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace context is missing.");
  return context;
}
