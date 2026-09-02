import { describe, expect, it } from "vitest";
import { computeDeepDrift, computeLegacyDeepDrift, inventoryFromPayload } from "../deep-drift";
import { classifyCentralInventoryError } from "../central-inventory.functions";
import { computeLocalDeepDrift, parseLocalExpectations } from "../local-drift";
import type { CentralTableSchema } from "../central-schema";
import { buildCloudSql, buildLocalSql, type SchemaGap } from "../schema-health";

const schema: CentralTableSchema[] = [
  {
    table: "sales",
    label: "Sales",
    primaryKey: "id",
    columns: [
      { name: "id", pgType: "uuid" },
      { name: "total", pgType: "numeric(18,4) not null default 0" },
    ],
    indexes: [
      {
        name: "sales_client_txn_idx",
        sql: "create index if not exists sales_client_txn_idx on public.sales (client_transaction_id);",
        dependsOnColumns: ["client_transaction_id"],
        always: true,
      },
    ],
    constraints: [{ name: "sales_total_nonneg", definition: "check (total >= 0)" }],
    policies: [{ name: "staff read", sql: 'create policy "staff read" on public.sales for select using (true)' }],
  },
];

const healthy = {
  sales: {
    rls: true,
    columns: {
      id: { type: "uuid", nullable: false, default: null },
      total: { type: "numeric", nullable: false, default: "0" },
    },
    constraints: {
      sales_pkey: { kind: "p", definition: "PRIMARY KEY (id)" },
      sales_total_nonneg: { kind: "c", definition: "CHECK (total >= 0)" },
    },
    indexes: ["sales_pkey", "sales_client_txn_idx"],
    triggers: [],
    policies: ["staff read"],
  },
};

describe("deep central drift", () => {
  it("reports zero drift for a fully repaired database", () => {
    expect(computeDeepDrift(inventoryFromPayload(healthy), schema)).toEqual([]);
  });

  it("reports exactly the real gaps and nothing else", () => {
    const broken = JSON.parse(JSON.stringify(healthy)) as Record<string, any>;
    broken.sales.rls = false;
    broken.sales.policies = [];
    broken.sales.indexes = ["sales_pkey"];
    broken.sales.columns.total = { type: "numeric", nullable: true, default: null };
    delete broken.sales.constraints["sales_total_nonneg"];

    const found = computeDeepDrift(inventoryFromPayload(broken), schema);
    const categories = found.map((f) => f.category).sort();
    expect(categories).toEqual([
      "constraint",
      "default",
      "index",
      "nullability",
      "policy",
      "policy",
      "security",
    ]);
    expect(found.every((f) => f.table === "sales")).toBe(true);
  });

  it("ignores tables the definition does not claim", () => {
    const extra = { ...healthy, legacy_thing: { rls: false, columns: {}, indexes: [] } };
    expect(computeDeepDrift(inventoryFromPayload(extra), schema)).toEqual([]);
  });
});

describe("mixed-version central inventory", () => {
  it("uses only facts the legacy helper can prove", () => {
    const found = computeLegacyDeepDrift(
      {
        tables: [
          {
            table: "sales",
            rls: false,
            policies: 0,
            indexes: 0,
            columns: [
              { name: "id", notnull: true, has_default: false },
              { name: "total", notnull: false, has_default: false },
            ],
            foreign_keys: [],
          },
        ],
      },
      schema,
    );
    expect(found.map((finding) => finding.category).sort()).toEqual([
      "default",
      "index",
      "nullability",
      "policy",
      "security",
    ]);
    expect(found.some((finding) => finding.detail.includes("sales_total_nonneg"))).toBe(false);
  });

  it("distinguishes missing, forbidden and unavailable helpers", () => {
    expect(classifyCentralInventoryError('HTTP 404: {"code":"PGRST202"}')).toBe("not_installed");
    expect(classifyCentralInventoryError("HTTP 403: permission denied")).toBe("not_permitted");
    expect(classifyCentralInventoryError("Network error")).toBe("unavailable");
  });
});

describe("deep local drift", () => {
  const master = `
CREATE TABLE dbo.sales (
  id NVARCHAR(64) NOT NULL PRIMARY KEY,
  total DECIMAL(18,4) NOT NULL DEFAULT (0),
  note NVARCHAR(MAX) NULL
);
CREATE INDEX sales_note_idx ON dbo.sales (note);
`;

  it("finds nullability, default and index gaps", () => {
    const expectations = parseLocalExpectations(master);
    expect(expectations[0]?.columns).toHaveLength(3);
    const findings = computeLocalDeepDrift(expectations, {
      sales: {
        columns: {
          id: { nullable: false, default: null },
          total: { nullable: true, default: null },
          note: { nullable: true, default: null },
        },
        primaryKey: ["pk_sales"],
        indexes: ["pk_sales"],
      },
    });
    expect(findings.map((f) => f.category).sort()).toEqual(["default", "index", "nullability"]);
  });
});

describe("generated repair files", () => {
  const gaps: SchemaGap[] = [
    {
      environment: "cloud",
      table: "sales",
      columns: [],
      missingTable: false,
      category: "security",
      detail: "row-level security is switched off",
      statements: ['alter table public."sales" enable row level security;'],
    },
  ];

  it("never drops anything, in either dialect", () => {
    const cloud = buildCloudSql(gaps, "supabase_001_20260902.sql");
    const local = buildLocalSql(
      [{ ...gaps[0]!, environment: "local", statements: ["ALTER TABLE dbo.[sales] ADD [x] INT NULL;"] }],
      "local_001_20260902.sql",
    );
    for (const sql of [cloud, local]) {
      const code = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      expect(/\bdrop\b/i.test(code)).toBe(false);
    }
    expect(cloud).toContain("enable row level security");
  });

  it("adds missing columns with their real type", () => {
    const sql = buildCloudSql(
      [
        {
          environment: "cloud",
          table: "sales",
          columns: ["total"],
          missingTable: false,
          types: { total: "numeric(18,4)" },
        },
      ],
      "supabase_002_20260902.sql",
    );
    expect(sql).toContain('add column if not exists "total" numeric(18,4);');
  });
});
