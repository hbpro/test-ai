import { describe, expect, it } from "vitest";
import { assertReadOnlyQuery, assertSingleStatement, stripTrailingSemicolon } from "../../src/db/query-guard.js";

describe("stripTrailingSemicolon", () => {
  it("removes a single trailing semicolon and surrounding whitespace", () => {
    expect(stripTrailingSemicolon("SELECT 1;")).toBe("SELECT 1");
    expect(stripTrailingSemicolon("  SELECT 1  ")).toBe("SELECT 1");
  });
});

describe("assertSingleStatement", () => {
  it("rejects empty input", () => {
    expect(() => assertSingleStatement("   ")).toThrow(/empty/);
  });

  it("allows a single statement with a trailing semicolon", () => {
    expect(() => assertSingleStatement("SELECT 1;")).not.toThrow();
  });

  it("rejects stacked statements", () => {
    expect(() => assertSingleStatement("SELECT 1; DROP TABLE users;")).toThrow(/single SQL statement/);
  });
});

describe("assertReadOnlyQuery", () => {
  it("allows SELECT and WITH", () => {
    expect(() => assertReadOnlyQuery("SELECT * FROM users")).not.toThrow();
    expect(() => assertReadOnlyQuery("with c as (select 1) select * from c")).not.toThrow();
  });

  it("rejects DML/DDL", () => {
    for (const sql of [
      "DELETE FROM users",
      "UPDATE users SET name = 'x'",
      "DROP TABLE users",
      "INSERT INTO users VALUES (1)",
    ]) {
      expect(() => assertReadOnlyQuery(sql)).toThrow(/must start with SELECT or WITH/);
    }
  });

  it("rejects stacked statements even if the first is a SELECT", () => {
    expect(() => assertReadOnlyQuery("SELECT 1; DROP TABLE users;")).toThrow();
  });
});
