import { defineConfig } from "@playwright/test";

const liveBaseURL = process.env.PUBLIC_DEMO_BASE_URL;

export default defineConfig({
  testDir: "./tests/public-browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: liveBaseURL || "http://127.0.0.1:3200/adoption-project/",
    trace: "retain-on-failure",
    actionTimeout: 10000,
  },
  webServer: liveBaseURL
    ? undefined
    : {
        command: "node scripts/preview-public.ts",
        url: "http://127.0.0.1:3200/adoption-project/",
        reuseExistingServer: false,
      },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1050 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 664 } } },
  ],
});
