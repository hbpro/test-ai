# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo.

## What this is

`postgres-mcp-server` — an MCP server exposing a PostgreSQL database to LLM
agents. Design doc: `docs/PLAN.md`. TypeScript, `@modelcontextprotocol/sdk`,
Node >=20, ESM (`"type": "module"`).

## Layout

```
src/
├── index.ts               # entry: parse args/env, select transport, boot
├── server.ts               # McpServer instance, tool/resource registration
├── config.ts               # env/arg parsing + zod validation
├── context.ts               # ServerContext type (pool, config, schemaCache)
├── errors.ts                # describeError/withClearError — use for every caught error
├── db/
│   ├── client.ts             # pg pool, SSL, read-only/write transaction helpers
│   ├── access-control.ts       # schema allowlist + table denylist
│   ├── query-guard.ts          # single-statement + read/write SQL shape checks
│   ├── identifiers.ts          # safe identifier quoting for interpolated SQL
│   ├── pii.ts                 # name-based PII heuristic
│   └── schema-cache.ts          # TTL'd cache backing the postgres:// resources
├── observability/audit.ts       # structured stderr audit log (run_write_query)
├── tools/                   # one file per MCP tool, registered in tools/index.ts
└── resources/                # postgres:// resource handlers

test/
├── unit/                    # no real DB required
└── integration/
    └── harness.ts             # startHarness/stopHarness: real Postgres
                                # container + in-process MCP Client<->Server
                                # over InMemoryTransport
```

Integration tests drive the server the same way a real MCP client would —
`Client` + `InMemoryTransport.createLinkedPair()` from the SDK, not by
calling tool handlers directly — so they also exercise input validation
and the resource/tool registration wiring, not just the business logic.

## Invariants to preserve

- **Read-only by default.** Any new query path must run inside a read-only
  transaction unless it is the explicitly gated write tool.
- **Parameterized queries only.** Never string-concatenate user/agent input
  into SQL.
- **Every read query is bounded**: `statement_timeout`, row cap, single
  statement. Don't add a query tool that skips these guardrails.
- **Allow/deny lists apply before any DB call** that touches table data or
  metadata (deny wins). Use `assertSchemaAllowed`/`assertTableAllowed` from
  `src/db/access-control.ts` — don't reimplement the check inline.
- **Secrets** (`DATABASE_URL`, PG* vars) come from env only — never accept
  them as tool arguments, never log them.
- New tools go in `src/tools/<name>.ts` exporting `register(server, ctx)`,
  and get wired into `src/tools/index.ts`. Same pattern for
  `src/resources/`. Column-level PII flagging uses `src/db/pii.ts`.
- Any tool that builds SQL containing a schema/table name as an _identifier_
  (not a bound value) must go through `quoteIdentifier`/`assertValidIdentifier`
  in `src/db/identifiers.ts` — schema/table names can't be parameterized.
- Free-text SQL tools (`run_read_query`, `explain_query`) must call
  `assertReadOnlyQuery`/`assertSingleStatement` from `src/db/query-guard.ts`
  before executing anything; `run_write_query` uses `assertWriteQuery`.
- `run_write_query` only calls `server.registerTool` when
  `ctx.config.enableWrites` is true — keep this "not registered" gating
  pattern (not "registered but errors") for any future write-capable tool.
- The schema cache (`src/db/schema-cache.ts`) backs the `postgres://`
  resources, not the introspection tools — tools always query live.
  `refresh_schema` invalidates it and is rate-limited via the cache's own
  `invalidate()`, not a separate cooldown.
- **Always format thrown/caught errors through `src/errors.ts`**
  (`describeError` in tools, `withClearError` wrapping resource read/list
  callbacks). Node's pg connection failures are often `AggregateError` with
  an _empty_ top-level `.message` — plain `err.message` silently swallows
  the real reason (found via manual stdio testing against an unreachable
  DB: `resources/list` returned `{"message":""}` before this fix).

## Commands

```bash
npm run dev          # stdio server via tsx, no build step
npm run build         # tsc -> dist/
npm run typecheck     # tsconfig.test.json — covers src AND test (vitest itself doesn't type-check)
npm run lint
npm run format        # prettier --write
npm run format:check   # what CI runs
npm test             # unit
npm run test:integration  # requires Docker
```

CI (`.github/workflows/ci.yml`) runs lint/format-check/typecheck/build/unit on
every push, plus separate jobs for the integration suite and a Docker build —
mirror that locally before pushing rather than relying on CI to catch it.

Docker is not available in every dev sandbox; integration tests are written
against testcontainers and are expected to run in CI even if you can't run
them locally. Don't skip writing them just because you can't execute them
here — verify with `npm run typecheck` and unit tests instead.

## Workflow on this repo

Branching: `main` -> `develop` -> feature branches. This implementation lives
on `feature/postgres-mcp-server-plan`. Commit per logical unit of work; keep
this file and `README.md` current as the implementation evolves.
