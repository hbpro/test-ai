import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { withClearError } from "../errors.js";

/** Fixed-URI resource: the cached snapshot of allowed schemas + tables. */
export function register(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "postgres-schemas",
    "postgres://schemas",
    {
      title: "Postgres schemas and tables",
      description:
        "Cached snapshot of allowed schemas and their tables (TTL ~60s). " +
        "Call the refresh_schema tool to force a refresh after DDL changes.",
      mimeType: "application/json",
    },
    (uri) =>
      withClearError(async () => {
        const snapshot = await ctx.schemaCache.get();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      }),
  );
}
