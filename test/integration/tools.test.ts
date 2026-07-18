import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_SQL, startHarness, stopHarness, toolJson, type Harness } from "./harness.js";

describe("postgres-mcp-server tools (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await harness.pool.query(FIXTURE_SQL);
  }, 120_000);

  afterAll(async () => {
    await stopHarness(harness);
  }, 60_000);

  it("list_schemas returns the public schema", async () => {
    const result = await harness.client.callTool({ name: "list_schemas", arguments: {} });
    const { schemas } = toolJson<{ schemas: string[] }>(result);
    expect(schemas).toContain("public");
  });

  it("list_tables returns users and orders", async () => {
    const result = await harness.client.callTool({ name: "list_tables", arguments: { schema: "public" } });
    const { tables } = toolJson<{ tables: Array<{ schema: string; table: string; type: string }> }>(result);
    expect(tables.map((t) => t.table).sort()).toEqual(["orders", "users"]);
  });

  it("describe_table flags email as likely PII and reports the primary key", async () => {
    const result = await harness.client.callTool({
      name: "describe_table",
      arguments: { schema: "public", table: "users" },
    });
    const { columns } = toolJson<{
      columns: Array<{ name: string; likelyPii: boolean; primaryKey: boolean }>;
    }>(result);
    expect(columns.find((c) => c.name === "email")?.likelyPii).toBe(true);
    expect(columns.find((c) => c.name === "id")?.primaryKey).toBe(true);
  });

  it("describe_table errors on a nonexistent table", async () => {
    const result = await harness.client.callTool({
      name: "describe_table",
      arguments: { schema: "public", table: "does_not_exist" },
    });
    expect(result.isError).toBe(true);
  });

  it("list_indexes finds the explicit index on orders", async () => {
    const result = await harness.client.callTool({
      name: "list_indexes",
      arguments: { schema: "public", table: "orders" },
    });
    const { indexes } = toolJson<{ indexes: Array<{ index: string }> }>(result);
    expect(indexes.map((i) => i.index)).toContain("orders_user_id_idx");
  });

  it("list_foreign_keys finds the orders -> users relationship", async () => {
    const result = await harness.client.callTool({
      name: "list_foreign_keys",
      arguments: { schema: "public", table: "orders" },
    });
    const { foreignKeys } = toolJson<{
      foreignKeys: Array<{ table: string; references: { table: string } }>;
    }>(result);
    expect(foreignKeys[0]?.references.table).toBe("users");
  });

  it("run_read_query runs a parameterized SELECT and reports when the row limit truncated results", async () => {
    const result = await harness.client.callTool({
      name: "run_read_query",
      arguments: { sql: "SELECT * FROM orders WHERE user_id = $1 ORDER BY id", params: [1], limit: 1 },
    });
    const { rows, rowLimitReached } = toolJson<{ rows: unknown[]; rowLimitReached: boolean }>(result);
    expect(rows).toHaveLength(1);
    expect(rowLimitReached).toBe(true);
  });

  it("run_read_query rejects a non-SELECT statement", async () => {
    const result = await harness.client.callTool({
      name: "run_read_query",
      arguments: { sql: "DELETE FROM users" },
    });
    expect(result.isError).toBe(true);
  });

  it("run_read_query rejects stacked statements", async () => {
    const result = await harness.client.callTool({
      name: "run_read_query",
      arguments: { sql: "SELECT 1; DROP TABLE users;" },
    });
    expect(result.isError).toBe(true);
  });

  it("explain_query returns a plan without executing when analyze is omitted", async () => {
    const result = await harness.client.callTool({
      name: "explain_query",
      arguments: { sql: "SELECT * FROM users" },
    });
    const { analyzed, plan } = toolJson<{ analyzed: boolean; plan: unknown }>(result);
    expect(analyzed).toBe(false);
    expect(plan).toBeDefined();
  });

  it("explain_query rejects analyze=true when PG_MCP_ENABLE_EXPLAIN_ANALYZE is not set", async () => {
    const result = await harness.client.callTool({
      name: "explain_query",
      arguments: { sql: "SELECT * FROM users", analyze: true },
    });
    expect(result.isError).toBe(true);
  });

  it("sample_table redacts the email column but not others", async () => {
    const result = await harness.client.callTool({
      name: "sample_table",
      arguments: { schema: "public", table: "users", limit: 10 },
    });
    const { rows } = toolJson<{ rows: Array<Record<string, unknown>> }>(result);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.email).toBe("[REDACTED]");
      expect(row.display_name).not.toBe("[REDACTED]");
    }
  });

  it("run_write_query is not registered when writes are disabled", async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("run_write_query");
  });

  it("refresh_schema succeeds once, then rate-limits an immediate repeat call", async () => {
    const first = await harness.client.callTool({ name: "refresh_schema", arguments: {} });
    expect(first.isError).toBeFalsy();
    const second = await harness.client.callTool({ name: "refresh_schema", arguments: {} });
    expect(second.isError).toBe(true);
  });
});
