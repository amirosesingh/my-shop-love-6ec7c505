/**
 * Persistent copy of the first-run branding (company / terminal name), kept in
 * the app's user-data folder so an update, a cleared cache or a changed local
 * server origin never re-asks the operator for the company name.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const file = () => path.join(app.getPath("userData"), "branding.json");

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), "utf8"));
    return parsed && parsed.company ? parsed : null;
  } catch {
    return null;
  }
}

function write(branding) {
  try {
    if (!branding) {
      fs.rmSync(file(), { force: true });
      return { ok: true };
    }
    fs.writeFileSync(file(), JSON.stringify(branding, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { read, write };