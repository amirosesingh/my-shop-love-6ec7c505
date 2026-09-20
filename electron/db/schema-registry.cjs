const fs = require("node:fs");
const path = require("node:path");

const registryPath = () => path.join(__dirname, "..", "..", "database", "sqlserver", "schema-registry.json");
function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(registryPath(), "utf8")); }
  catch { return { version: 0, tables: [] }; }
}
module.exports = { loadRegistry, registryPath };
