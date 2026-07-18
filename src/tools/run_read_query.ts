import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertReadOnlyQuery, stripTrailingSemicolon } from "../db/query-guard.js";
import { capRowsToByteBudget, errorResult, jsonResult } from "./util.js";

const paramValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const inputShape = {
  sql: z
    .string()
    .min(1)
    .describe("A single SELECT or WITH statement. Use $1, $2, ... placeholders — never inline values."),
  params: z.array(paramValue).optional().describe("Positional values for $1, $2, ..."),
  limit: z.number().int().positive().optional().describe("Row cap for this call; still bounded by the server's configured max."),
};

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "run_read_query",
    {
      title: "Run read query",
      description:
        "Run a single parameterized SELECT/WITH query in a read-only transaction. " +
        "Bounded by a statement timeout and a row cap; results may be truncated by a response byte cap.",
      inputSchema: inputShape,
    },
    async ({ sql, params, limit }) => {
      try {
        assertReadOnlyQuery(sql);
        const rowLimit = Math.min(limit ?? ctx.config.maxRows, ctx.config.maxRows);
        const cleaned = stripTrailingSemicolon(sql);
        // fetch one extra row so we can tell "exactly N rows" from "truncated at N"
        const queryParams = [...(params ?? []), rowLimit + 1];
        const wrapped = `SELECT * FROM (${cleaned}) AS pg_mcp_subquery LIMIT $${queryParams.length}`;

        const rows = await withReadOnlyTransaction(ctx.pool, ctx.config.statementTimeoutMs, async (client) => {
          const result = await client.query(wrapped, queryParams);
          return result.rows;
        });

        const rowLimitReached = rows.length > rowLimit;
        const cappedRows = rowLimitReached ? rows.slice(0, rowLimit) : rows;
        return jsonResult(
          capRowsToByteBudget(
            { rowCount: cappedRows.length, rowLimitReached, rows: cappedRows },
            ctx.config.maxResponseBytes,
          ),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
