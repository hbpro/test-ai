import { describe, expect, it } from "vitest";
import { buildSsl } from "../../src/db/client.js";

describe("buildSsl", () => {
  it("disables SSL for sslmode=disable", () => {
    expect(buildSsl("disable")).toBe(false);
  });

  it("does not verify the server cert for sslmode=require", () => {
    expect(buildSsl("require")).toEqual({ rejectUnauthorized: false });
  });

  it("verifies the server cert for sslmode=verify-ca and verify-full", () => {
    expect(buildSsl("verify-ca")).toEqual({ rejectUnauthorized: true });
    expect(buildSsl("verify-full")).toEqual({ rejectUnauthorized: true });
  });

  it("defaults to verifying the server cert for unknown modes", () => {
    expect(buildSsl("something-unexpected")).toEqual({ rejectUnauthorized: true });
  });
});
