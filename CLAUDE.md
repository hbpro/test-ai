# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo.

## What this is

`postgres-mcp-server` — an MCP server exposing a PostgreSQL database to LLM
agents. Design doc: `docs/PLAN.md`. TypeScript, `@modelcontextprotocol/sdk`,
Node >=20, ESM (`"type": "module"`).

## Layout

```
src/
├── index.ts       # entry: parse args/env, select transport, boot
├── server.ts       # McpServer instance, tool/resource registration
├── config.ts       # env/arg parsing + zod validation
├── db/client.ts     # pg pool, SSL, read-only session helper
├── tools/          # one file per MCP tool
├── resources/       # MCP resource handlers (schema/table metadata)
test/unit/          # no real DB required
test/integration/     # spins up real Postgres via testcontainers
```

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

## Commands

```bash
npm run dev          # stdio server via tsx, no build step
npm run build         # tsc -> dist/
npm run typecheck
npm run lint
npm test             # unit
npm run test:integration  # requires Docker
```

Docker is not available in every dev sandbox; integration tests are written
against testcontainers and are expected to run in CI even if you can't run
them locally. Don't skip writing them just because you can't execute them
here — verify with `npm run typecheck` and unit tests instead.

## Workflow on this repo

Branching: `main` -> `develop` -> feature branches. This implementation lives
on `feature/postgres-mcp-server-plan`. Commit per logical unit of work; keep
this file and `README.md` current as the implementation evolves.
