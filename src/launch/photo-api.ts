import { makeFunctionReference } from "convex/server";
import type { Doc } from "../../convex/functions.ts";
export type PhotoEntry = Doc<"photoEntries"> & {
  trackedPath: string;
  versions: Doc<"photoVersions">[];
  events: Doc<"photoEvents">[];
};
type Scope = { campaignId: string };
export const photoApi = {
  workspace: makeFunctionReference<"query", Scope, PhotoEntry[]>(
    "photos:workspace",
  ),
  reserve: makeFunctionReference<
    "mutation",
    Scope & {
      operationId: string;
      filename: string;
      size: number;
      type: "image/jpeg" | "image/png";
    },
    Doc<"photoUploads">
  >("photos:reserve"),
  submit: makeFunctionReference<
    "mutation",
    Scope & {
      operationId: string;
      entryId?: Doc<"photoEntries">["_id"];
      expectedVersion?: number;
      title: string;
      description: string;
      photos: Doc<"photoUploads">["_id"][];
    },
    Doc<"photoEntries">
  >("photos:submit"),
  review: makeFunctionReference<
    "mutation",
    Scope & {
      entryId: Doc<"photoEntries">["_id"];
      expectedVersion: number;
      operationId: string;
      decision: "approved" | "rejected" | "revisions";
      reason: string;
    },
    Doc<"photoEntries">
  >("photos:review"),
};
