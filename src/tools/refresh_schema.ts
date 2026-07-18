import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { errorResult, jsonResult } from "./util.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "refresh_schema",
    {
      title: "Refresh schema cache",
      description:
        "Invalidate the cached schema/table snapshot backing the postgres:// resources, " +
        "so the next read picks up recent DDL changes. Rate-limited.",
      inputSchema: {},
    },
    async () => {
      const { rateLimited } = ctx.schemaCache.invalidate();
      if (rateLimited) {
        return errorResult("refresh_schema was called too recently; try again in a few seconds.");
      }
      return jsonResult({ invalidated: true });
    },
  );
}
