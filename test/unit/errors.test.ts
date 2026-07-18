import { describe, expect, it } from "vitest";
import { describeError, withClearError } from "../../src/errors.js";

describe("describeError", () => {
  it("returns a plain Error's message", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("appends the error code when present", () => {
    const err = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    expect(describeError(err)).toBe("connection refused (ECONNREFUSED)");
  });

  it("unpacks AggregateError into its inner messages instead of an empty string", () => {
    const inner1 = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" });
    const inner2 = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    const agg = new AggregateError([inner1, inner2], "");
    expect(describeError(agg)).toBe(
      "connect ECONNREFUSED ::1:5432 (ECONNREFUSED); connect ECONNREFUSED 127.0.0.1:5432 (ECONNREFUSED)",
    );
  });

  it("stringifies non-Error values", () => {
    expect(describeError("plain string")).toBe("plain string");
  });
});

describe("withClearError", () => {
  it("passes through the resolved value on success", async () => {
    await expect(withClearError(async () => 42)).resolves.toBe(42);
  });

  it("rethrows a plain Error with the same readable message", async () => {
    const agg = new AggregateError([Object.assign(new Error("refused"), { code: "ECONNREFUSED" })], "");
    await expect(
      withClearError(async () => {
        throw agg;
      }),
    ).rejects.toThrow("refused (ECONNREFUSED)");
  });
});
