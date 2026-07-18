import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { assertTableAllowed } from "../db/access-control.js";
import { isLikelyPii } from "../db/pii.js";
import { withClearError } from "../errors.js";

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
}

/** Templated resource: postgres://<schema>/<table>/schema — one per table in the cached snapshot. */
export function register(server: McpServer, ctx: ServerContext): void {
  const template = new ResourceTemplate("postgres://{schema}/{table}/schema", {
    list: () =>
      withClearError(async () => {
        const snapshot = await ctx.schemaCache.get();
        return {
          resources: snapshot.tables.map((t) => ({
            uri: `postgres://${t.schema}/${t.table}/schema`,
            name: `${t.schema}.${t.table}`,
            mimeType: "application/json",
          })),
        };
      }),
  });

  server.registerResource(
    "postgres-table-schema",
    template,
    {
      title: "Table schema",
      description: "Columns, types, nullability, defaults, and likely-PII flags for a single table.",
      mimeType: "application/json",
    },
    (uri, variables) =>
      withClearError(async () => {
        const schema = String(variables.schema);
        const table = String(variables.table);
        assertTableAllowed(schema, table, ctx.config);

        const columns = await withReadOnlyTransaction(
          ctx.pool,
          ctx.config.statementTimeoutMs,
          async (client) => {
            const { rows } = await client.query<ColumnRow>(
              `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
              [schema, table],
            );
            return rows;
          },
        );

        if (columns.length === 0) {
          throw new Error(`Table "${schema}.${table}" was not found`);
        }

        const body = {
          schema,
          table,
          columns: columns.map((c) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === "YES",
            default: c.column_default,
            likelyPii: isLikelyPii(c.column_name),
          })),
        };

        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }],
        };
      }),
  );
}
