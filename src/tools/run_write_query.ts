import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withWriteTransaction } from "../db/client.js";
import { assertWriteQuery, stripTrailingSemicolon } from "../db/query-guard.js";
import { logAudit } from "../observability/audit.js";
import { errorResult, jsonResult } from "./util.js";

const paramValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const inputShape = {
  sql: z
    .string()
    .min(1)
    .describe("A single INSERT, UPDATE, or DELETE statement. Use $1, $2, ... placeholders — never inline values."),
  params: z.array(paramValue).optional(),
  confirm: z.literal(true).describe("Must be true — this tool modifies data."),
};

/**
 * Only registered when PG_MCP_ENABLE_WRITES=true, so it's invisible in
 * tools/list (not just erroring at call time) when writes are disabled.
 */
export function register(server: McpServer, ctx: ServerContext): void {
  if (!ctx.config.enableWrites) {
    return;
  }

  server.registerTool(
    "run_write_query",
    {
      title: "Run write query",
      description:
        "Run a single parameterized INSERT/UPDATE/DELETE statement. Requires " +
        "confirm: true. Every call is audit-logged (SQL shape + timing, not param values).",
      inputSchema: inputShape,
      annotations: { destructiveHint: true },
    },
    async ({ sql, params }) => {
      const start = Date.now();
      const cleaned = stripTrailingSemicolon(sql);
      try {
        assertWriteQuery(cleaned);

        const rowCount = await withWriteTransaction(ctx.pool, ctx.config.statementTimeoutMs, async (client) => {
          const result = await client.query(cleaned, params ?? []);
          return result.rowCount ?? 0;
        });

        logAudit({ tool: "run_write_query", durationMs: Date.now() - start, ok: true, rowCount, sql: cleaned });
        return jsonResult({ rowCount });
      } catch (err) {
        logAudit({
          tool: "run_write_query",
          durationMs: Date.now() - start,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          sql: cleaned,
        });
        return errorResult(err);
      }
    },
  );
}
