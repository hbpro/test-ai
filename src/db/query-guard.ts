const READ_ONLY_LEADING_KEYWORDS = new Set(["select", "with"]);
const WRITE_LEADING_KEYWORDS = new Set(["insert", "update", "delete"]);

export function stripTrailingSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
}

/** Defense in depth: the DB session is also set read-only, but reject obvious multi-statement input here too. */
export function assertSingleStatement(sql: string): void {
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    throw new Error("Query must not be empty");
  }
  if (stripTrailingSemicolon(trimmed).includes(";")) {
    throw new Error("Only a single SQL statement is allowed");
  }
}

/**
 * Defense in depth: rejects anything that isn't shaped like a read query
 * before it ever reaches Postgres. The read-only transaction is the real
 * enforcement boundary — this just fails fast with a clearer error.
 */
export function assertReadOnlyQuery(sql: string): void {
  assertSingleStatement(sql);
  const firstWord = sql.trim().match(/^[a-zA-Z]+/)?.[0]?.toLowerCase();
  if (!firstWord || !READ_ONLY_LEADING_KEYWORDS.has(firstWord)) {
    throw new Error(
      `Query must start with SELECT or WITH (got "${firstWord ?? sql.slice(0, 20)}"). ` +
        "Use run_write_query (if enabled) for data-modifying statements.",
    );
  }
}

/** Same defense-in-depth reasoning as assertReadOnlyQuery, for the DML surface. DDL is never allowed. */
export function assertWriteQuery(sql: string): void {
  assertSingleStatement(sql);
  const firstWord = sql.trim().match(/^[a-zA-Z]+/)?.[0]?.toLowerCase();
  if (!firstWord || !WRITE_LEADING_KEYWORDS.has(firstWord)) {
    throw new Error(
      `Query must start with INSERT, UPDATE, or DELETE (got "${firstWord ?? sql.slice(0, 20)}"). DDL is not supported.`,
    );
  }
}
