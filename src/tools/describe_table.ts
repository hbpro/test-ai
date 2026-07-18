import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertTableAllowed } from "../db/access-control.js";
import { isLikelyPii } from "../db/pii.js";
import { errorResult, jsonResult } from "./util.js";

const inputShape = {
  schema: z.string().min(1),
  table: z.string().min(1),
};

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  ordinal_position: number;
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "describe_table",
    {
      title: "Describe table",
      description:
        "Columns, types, nullability, defaults, and likely-PII flags for a table. " +
        "Blocked for tables outside the allowlist or on the denylist.",
      inputSchema: inputShape,
    },
    async ({ schema, table }) => {
      try {
        assertTableAllowed(schema, table, ctx.config);

        const result = await withReadOnlyTransaction(ctx.pool, ctx.config.statementTimeoutMs, async (client) => {
          const columnsQuery = client.query<ColumnRow>(
            `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [schema, table],
          );
          const primaryKeyQuery = client.query<{ column_name: string }>(
            `SELECT kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
             ORDER BY kcu.ordinal_position`,
            [schema, table],
          );

          const [columnsResult, primaryKeyResult] = await Promise.all([columnsQuery, primaryKeyQuery]);
          return { columnsResult, primaryKeyResult };
        });

        if (result.columnsResult.rows.length === 0) {
          return errorResult(`Table "${schema}.${table}" was not found`);
        }

        const primaryKey = new Set(result.primaryKeyResult.rows.map((r) => r.column_name));
        const columns = result.columnsResult.rows.map((row) => ({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
          default: row.column_default,
          primaryKey: primaryKey.has(row.column_name),
          likelyPii: isLikelyPii(row.column_name),
        }));

        return jsonResult({ schema, table, columns });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
