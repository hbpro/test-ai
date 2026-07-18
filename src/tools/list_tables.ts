import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertSchemaAllowed, isSchemaAllowed, isTableAllowed } from "../db/access-control.js";
import { errorResult, jsonResult } from "./util.js";

const inputShape = {
  schema: z
    .string()
    .min(1)
    .optional()
    .describe("Restrict to a single schema; omit to list across all allowed schemas."),
};

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_tables",
    {
      title: "List tables",
      description:
        "List tables and views, optionally scoped to one schema. Respects the schema allowlist and table denylist.",
      inputSchema: inputShape,
    },
    async ({ schema }) => {
      try {
        if (schema) {
          assertSchemaAllowed(schema, ctx.config);
        }

        const tables = await withReadOnlyTransaction(
          ctx.pool,
          ctx.config.statementTimeoutMs,
          async (client) => {
            const { rows } = await client.query<{
              table_schema: string;
              table_name: string;
              table_type: string;
            }>(
              `SELECT table_schema, table_name, table_type
             FROM information_schema.tables
             WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
               AND ($1::text IS NULL OR table_schema = $1)
             ORDER BY table_schema, table_name`,
              [schema ?? null],
            );
            return rows
              .filter(
                (r) =>
                  isSchemaAllowed(r.table_schema, ctx.config) &&
                  isTableAllowed(r.table_schema, r.table_name, ctx.config),
              )
              .map((r) => ({ schema: r.table_schema, table: r.table_name, type: r.table_type }));
          },
        );

        return jsonResult({ tables });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
