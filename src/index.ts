#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/client.js";
import { createSchemaCache, fetchSchemaSnapshot } from "./db/schema-cache.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.db);
  const schemaCache = createSchemaCache(() => fetchSchemaSnapshot(pool, config));
  const server = buildServer({ pool, config, schemaCache });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`postgres-mcp-server received ${signal}, shutting down`);
    await server.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (config.transport === "stdio") {
    // stdout is reserved for the JSON-RPC protocol stream — never console.log here.
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("postgres-mcp-server listening on stdio");
  } else {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await server.connect(transport);

    const httpServer = createHttpServer((req, res) => {
      transport.handleRequest(req, res).catch((err: unknown) => {
        console.error("Error handling MCP request:", err);
        if (!res.headersSent) {
          res.writeHead(500).end();
        }
      });
    });
    httpServer.listen(config.httpPort, () => {
      console.error(`postgres-mcp-server listening on http://localhost:${config.httpPort}`);
    });
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error starting postgres-mcp-server:", err);
  process.exit(1);
});
