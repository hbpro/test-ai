import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { register as registerListSchemas } from "./list_schemas.js";
import { register as registerListTables } from "./list_tables.js";
import { register as registerDescribeTable } from "./describe_table.js";
import { register as registerListIndexes } from "./list_indexes.js";
import { register as registerListForeignKeys } from "./list_foreign_keys.js";
import { register as registerRunReadQuery } from "./run_read_query.js";
import { register as registerExplainQuery } from "./explain_query.js";
import { register as registerSampleTable } from "./sample_table.js";

/**
 * Aggregates all tool registrations. Each tools/*.ts module exports a
 * `register(server, ctx)` function; add its import + call here as tools
 * land (see docs/PLAN.md for the full planned tool list).
 */
export function registerTools(server: McpServer, ctx: ServerContext): void {
  registerListSchemas(server, ctx);
  registerListTables(server, ctx);
  registerDescribeTable(server, ctx);
  registerListIndexes(server, ctx);
  registerListForeignKeys(server, ctx);
  registerRunReadQuery(server, ctx);
  registerExplainQuery(server, ctx);
  registerSampleTable(server, ctx);
}
