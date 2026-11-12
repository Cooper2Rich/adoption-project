import type { AuthConfig } from "convex/server";
import { clerkProviders } from "./clerkIdentity.ts";

// Fixture trust is generated outside this application, in an isolated local run.
// An unconfigured production deployment accepts no application identities.
export default {
  providers: clerkProviders(process.env.CLERK_JWT_ISSUER_DOMAIN),
} satisfies AuthConfig;
