import {
  queryGeneric,
  mutationGeneric,
  internalMutationGeneric,
  type DataModelFromSchemaDefinition,
  type QueryBuilder,
  type MutationBuilder,
  type GenericQueryCtx,
  type GenericMutationCtx,
  type DocumentByName,
} from "convex/server";
import type schema from "./schema.ts";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type Doc<Table extends keyof DataModel> = DocumentByName<
  DataModel,
  Table
>;
export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> =
  internalMutationGeneric;
