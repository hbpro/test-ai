import type { AppConfig } from "../config.js";

type SchemaAccessConfig = Pick<AppConfig, "allowedSchemas">;
type TableAccessConfig = Pick<AppConfig, "allowedSchemas" | "deniedTables">;

function isSystemSchema(schema: string): boolean {
  return schema === "pg_catalog" || schema === "information_schema" || schema.startsWith("pg_toast") || schema.startsWith("pg_temp");
}

/** System schemas are always excluded, even if explicitly allowlisted. */
export function isSchemaAllowed(schema: string, config: SchemaAccessConfig): boolean {
  if (isSystemSchema(schema)) return false;
  if (config.allowedSchemas === null) return true;
  return config.allowedSchemas.includes(schema);
}

/** Deny list wins: a denylisted table is blocked even if its schema is allowed. */
export function isTableAllowed(schema: string, table: string, config: TableAccessConfig): boolean {
  if (!isSchemaAllowed(schema, config)) return false;
  return !config.deniedTables.includes(`${schema}.${table}`);
}

export function assertSchemaAllowed(schema: string, config: SchemaAccessConfig): void {
  if (!isSchemaAllowed(schema, config)) {
    throw new Error(`Schema "${schema}" is not accessible (system schema or not in allowlist)`);
  }
}

export function assertTableAllowed(schema: string, table: string, config: TableAccessConfig): void {
  if (!isTableAllowed(schema, table, config)) {
    throw new Error(`Table "${schema}.${table}" is not accessible (denylisted or schema not allowed)`);
  }
}
