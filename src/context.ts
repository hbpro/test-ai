import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import type { SchemaCache } from "./db/schema-cache.js";

/** Shared dependencies handed to every tool/resource registrar. */
export interface ServerContext {
  pool: Pool;
  config: AppConfig;
  schemaCache: SchemaCache;
}
