import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertSchemaAllowed, isTableAllowed } from "../db/access-control.js";
import { errorResult, jsonResult } from "./util.js";

const inputShape = {
  schema: z.string().min(1).optional(),
  table: z.string().min(1).optional().describe("Requires schema when provided."),
};

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_indexes",
    {
      title: "List indexes",
      description: "Index definitions for a schema or a single table, for join/query-plan reasoning.",
      inputSchema: inputShape,
    },
    async ({ schema, table }) => {
      try {
        if (table && !schema) {
          return errorResult('"table" requires "schema" to be set');
        }
        if (schema) {
          assertSchemaAllowed(schema, ctx.config);
        }

        const rows = await withReadOnlyTransaction(ctx.pool, ctx.config.statementTimeoutMs, async (client) => {
          const { rows } = await client.query<{
            schemaname: string;
            tablename: string;
            indexname: string;
            indexdef: string;
          }>(
            `SELECT schemaname, tablename, indexname, indexdef
             FROM pg_indexes
             WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
               AND ($1::text IS NULL OR schemaname = $1)
               AND ($2::text IS NULL OR tablename = $2)
             ORDER BY schemaname, tablename, indexname`,
            [schema ?? null, table ?? null],
          );
          return rows;
        });

        const indexes = rows
          .filter((r) => isTableAllowed(r.schemaname, r.tablename, ctx.config))
          .map((r) => ({
            schema: r.schemaname,
            table: r.tablename,
            index: r.indexname,
            definition: r.indexdef,
          }));

        return jsonResult({ indexes });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
