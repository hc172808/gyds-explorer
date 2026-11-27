const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const files = {
  installer: readFileSync(path.join(root, "scripts/install-auto-update.sh"), "utf8"),
  api: readFileSync(path.join(root, "artifacts/api-server/src/routes/system-settings.ts"), "utf8"),
  legacyApi: readFileSync(path.join(root, "scripts/legacy-auto-update-routes.cjs"), "utf8"),
  adminUi: readFileSync(path.join(root, "artifacts/solana-explorer/src/pages/AdminDashboard.tsx"), "utf8"),
  serverGuide: readFileSync(path.join(root, "SERVER_SETUP.md"), "utf8"),
  projectGuide: readFileSync(path.join(root, "replit.md"), "utf8"),
  todo: readFileSync(path.join(root, "todo.md"), "utf8"),
};

test("monthly auto-update scheduler, API, UI, and guides use day 15", () => {
  assert.match(files.installer, /OnCalendar=\*\-\*\-15 03:00:00 America\/Guyana/);
  assert.match(files.installer, /day 15 at 03:00 America\/Guyana time/);
  assert.match(files.api, /15th of each month at 03:00/);
  assert.match(files.legacyApi, /15th of each month at 03:00/);
  assert.match(files.adminUi, /On the 15th/);
  assert.match(files.adminUi, /15th of each month at 03:00/);
  assert.match(files.serverGuide, /15th of each month at 03:00/);
  assert.match(files.projectGuide, /15th at 03:00 America\/Guyana time/);
  assert.match(files.todo, /on the 15th of each month at 03:00/i);
});
