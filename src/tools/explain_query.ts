import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertReadOnlyQuery, stripTrailingSemicolon } from "../db/query-guard.js";
import { errorResult, jsonResult } from "./util.js";

const paramValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const inputShape = {
  sql: z.string().min(1).describe("A single SELECT or WITH statement."),
  params: z.array(paramValue).optional(),
  analyze: z
    .boolean()
    .optional()
    .describe("Actually execute the query to get real timings. Requires PG_MCP_ENABLE_EXPLAIN_ANALYZE=true on the server."),
};

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "explain_query",
    {
      title: "Explain query",
      description:
        "Return the Postgres query plan for a SELECT/WITH query. Plan-only by default; " +
        "analyze=true actually runs the query and is gated behind PG_MCP_ENABLE_EXPLAIN_ANALYZE.",
      inputSchema: inputShape,
    },
    async ({ sql, params, analyze }) => {
      try {
        assertReadOnlyQuery(sql);
        if (analyze && !ctx.config.enableExplainAnalyze) {
          return errorResult(
            "analyze=true is disabled on this server. Set PG_MCP_ENABLE_EXPLAIN_ANALYZE=true to allow it.",
          );
        }

        const cleaned = stripTrailingSemicolon(sql);
        const explainPrefix = analyze ? "EXPLAIN (ANALYZE, FORMAT JSON)" : "EXPLAIN (FORMAT JSON)";

        const plan = await withReadOnlyTransaction(ctx.pool, ctx.config.statementTimeoutMs, async (client) => {
          const result = await client.query<{ "QUERY PLAN": unknown }>(
            `${explainPrefix} ${cleaned}`,
            params ?? [],
          );
          return result.rows[0]?.["QUERY PLAN"];
        });

        return jsonResult({ analyzed: Boolean(analyze), plan });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
