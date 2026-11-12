import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/launch-browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3210", trace: "retain-on-failure" },
  webServer: [3210, 3211].map((port) => ({
    command: `node scripts/launch/dev.mjs --port ${port}`,
    url: `http://127.0.0.1:${port}/__allocation/health`,
    reuseExistingServer: false,
    timeout: 180000,
  })),
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        baseURL: "http://127.0.0.1:3211",
      },
    },
  ],
});
