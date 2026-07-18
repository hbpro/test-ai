import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

/**
 * Aggregates all resource registrations. Each resources/*.ts module exports
 * a `register(server, ctx)` function; add its import + call here as
 * resources land (see docs/PLAN.md).
 */
export function registerResources(_server: McpServer, _ctx: ServerContext): void {
  // populated incrementally as resources are implemented
}
