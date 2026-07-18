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

All of the above enforce the schema allowlist / table denylist (`PG_MCP_ALLOWED_SCHEMAS`,
`PG_MCP_DENIED_TABLES`) and run inside a read-only transaction with the configured
statement timeout. Remaining planned tools (`run_read_query`, `explain_query`,
`sample_table`, gated `run_write_query`, `refresh_schema`) and resources are tracked
in `docs/PLAN.md`.

## Safety model

- Read-only by default; the DB role the server connects as should itself be
  `SELECT`-only.
- Writes are only possible via the opt-in `run_write_query` tool, disabled
  unless `PG_MCP_ENABLE_WRITES=true`.
- Every read query runs in a read-only transaction with a statement timeout
  and a row cap.
- Schema/table access can be restricted with an allowlist/denylist.

See `docs/PLAN.md` for the full tool list and design rationale.
