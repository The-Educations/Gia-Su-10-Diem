import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4175",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node test/e2e-server.js",
    url: "http://127.0.0.1:4175/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
