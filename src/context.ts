import type { Pool } from "pg";
import type { AppConfig } from "./config.js";

/** Shared dependencies handed to every tool/resource registrar. */
export interface ServerContext {
  pool: Pool;
  config: AppConfig;
}
