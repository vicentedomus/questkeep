// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx serve . --listen 3000 --no-clipboard',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
