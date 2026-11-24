import { defineConfig, devices } from "@playwright/test";

// The suite runs against a production build (`next build` then `next start`),
// so it sees the same CSP, headers and bundles as the deployed site. E2E_PORT
// picks the port; it defaults to 3000.
const port = Number(process.env.E2E_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `E2E_PORT must be a port number, got "${process.env.E2E_PORT}"`
  );
}
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
