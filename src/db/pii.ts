const PII_PATTERNS: RegExp[] = [
  /email/i,
  /\bssn\b/i,
  /social_?security/i,
  /phone/i,
  /\bdob\b/i,
  /birth_?date/i,
  /passport/i,
  /credit_?card/i,
  /\bcvv\b/i,
  /password/i,
  /\btoken\b/i,
  /secret/i,
  /\baddress\b/i,
  /ip_?address/i,
  /national_?id/i,
];

/**
 * Heuristic, name-based PII flag for schema output — not a substitute for a
 * real data classification pass, just a nudge so the model (and the human
 * reading tool output) treats these columns carefully.
 */
export function isLikelyPii(columnName: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(columnName));
}
