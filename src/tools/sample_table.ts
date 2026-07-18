import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertTableAllowed } from "../db/access-control.js";
import { quoteIdentifier } from "../db/identifiers.js";
import { isLikelyPii } from "../db/pii.js";
import { capRowsToByteBudget, errorResult, jsonResult } from "./util.js";

const inputShape = {
  schema: z.string().min(1),
  table: z.string().min(1),
  limit: z.number().int().positive().optional(),
};

const REDACTED = "[REDACTED]";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "sample_table",
    {
      title: "Sample table rows",
      description: "Preview up to N rows from a table. Row-capped, and likely-PII columns are redacted.",
      inputSchema: inputShape,
    },
    async ({ schema, table, limit }) => {
      try {
        assertTableAllowed(schema, table, ctx.config);
        const rowLimit = Math.min(limit ?? 50, ctx.config.maxRows);
        const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

        const { columns, rows } = await withReadOnlyTransaction(
          ctx.pool,
          ctx.config.statementTimeoutMs,
          async (client) => {
            const columnsResult = await client.query<{ column_name: string }>(
              `SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
              [schema, table],
            );
            const rowsResult = await client.query(`SELECT * FROM ${qualifiedTable} LIMIT $1`, [rowLimit]);
            return { columns: columnsResult.rows.map((r) => r.column_name), rows: rowsResult.rows };
          },
        );

        if (columns.length === 0) {
          return errorResult(`Table "${schema}.${table}" was not found`);
        }

        const piiColumns = new Set(columns.filter(isLikelyPii));
        const redactedRows = rows.map((row: Record<string, unknown>) => {
          const copy: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            copy[key] = piiColumns.has(key) ? REDACTED : value;
          }
          return copy;
        });

        return jsonResult(
          capRowsToByteBudget(
            {
              schema,
              table,
              rowCount: redactedRows.length,
              redactedColumns: [...piiColumns],
              rows: redactedRows,
            },
            ctx.config.maxResponseBytes,
          ),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
