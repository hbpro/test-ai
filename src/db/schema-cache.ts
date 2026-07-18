import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { isSchemaAllowed, isTableAllowed } from "./access-control.js";

export interface TableSummary {
  schema: string;
  table: string;
  type: string;
}

export interface SchemaSnapshot {
  schemas: string[];
  tables: TableSummary[];
  fetchedAt: number;
}

export interface SchemaCache {
  get(): Promise<SchemaSnapshot>;
  /** Drops the cached snapshot so the next get() refetches. Rate-limited to avoid cache-thrash abuse. */
  invalidate(): { rateLimited: boolean };
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MIN_REFRESH_INTERVAL_MS = 5_000;

export function createSchemaCache(
  fetchSnapshot: () => Promise<SchemaSnapshot>,
  ttlMs = DEFAULT_TTL_MS,
  minRefreshIntervalMs = DEFAULT_MIN_REFRESH_INTERVAL_MS,
): SchemaCache {
  let cached: SchemaSnapshot | null = null;
  let lastManualRefreshAt = 0;

  return {
    async get() {
      if (cached && Date.now() - cached.fetchedAt < ttlMs) {
        return cached;
      }
      cached = await fetchSnapshot();
      return cached;
    },
    invalidate() {
      const now = Date.now();
      if (lastManualRefreshAt > 0 && now - lastManualRefreshAt < minRefreshIntervalMs) {
        return { rateLimited: true };
      }
      lastManualRefreshAt = now;
      cached = null;
      return { rateLimited: false };
    },
  };
}

/** Default fetcher: pulls the allowed schema/table list straight from information_schema. */
export async function fetchSchemaSnapshot(
  pool: Pool,
  config: Pick<AppConfig, "allowedSchemas" | "deniedTables">,
): Promise<SchemaSnapshot> {
  const { rows: schemaRows } = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`,
  );
  const schemas = schemaRows.map((r) => r.schema_name).filter((s) => isSchemaAllowed(s, config));

  const { rows: tableRows } = await pool.query<{
    table_schema: string;
    table_name: string;
    table_type: string;
  }>(
    `SELECT table_schema, table_name, table_type
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY table_schema, table_name`,
  );
  const tables = tableRows
    .filter((r) => isTableAllowed(r.table_schema, r.table_name, config))
    .map((r) => ({ schema: r.table_schema, table: r.table_name, type: r.table_type }));

  return { schemas, tables, fetchedAt: Date.now() };
}
