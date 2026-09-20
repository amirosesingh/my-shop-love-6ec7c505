const { safeError } = require("./errors.cjs");

const SYSTEM_DATABASES = new Set(["master", "model", "msdb", "tempdb"]);

async function listDatabases(manager, profile) {
  try {
    return await manager.temporary(profile, "master", async (pool) => {
      const result = await pool.request().query(`SELECT name, state_desc, compatibility_level
        FROM sys.databases
        WHERE HAS_DBACCESS(name) = 1 AND state_desc = 'ONLINE'
        ORDER BY name;`);
      return { ok: true, databases: (result.recordset ?? []).filter((row) => !SYSTEM_DATABASES.has(String(row.name).toLowerCase())) };
    });
  } catch (error) { return { ...safeError(error), databases: [] }; }
}

module.exports = { listDatabases, SYSTEM_DATABASES };
