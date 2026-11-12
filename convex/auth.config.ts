import type { AuthConfig } from "convex/server";

// Fixture trust is generated outside this application, in an isolated local run.
// An unconfigured production deployment accepts no application identities.
export default {
  providers: process.env.CLERK_JWT_ISSUER_DOMAIN
    ? [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }]
    : [],
} satisfies AuthConfig;
