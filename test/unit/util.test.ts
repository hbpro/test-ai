import { describe, expect, it } from "vitest";
import { capRowsToByteBudget } from "../../src/tools/util.js";

describe("capRowsToByteBudget", () => {
  it("leaves small payloads untouched", () => {
    const data = { rows: [{ a: 1 }, { a: 2 }] };
    const result = capRowsToByteBudget(data, 1_000_000);
    expect(result.rows).toHaveLength(2);
    expect(result.truncatedByByteCap).toBe(false);
  });

  it("halves rows until under budget", () => {
    const bigValue = "x".repeat(1000);
    const rows = Array.from({ length: 64 }, (_, i) => ({ i, bigValue }));
    const data = { rows };
    const result = capRowsToByteBudget(data, 5_000);
    expect(result.rows.length).toBeLessThan(64);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.truncatedByByteCap).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(
      5_000 + JSON.stringify({ ...data, rows: [] }).length,
    );
  });

  it("still returns at least one row even if it alone exceeds budget", () => {
    const rows = [{ big: "x".repeat(10_000) }];
    const result = capRowsToByteBudget({ rows }, 100);
    expect(result.rows).toHaveLength(1);
  });
});
