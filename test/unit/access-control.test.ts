import { describe, expect, it } from "vitest";
import { assertSchemaAllowed, assertTableAllowed, isSchemaAllowed, isTableAllowed } from "../../src/db/access-control.js";

describe("isSchemaAllowed", () => {
  it("always excludes system schemas, even when allowlisted", () => {
    expect(isSchemaAllowed("pg_catalog", { allowedSchemas: ["pg_catalog"] })).toBe(false);
    expect(isSchemaAllowed("information_schema", { allowedSchemas: null })).toBe(false);
    expect(isSchemaAllowed("pg_toast_temp_1", { allowedSchemas: null })).toBe(false);
  });

  it("allows any non-system schema when allowlist is null", () => {
    expect(isSchemaAllowed("public", { allowedSchemas: null })).toBe(true);
    expect(isSchemaAllowed("sales", { allowedSchemas: null })).toBe(true);
  });

  it("restricts to the allowlist when set", () => {
    expect(isSchemaAllowed("public", { allowedSchemas: ["public"] })).toBe(true);
    expect(isSchemaAllowed("sales", { allowedSchemas: ["public"] })).toBe(false);
  });
});

describe("isTableAllowed", () => {
  it("denies a table even if its schema is allowed", () => {
    const config = { allowedSchemas: null, deniedTables: ["public.secrets"] };
    expect(isTableAllowed("public", "secrets", config)).toBe(false);
    expect(isTableAllowed("public", "users", config)).toBe(true);
  });

  it("denies everything in a disallowed schema regardless of denylist", () => {
    const config = { allowedSchemas: ["public"], deniedTables: [] };
    expect(isTableAllowed("sales", "orders", config)).toBe(false);
  });
});

describe("assertSchemaAllowed / assertTableAllowed", () => {
  it("throws for disallowed schema/table, is silent otherwise", () => {
    expect(() => assertSchemaAllowed("pg_catalog", { allowedSchemas: null })).toThrow();
    expect(() => assertSchemaAllowed("public", { allowedSchemas: null })).not.toThrow();

    const config = { allowedSchemas: null, deniedTables: ["public.secrets"] };
    expect(() => assertTableAllowed("public", "secrets", config)).toThrow(/not accessible/);
    expect(() => assertTableAllowed("public", "users", config)).not.toThrow();
  });
});
