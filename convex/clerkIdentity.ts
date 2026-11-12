// The test issuer is installed only in a copied run-owned deployment. Never trust
// a fixture, loopback or malformed issuer through production configuration.
export function clerkProviders(issuer: string | undefined) {
  if (!issuer) return [];
  try {
    const url = new URL(issuer);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !url.hostname.includes(".") ||
      /(^|\.)(localhost|invalid|test|example|local)$/.test(url.hostname) ||
      /^\d+(\.\d+){3}$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      return [];
    return [{ domain: url.origin, applicationID: "convex" }];
  } catch {
    return [];
  }
}
