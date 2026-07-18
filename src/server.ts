import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

export function buildServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    { name: "postgres-mcp-server", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  registerTools(server, ctx);
  registerResources(server, ctx);

  return server;
}
