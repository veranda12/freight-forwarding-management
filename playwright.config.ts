import { defineConfig, devices } from "@playwright/test";

/**
 * E2E "demo ke klien" — menjalankan aplikasi nyata lalu menelusuri alur bisnis
 * melalui UI persis seperti presentasi. Butuh DB sudah di-seed (`npm run db:seed`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "id-ID",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3000",
    url: "http://localhost:3000/login",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
