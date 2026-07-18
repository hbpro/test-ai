const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Schema/table names can't be parameterized like values can, so anywhere
 * they're interpolated into SQL as identifiers, validate them against a
 * strict allowlist pattern first.
 */
export function assertValidIdentifier(name: string): void {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`Invalid identifier: "${name}"`);
  }
}

export function quoteIdentifier(name: string): string {
  assertValidIdentifier(name);
  return `"${name}"`;
}
