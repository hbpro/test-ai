import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withReadOnlyTransaction } from "../db/client.js";
import { isSchemaAllowed } from "../db/access-control.js";
import { errorResult, jsonResult } from "./util.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_schemas",
    {
      title: "List schemas",
      description:
        "List Postgres schemas visible to this connection. System schemas " +
        "(pg_catalog, information_schema, pg_toast*, pg_temp*) and anything " +
        "outside the configured allowlist are always excluded.",
      inputSchema: {},
    },
    async () => {
      try {
        const schemas = await withReadOnlyTransaction(
          ctx.pool,
          ctx.config.statementTimeoutMs,
          async (client) => {
            const { rows } = await client.query<{ schema_name: string }>(
              `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`,
            );
            return rows.map((r) => r.schema_name).filter((name) => isSchemaAllowed(name, ctx.config));
          },
        );
        return jsonResult({ schemas });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
