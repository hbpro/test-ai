import { Pool, type PoolClient, type PoolConfig } from "pg";
import type { DbConfig } from "../config.js";

export function buildSsl(sslMode: string): PoolConfig["ssl"] {
  switch (sslMode) {
    case "disable":
      return false;
    case "require":
      // encrypt, but don't verify the server cert
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return { rejectUnauthorized: true };
  }
}

/**
 * Creates the (single) connection pool for the process. The DB role this
 * pool authenticates as should itself be permission-restricted (ideally
 * SELECT-only) — this pool does not enforce read-only access on its own;
 * see withReadOnlyTransaction and the query tools for statement-level guards.
 */
export function createPool(db: DbConfig): Pool {
  const shared = {
    ssl: buildSsl(db.sslMode),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  } satisfies Partial<PoolConfig>;

  const poolConfig: PoolConfig = db.connectionString
    ? { connectionString: db.connectionString, ...shared }
    : {
        host: db.host,
        port: db.port,
        database: db.database,
        user: db.user,
        password: db.password,
        ...shared,
      };

  return new Pool(poolConfig);
}

/**
 * Runs `fn` inside a read-only transaction with a per-statement timeout,
 * always releasing the client back to the pool. Rolls back on any error,
 * including errors thrown by `fn`.
 */
export async function withReadOnlyTransaction<T>(
  pool: Pool,
  statementTimeoutMs: number,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // connection is already broken; nothing more we can do
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a read-write transaction with a per-statement timeout.
 * Only used by the opt-in, gated write tool.
 */
export async function withWriteTransaction<T>(
  pool: Pool,
  statementTimeoutMs: number,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // connection is already broken; nothing more we can do
    });
    throw err;
  } finally {
    client.release();
  }
}
