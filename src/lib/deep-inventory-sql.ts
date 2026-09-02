import installerSql from "../../supabase/sql/stage5/20260902010000_schema_inventory_deep.sql?raw";

/** Exact, idempotent installer offered when an external central database is behind. */
export const DEEP_INVENTORY_INSTALLER_SQL = installerSql;

export const DEEP_INVENTORY_INSTALLER_FILENAME =
  "20260902010000_schema_inventory_deep.sql";