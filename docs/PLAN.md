# PostgreSQL MCP Server — Plan

Planned by a two-person team: **Data Engineer** (data/DB layer) and **Software Engineer** (architecture/tooling).

> **Status:** implemented in full on `feature/postgres-mcp-server-plan` — every tool, resource, and safety
> control below has shipped with unit + integration test coverage. This doc is kept as the original design
> record; see [README.md](../README.md) and [CLAUDE.md](../CLAUDE.md) for the current, maintained picture.

## Architecture

- **Stack**: TypeScript + `@modelcontextprotocol/sdk` on Node ≥20 — best-maintained SDK, matches the official reference Postgres server, easy `npx` distribution.
- **Transport**: stdio first (local Claude Desktop/Code), Streamable HTTP/SSE later for remote/hosted use, behind a `--transport` flag.
- **DB access**: `pg` connection pool, restricted read-only DB role by default, SSL required (`verify-full` in prod).

## MCP surface (tools/resources)

| Tool                                       | Purpose                   | Key safety guard                                       |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------ |
| `list_schemas` / `list_tables`             | Discovery                 | Schema/table allowlist                                 |
| `describe_table`                           | Columns, types, PII flags | Redact/flag sensitive columns                          |
| `list_indexes` / `list_foreign_keys`       | Join/perf reasoning       | Read-only                                              |
| `sample_table`                             | Preview rows              | Row cap + PII redaction                                |
| `run_read_query`                           | Parameterized SELECT      | Read-only txn, timeout, row/byte cap, single-statement |
| `explain_query`                            | EXPLAIN(/ANALYZE gated)   | ANALYZE off unless explicitly enabled                  |
| `run_write_query` (opt-in, off by default) | DML                       | Separate write role, explicit confirmation, audited    |
| `refresh_schema`                           | Invalidate metadata cache | Rate-limited                                           |

Schema/table metadata is also exposed as browsable **resources** (not just tools), so the model can read context without a tool call.

## Cross-cutting concerns

- **Safety**: parameterized queries only, `statement_timeout`, row/byte caps, allow/deny lists (deny wins), PII redaction — enforced at both DB role and app layer.
- **Types**: timestamps as ISO-8601, bigint/numeric as strings, jsonb inlined, enums as strings with domain listed — so the model reasons correctly.
- **Config**: `DATABASE_URL` (or discrete `PGHOST/...`), zod-validated at startup, `.env.example`, never commit secrets.
- **Testing**: unit (query builders, validation) + integration via testcontainers Postgres.
- **Observability**: structured audit log per tool call (tool, redacted SQL, rows, duration, caller, allow/deny decision).
- **Distribution**: npm package with `bin` → `npx`, Docker image for hosted use, `claude mcp add postgres -- npx -y <pkg>`.

## Proposed project structure

```
src/
├── index.ts        # entry, transport selection
├── server.ts        # tool/resource registration
├── config.ts        # env/arg parsing (zod)
├── db/client.ts      # pool, read-only role
├── tools/           # one file per tool
├── resources/        # schema/table resources
test/{unit,integration}/
Dockerfile · package.json · .env.example
```

---

## Data Engineer's plan (full detail)

### Design principles

- **Read-only by default.** Read-write is a separately-gated mode (config flag + per-connection role). Enforce via a dedicated DB role with `SELECT`-only grants and a session set to `default_transaction_read_only = on` — never rely solely on SQL parsing.
- **Least privilege at the DB, not the app.** The MCP process connects as a restricted role so a prompt-injection bug can't exceed granted permissions.

### Query safety

- **Injection prevention:** always parameterized queries ($1,$2); never string-concatenate agent input. For ad-hoc read queries, run inside a read-only transaction and reject multi-statement input.
- **Guardrails per query:** `statement_timeout` (e.g. 5s default, configurable), hard `LIMIT` injection / max row cap (e.g. 1000), max result bytes cap, block DDL/DML keywords in read mode.
- **Allow/deny lists:** schema + table allowlist (default: exclude `pg_catalog`, `information_schema`, and named sensitive tables). Deny list wins.
- **PII redaction:** column-level redaction config (mask/hash/omit) applied to results and to samples; flag likely-PII columns (email, ssn, phone) in schema output.

### Connections & secrets

- Single pooled client (pg `Pool`), sizing ~ (num_cpu*2)+effective_spindles, min idle small; `connectionTimeoutMillis` + `idleTimeoutMillis` set.
- Multi-database/schema via named connection profiles; `search_path` pinned per profile.
- Credentials from env/secret manager only, never args; **require SSL** (`sslmode=verify-full` in prod) with CA cert.

### Performance

- **Pagination:** keyset/cursor pagination preferred over OFFSET for large sets; expose cursor tokens.
- **Streaming:** stream large reads (pg-cursor) rather than buffering; still bounded by row/byte caps.
- **Schema caching:** cache introspection metadata with TTL + invalidate on `explain`/DDL; cheap `refresh_schema` tool.
- **Long queries:** timeouts + optional async job handle for known-slow analytics.

### Type mapping for the LLM

- Return typed JSON: timestamps as ISO-8601 UTC; numeric/`bigint` as strings to avoid precision loss; `json/jsonb` inlined as objects; arrays as JSON arrays; enums as strings + enum domain listed in schema; `bytea`/geometry summarized, not dumped. Include column type names alongside values so the model reasons correctly.

### Observability & versioning

- Structured audit log per tool call: tool, SQL (params redacted), row count, duration, caller, allow/deny decision. Metrics: calls by tool, latency, timeouts, denials, rows returned.
- Track schema snapshots (hash of introspection) to detect drift; surface a `schema_changed` signal and version the cached metadata.

### Proposed MCP tools

- `list_schemas` — enumerate allowed schemas. _Safety: respect allow/deny list._
- `list_tables` — tables/views in a schema. _Safety: filtered, exclude system schemas._
- `describe_table` — columns, types, nullability, defaults, PII flags. _Safety: redact/flag sensitive cols._
- `list_indexes` / `list_foreign_keys` — index & FK metadata for join/perf reasoning. _Safety: read-only introspection._
- `sample_table` — top-N rows. _Safety: row cap + PII redaction + allowlist._
- `run_read_query` — parameterized SELECT in read-only txn. _Safety: timeout, row/byte cap, single-statement, no DDL/DML._
- `explain_query` — EXPLAIN/EXPLAIN ANALYZE (analyze gated). _Safety: ANALYZE off in read-only unless explicitly enabled._
- `run_write_query` _(gated, off by default)_ — parameterized DML. _Safety: separate mode, write role, explicit confirmation, audited._
- `refresh_schema` — invalidate/rebuild cached metadata. _Safety: rate-limited._

---

## Software Engineer's plan (full detail)

### Language / Runtime & SDK

- **Recommendation: TypeScript with `@modelcontextprotocol/sdk` (Node ≥20).**
  - Best-maintained SDK; the official reference `postgres` server is TS, so we inherit proven patterns.
  - First-class stdio + Streamable HTTP transports; easy `npx` distribution (zero-install UX for end users).
  - Python `mcp` SDK is a fine alternative if the team is Python-native or wants `psycopg`/SQLAlchemy tooling — but TS wins on distribution and reference parity.

### Transport

- **stdio** — default for local Claude Desktop/Code; server runs as a child process, credentials stay on the user's machine. Ship this first.
- **Streamable HTTP/SSE** — for remote/hosted/multi-user deployments (behind auth). Make transport a runtime flag (`--transport stdio|http`) sharing one core server instance.

### MCP Primitives Mapping

- **Tools** (primary): `query` (read-only SQL), optional `execute` (writes, opt-in/gated), `list_schemas`, `describe_table` — agent-invoked actions.
- **Resources**: expose schema/table metadata as browsable read-only context (e.g. `postgres://<host>/<db>/<table>/schema`) — model reads without a tool call.
- **Prompts**: a few canned prompts ("analyze table", "explain slow query") for discoverable UX. Low priority.

### Project Structure

```
test-ai/
├── src/
│   ├── index.ts            # entry: parse args, select transport, boot
│   ├── server.ts           # McpServer wiring (register tools/resources)
│   ├── config.ts           # env/arg parsing + zod validation
│   ├── db/                 # (data-layer teammate owns internals)
│   │   └── client.ts       # pool handle
│   ├── tools/              # one file per tool + its input schema
│   ├── resources/          # schema/table resource handlers
│   └── prompts/
├── test/
│   ├── unit/               # query builders, input validation
│   └── integration/        # testcontainers Postgres
├── Dockerfile
├── package.json            # bin field → npx executable
├── tsconfig.json
├── .env.example
└── README.md
```

### Config / Credentials

- Precedence: CLI args > env vars > config file. Primary input `DATABASE_URL` (or discrete `PGHOST/PGUSER/...`).
- **Never** commit secrets; ship `.env.example`. Multiple environments via named connection profiles or separate server registrations (one per DB).
- Validate all config at startup with **zod**; fail fast with a clear message.

### Error Handling & Validation

- Define each tool's input as a **zod schema**; SDK auto-generates JSON Schema + validates before the handler runs.
- Return structured MCP tool errors (`isError: true` + message); never leak raw stack traces/DSNs. Map DB errors → safe, actionable messages.

### Testing

- **Unit**: query construction, config parsing, input validation (Vitest/Jest).
- **Integration**: spin real Postgres via **testcontainers**; assert tool round-trips, error paths, schema introspection.
- Lint/format: ESLint + Prettier.

### Distribution & Install

- Publish as **scoped npm package** with a `bin` entry → users run via `npx`.
- Provide a **Docker image** for HTTP/hosted use.
- Install docs: `claude mcp add postgres -- npx -y <pkg> --db "$DATABASE_URL"`, plus a `claude_desktop_config.json` snippet.

### CI / Versioning / Release

- GitHub Actions: lint → typecheck → unit → integration (Docker) on PRs.
- **SemVer**; automate changelog/publish (changesets) on tagged release; publish npm + Docker together.
- Pin SDK version; document minimum Node.
