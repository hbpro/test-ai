import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_SQL, startHarness, stopHarness, toolJson, type Harness } from "./harness.js";

describe("postgres-mcp-server gated write path (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness({ enableWrites: true, enableExplainAnalyze: true });
    await harness.pool.query(FIXTURE_SQL);
  }, 120_000);

  afterAll(async () => {
    await stopHarness(harness);
  }, 60_000);

  it("run_write_query is registered when PG_MCP_ENABLE_WRITES is true", async () => {
    const { tools } = await harness.client.listTools();
    expect(tools.map((t) => t.name)).toContain("run_write_query");
  });

  it("inserts a row that is then visible to a read query", async () => {
    const insertResult = await harness.client.callTool({
      name: "run_write_query",
      arguments: {
        sql: "INSERT INTO users (email, display_name) VALUES ($1, $2)",
        params: ["carol@example.com", "Carol"],
        confirm: true,
      },
    });
    const { rowCount } = toolJson<{ rowCount: number }>(insertResult);
    expect(rowCount).toBe(1);

    const readResult = await harness.client.callTool({
      name: "run_read_query",
      arguments: { sql: "SELECT display_name FROM users WHERE email = $1", params: ["carol@example.com"] },
    });
    const { rows } = toolJson<{ rows: Array<{ display_name: string }> }>(readResult);
    expect(rows[0]?.display_name).toBe("Carol");
  });

  it("rejects a write query without confirm: true", async () => {
    let sawError = false;
    try {
      const result = await harness.client.callTool({
        name: "run_write_query",
        arguments: { sql: "DELETE FROM users WHERE email = 'carol@example.com'" },
      });
      sawError = Boolean(result.isError);
    } catch {
      sawError = true;
    }
    expect(sawError).toBe(true);
  });

  it("rejects DDL through run_write_query", async () => {
    const result = await harness.client.callTool({
      name: "run_write_query",
      arguments: { sql: "DROP TABLE users", confirm: true },
    });
    expect(result.isError).toBe(true);
  });

  it("rejects stacked statements through run_write_query", async () => {
    const result = await harness.client.callTool({
      name: "run_write_query",
      arguments: { sql: "DELETE FROM users WHERE 1=0; DROP TABLE users;", confirm: true },
    });
    expect(result.isError).toBe(true);
  });

  it("explain_query with analyze=true actually executes when enabled", async () => {
    const result = await harness.client.callTool({
      name: "explain_query",
      arguments: { sql: "SELECT * FROM users", analyze: true },
    });
    const { analyzed } = toolJson<{ analyzed: boolean }>(result);
    expect(analyzed).toBe(true);
  });
});
