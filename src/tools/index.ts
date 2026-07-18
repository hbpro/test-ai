import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

/**
 * Aggregates all tool registrations. Each tools/*.ts module exports a
 * `register(server, ctx)` function; add its import + call here as tools
 * land (see docs/PLAN.md for the full planned tool list).
 */
export function registerTools(_server: McpServer, _ctx: ServerContext): void {
  // populated incrementally as tools are implemented
}
