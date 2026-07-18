import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().optional(),
  PGSSLMODE: z.string().default("verify-full"),

  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3000),

  PG_MCP_ALLOWED_SCHEMAS: z.string().optional(),
  PG_MCP_DENIED_TABLES: z.string().optional(),
  PG_MCP_ENABLE_WRITES: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PG_MCP_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PG_MCP_MAX_ROWS: z.coerce.number().int().positive().default(1000),
  PG_MCP_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  PG_MCP_ENABLE_EXPLAIN_ANALYZE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export interface DbConfig {
  connectionString?: string;
  host?: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode: string;
}

export interface AppConfig {
  transport: "stdio" | "http";
  httpPort: number;
  db: DbConfig;
  allowedSchemas: string[] | null;
  deniedTables: string[];
  enableWrites: boolean;
  enableExplainAnalyze: boolean;
  statementTimeoutMs: number;
  maxRows: number;
  maxResponseBytes: number;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseArgs(argv: string[]): Partial<Record<string, string>> {
  const args: Partial<Record<string, string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

/**
 * Loads and validates configuration from environment variables and CLI args.
 * CLI args (--transport, --port) take precedence over env vars.
 * Throws a descriptive error and never returns a partially-valid config.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }
  const e = parsed.data;

  if (!e.DATABASE_URL && !(e.PGHOST && e.PGDATABASE && e.PGUSER)) {
    throw new Error(
      "Invalid configuration: set DATABASE_URL, or PGHOST + PGDATABASE + PGUSER",
    );
  }

  const args = parseArgs(argv);
  const transport = (args.transport as "stdio" | "http" | undefined) ?? e.MCP_TRANSPORT;
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`Invalid configuration: --transport must be "stdio" or "http"`);
  }
  const httpPort = args.port ? Number(args.port) : e.MCP_HTTP_PORT;
  if (!Number.isInteger(httpPort) || httpPort <= 0) {
    throw new Error("Invalid configuration: --port must be a positive integer");
  }

  return {
    transport,
    httpPort,
    db: {
      connectionString: e.DATABASE_URL,
      host: e.PGHOST,
      port: e.PGPORT,
      database: e.PGDATABASE,
      user: e.PGUSER,
      password: e.PGPASSWORD,
      sslMode: e.PGSSLMODE,
    },
    allowedSchemas: e.PG_MCP_ALLOWED_SCHEMAS ? parseCsv(e.PG_MCP_ALLOWED_SCHEMAS) : null,
    deniedTables: parseCsv(e.PG_MCP_DENIED_TABLES),
    enableWrites: e.PG_MCP_ENABLE_WRITES,
    enableExplainAnalyze: e.PG_MCP_ENABLE_EXPLAIN_ANALYZE,
    statementTimeoutMs: e.PG_MCP_STATEMENT_TIMEOUT_MS,
    maxRows: e.PG_MCP_MAX_ROWS,
    maxResponseBytes: e.PG_MCP_MAX_RESPONSE_BYTES,
  };
}
