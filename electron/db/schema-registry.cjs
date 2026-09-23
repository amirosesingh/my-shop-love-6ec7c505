const fs = require("node:fs");
const path = require("node:path");

const registryPath = () => path.join(__dirname, "..", "..", "database", "sqlserver", "schema-registry.json");
function loadRegistry() {
  const file = registryPath();
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    const problem = new Error(`The packaged SQL Server schema registry could not be loaded from ${file}. Reinstall or update the desktop app.`);
    problem.code = "ESCHEMA_REGISTRY";
    problem.cause = error;
    throw problem;
  }
  if (!Array.isArray(registry.tables) || registry.tables.length === 0) {
    const problem = new Error("The packaged SQL Server schema registry is empty. Reinstall or update the desktop app.");
    problem.code = "ESCHEMA_REGISTRY";
    throw problem;
  }
  return registry;
}
module.exports = { loadRegistry, registryPath };
