import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Pool } from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { AppConfig } from "../../src/config.js";
import { createPool } from "../../src/db/client.js";
import { createSchemaCache, fetchSchemaSnapshot } from "../../src/db/schema-cache.js";
import { buildServer } from "../../src/server.js";

export interface Harness {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  config: AppConfig;
  client: Client;
}

export function baseConfig(overrides: Partial<AppConfig> = {}): Omit<AppConfig, "db"> {
  return {
    transport: "stdio",
    httpPort: 3000,
    allowedSchemas: null,
    deniedTables: [],
    enableWrites: false,
    enableExplainAnalyze: false,
    statementTimeoutMs: 5_000,
    maxRows: 1_000,
    maxResponseBytes: 1_048_576,
    ...overrides,
  };
}

/** Starts a real Postgres container and wires an in-process MCP client <-> server pair against it. */
export async function startHarness(configOverrides: Partial<AppConfig> = {}): Promise<Harness> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();

  const config: AppConfig = {
    ...baseConfig(configOverrides),
    db: {
      connectionString: container.getConnectionUri(),
      port: 5432,
      sslMode: "disable",
    },
  };

  const pool = createPool(config.db);
  const schemaCache = createSchemaCache(() => fetchSchemaSnapshot(pool, config));
  const server = buildServer({ pool, config, schemaCache });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "integration-test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { container, pool, config, client };
}

/** No-ops if `h` is undefined, e.g. when beforeAll itself failed to produce a harness. */
export async function stopHarness(h: Harness | undefined): Promise<void> {
  if (!h) return;
  await h.client.close().catch(() => {});
  await h.pool.end().catch(() => {});
  await h.container.stop();
}

export const FIXTURE_SQL = `
  CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE public.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id),
    total_cents INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX orders_user_id_idx ON public.orders(user_id);

  INSERT INTO public.users (email, display_name) VALUES
    ('alice@example.com', 'Alice'),
    ('bob@example.com', 'Bob');

  INSERT INTO public.orders (user_id, total_cents) VALUES
    (1, 1999),
    (1, 500),
    (2, 750);
`;

/** Parses a tool's JSON text result back into an object, for assertions. */
export function toolJson<T = unknown>(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): T {
  const text = result.content.find((c) => c.type === "text")?.text;
  if (text === undefined) {
    throw new Error("Tool result had no text content");
  }
  return JSON.parse(text) as T;
}
