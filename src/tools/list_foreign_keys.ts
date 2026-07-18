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

interface ForeignKeyRow {
  schema_name: string;
  table_name: string;
  constraint_name: string;
  column_name: string;
  foreign_schema_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_foreign_keys",
    {
      title: "List foreign keys",
      description: "Foreign key relationships for a schema or a single table, for join reasoning.",
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

        const rows = await withReadOnlyTransaction(
          ctx.pool,
          ctx.config.statementTimeoutMs,
          async (client) => {
            const { rows } = await client.query<ForeignKeyRow>(
              `SELECT
               tc.table_schema AS schema_name,
               tc.table_name AS table_name,
               tc.constraint_name AS constraint_name,
               kcu.column_name AS column_name,
               ccu.table_schema AS foreign_schema_name,
               ccu.table_name AS foreign_table_name,
               ccu.column_name AS foreign_column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND ($1::text IS NULL OR tc.table_schema = $1)
               AND ($2::text IS NULL OR tc.table_name = $2)
             ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`,
              [schema ?? null, table ?? null],
            );
            return rows;
          },
        );

        const foreignKeys = rows
          .filter((r) => isTableAllowed(r.schema_name, r.table_name, ctx.config))
          .map((r) => ({
            schema: r.schema_name,
            table: r.table_name,
            column: r.column_name,
            constraint: r.constraint_name,
            references: {
              schema: r.foreign_schema_name,
              table: r.foreign_table_name,
              column: r.foreign_column_name,
            },
          }));

        return jsonResult({ foreignKeys });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
