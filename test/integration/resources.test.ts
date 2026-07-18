import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_SQL, startHarness, stopHarness, type Harness } from "./harness.js";

describe("postgres-mcp-server resources (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await harness.pool.query(FIXTURE_SQL);
  }, 120_000);

  afterAll(async () => {
    await stopHarness(harness);
  }, 60_000);

  it("postgres://schemas lists the public schema and its tables", async () => {
    const result = await harness.client.readResource({ uri: "postgres://schemas" });
    const text = result.contents[0]?.text as string;
    const snapshot = JSON.parse(text) as {
      schemas: string[];
      tables: Array<{ schema: string; table: string }>;
    };
    expect(snapshot.schemas).toContain("public");
    expect(snapshot.tables.map((t) => t.table).sort()).toEqual(["orders", "users"]);
  });

  it("resources/templates/list exposes the table-schema template", async () => {
    const { resourceTemplates } = await harness.client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain("postgres://{schema}/{table}/schema");
  });

  it("postgres://public/users/schema returns column metadata with a PII flag", async () => {
    const result = await harness.client.readResource({ uri: "postgres://public/users/schema" });
    const text = result.contents[0]?.text as string;
    const body = JSON.parse(text) as { columns: Array<{ name: string; likelyPii: boolean }> };
    expect(body.columns.find((c) => c.name === "email")?.likelyPii).toBe(true);
    expect(body.columns.find((c) => c.name === "display_name")?.likelyPii).toBe(false);
  });

  it("rejects reading a nonexistent table", async () => {
    await expect(
      harness.client.readResource({ uri: "postgres://public/does_not_exist/schema" }),
    ).rejects.toThrow();
  });
});
