import installerSql from "../../supabase/schema.sql?raw";

/** Exact, idempotent installer offered when an external central database is behind. */
export const DEEP_INVENTORY_INSTALLER_SQL = installerSql;

export const DEEP_INVENTORY_INSTALLER_FILENAME =
  "schema.sql";