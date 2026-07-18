import { describe, expect, it } from "vitest";
import { isLikelyPii } from "../../src/db/pii.js";

describe("isLikelyPii", () => {
  it("flags common PII-shaped column names", () => {
    for (const name of ["email", "user_email", "ssn", "phone_number", "birth_date", "credit_card_number", "password_hash"]) {
      expect(isLikelyPii(name)).toBe(true);
    }
  });

  it("does not flag ordinary column names", () => {
    for (const name of ["id", "created_at", "status", "total_amount", "sku"]) {
      expect(isLikelyPii(name)).toBe(false);
    }
  });
});
