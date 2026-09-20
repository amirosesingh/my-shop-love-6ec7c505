import registry from "../../../database/sqlserver/schema-registry.json";

export type SyncRegistryColumn = (typeof registry.tables)[number]["columns"][number];
export type SyncRegistryTable = (typeof registry.tables)[number];
export const syncSchemaRegistry = registry;
export const syncTable = (name: string) => registry.tables.find((table) => table.cloudTable === name);
