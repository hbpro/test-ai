# postgres-mcp-server

An MCP (Model Context Protocol) server that gives an LLM agent safe, read-first
access to a PostgreSQL database: schema introspection, guarded read queries,
and an opt-in gated write path.

See [docs/PLAN.md](docs/PLAN.md) for the full design.

## Status

Under active implementation. Not yet published.

## Development

```bash
npm install
npm run dev        # run the server over stdio with tsx
npm run build       # compile to dist/
npm test           # unit tests
npm run test:integration  # integration tests (requires Docker for testcontainers)
```

Copy `.env.example` to `.env` and set `DATABASE_URL` (a read-only role is
strongly recommended) before running the server.

## Tools implemented so far

- `list_schemas` — allowed, non-system schemas
- `list_tables` — tables/views, optionally scoped to a schema
- `describe_table` — columns, types, nullability, defaults, primary key, likely-PII flags
- `list_indexes` — index definitions for a schema or table
- `list_foreign_keys` — FK relationships for a schema or table
- `run_read_query` — parameterized SELECT/WITH in a read-only transaction; row- and
  byte-capped, rejects multi-statement or non-read input
- `explain_query` — query plan (`EXPLAIN (FORMAT JSON)`); `analyze=true` actually runs
  the query and is off unless `PG_MCP_ENABLE_EXPLAIN_ANALYZE=true`
- `sample_table` — preview up to N rows of a table, with likely-PII columns redacted
- `run_write_query` — parameterized INSERT/UPDATE/DELETE; **only registered when
  `PG_MCP_ENABLE_WRITES=true`** (invisible in `tools/list` otherwise), requires
  `confirm: true`, and every call is audit-logged to stderr
- `refresh_schema` — invalidates the cached schema/table snapshot used by the
  `postgres://` resources; rate-limited to one refresh per 5s

All of the above enforce the schema allowlist / table denylist (`PG_MCP_ALLOWED_SCHEMAS`,
`PG_MCP_DENIED_TABLES`) and run inside a read-only (or, for `run_write_query`, read-write)
transaction with the configured statement timeout. Resources are tracked in `docs/PLAN.md`.

## Safety model

- Read-only by default; the DB role the server connects as should itself be
  `SELECT`-only.
- Writes are only possible via the opt-in `run_write_query` tool, disabled
  unless `PG_MCP_ENABLE_WRITES=true`.
- Every read query runs in a read-only transaction with a statement timeout
  and a row cap.
- Schema/table access can be restricted with an allowlist/denylist.

See `docs/PLAN.md` for the full tool list and design rationale.
