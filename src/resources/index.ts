import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { register as registerSchemaList } from "./schema_list.js";
import { register as registerTableSchema } from "./table_schema.js";

/**
 * Aggregates all resource registrations. Each resources/*.ts module exports
 * a `register(server, ctx)` function; add its import + call here as
 * resources land (see docs/PLAN.md).
 */
export function registerResources(server: McpServer, ctx: ServerContext): void {
  registerSchemaList(server, ctx);
  registerTableSchema(server, ctx);
}
