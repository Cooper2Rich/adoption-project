import { makeFunctionReference, type RegisteredQuery } from "convex/server";
import type { list } from "../../convex/operatorIncidents.ts";
type QueryResult<T> =
  T extends RegisteredQuery<"public", any, infer R> ? Awaited<R> : never;
export type OperatorIncident = QueryResult<typeof list>[number];
export const incidentApi = {
  list: makeFunctionReference<
    "query",
    { campaignId: string },
    OperatorIncident[]
  >("operatorIncidents:list"),
  register: makeFunctionReference<
    "mutation",
    { campaignId: string },
    { registered: boolean }
  >("operatorIncidents:registerContact"),
  configure: makeFunctionReference<
    "mutation",
    { campaignId: string; designatedOperator: string },
    { configured: boolean }
  >("operatorIncidents:configure"),
  resume: makeFunctionReference<
    "mutation",
    { campaignId: string },
    { resumed: boolean }
  >("operatorIncidents:resume"),
};
