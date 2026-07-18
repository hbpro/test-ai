import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const baseEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
} as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("loads sane defaults from a minimal env", () => {
    const config = loadConfig(baseEnv, []);
    expect(config.transport).toBe("stdio");
    expect(config.enableWrites).toBe(false);
    expect(config.maxRows).toBe(1000);
    expect(config.statementTimeoutMs).toBe(5000);
    expect(config.allowedSchemas).toBeNull();
    expect(config.deniedTables).toEqual([]);
  });

  it("throws when no database connection info is provided", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv, [])).toThrow(/DATABASE_URL/);
  });

  it("accepts discrete PG* vars instead of DATABASE_URL", () => {
    const config = loadConfig(
      {
        PGHOST: "localhost",
        PGDATABASE: "db",
        PGUSER: "user",
      } as NodeJS.ProcessEnv,
      [],
    );
    expect(config.db.host).toBe("localhost");
  });

  it("parses comma-separated allow/deny lists", () => {
    const config = loadConfig(
      {
        ...baseEnv,
        PG_MCP_ALLOWED_SCHEMAS: "public, sales",
        PG_MCP_DENIED_TABLES: "public.secrets",
      } as NodeJS.ProcessEnv,
      [],
    );
    expect(config.allowedSchemas).toEqual(["public", "sales"]);
    expect(config.deniedTables).toEqual(["public.secrets"]);
  });

  it("lets --transport and --port CLI args override env", () => {
    const config = loadConfig(baseEnv, ["--transport", "http", "--port", "8080"]);
    expect(config.transport).toBe("http");
    expect(config.httpPort).toBe(8080);
  });

  it("rejects an invalid --transport value", () => {
    expect(() => loadConfig(baseEnv, ["--transport", "carrier-pigeon"])).toThrow();
  });
});
