import {
  makeFunctionReference,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import type {
  read,
  evaluate,
  checkPaidActivation,
} from "../../convex/readiness.ts";
type QueryResult<T> =
  T extends RegisteredQuery<"public", any, infer R> ? Awaited<R> : never;
type MutationResult<T> =
  T extends RegisteredMutation<"public", any, infer R> ? Awaited<R> : never;
export type LaunchReadiness = QueryResult<typeof read>;
export const readinessApi = {
  read: makeFunctionReference<"query", { campaignId: string }, LaunchReadiness>(
    "readiness:read",
  ),
  evaluate: makeFunctionReference<
    "mutation",
    { campaignId: string },
    MutationResult<typeof evaluate>
  >("readiness:evaluate"),
  check: makeFunctionReference<
    "mutation",
    { campaignId: string; expectedRevision?: string },
    MutationResult<typeof checkPaidActivation>
  >("readiness:checkPaidActivation"),
};
