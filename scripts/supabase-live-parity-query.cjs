const registry = require("../database/sqlserver/schema-registry.json");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const values = registry.tables.flatMap((table) =>
  table.columns.map((column) => `(${quote(table.cloudTable)},${quote(column.cloudColumn)})`));
const names = registry.tables.map((table) => quote(table.cloudTable)).join(",");
process.stdout.write(`with expected(table_name,column_name) as (values ${values.join(",")}),
live as (select table_name,column_name from information_schema.columns where table_schema='public' and table_name in (${names}))
select jsonb_build_object(
  'missing_in_live',(select coalesce(jsonb_agg(e order by table_name,column_name),'[]'::jsonb) from (select * from expected except select * from live) e),
  'extra_in_live',(select coalesce(jsonb_agg(l order by table_name,column_name),'[]'::jsonb) from (select * from live except select * from expected) l)
) as parity;`);
