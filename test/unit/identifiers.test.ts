import { describe, expect, it } from "vitest";
import { assertValidIdentifier, quoteIdentifier } from "../../src/db/identifiers.js";

describe("assertValidIdentifier", () => {
  it("accepts simple identifiers", () => {
    expect(() => assertValidIdentifier("users")).not.toThrow();
    expect(() => assertValidIdentifier("_private")).not.toThrow();
    expect(() => assertValidIdentifier("user_2")).not.toThrow();
  });

  it("rejects identifiers containing quote/injection characters", () => {
    for (const name of ['users"; DROP TABLE x; --', "users; select 1", "users ", "users-2", ""]) {
      expect(() => assertValidIdentifier(name)).toThrow(/Invalid identifier/);
    }
  });
});

describe("quoteIdentifier", () => {
  it("wraps a valid identifier in double quotes", () => {
    expect(quoteIdentifier("users")).toBe('"users"');
  });

  it("throws instead of quoting an unsafe identifier", () => {
    expect(() => quoteIdentifier('users"; DROP TABLE x; --')).toThrow();
  });
});
