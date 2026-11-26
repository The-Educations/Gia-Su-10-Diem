import { defineConfig, devices } from "@playwright/test";

// Duyệt nhanh trên Firefox, Safari (WebKit), iPhone và Android. Không nằm trong cổng "Validate" của CI chính.
// iPhone và Pixel ở đây là mô phỏng khung hình và cảm ứng bằng engine trình duyệt, không phải máy thật.
const port = process.env.E2E_PORT || "4175";
export default defineConfig({
  testDir: "test/cross-browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: "node test/e2e-server.js",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "safari", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
