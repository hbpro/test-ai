/**
 * pg connection failures often surface as AggregateError (multiple
 * connection attempts, e.g. IPv4+IPv6), whose top-level `.message` is an
 * empty string — the real reason lives in `.errors[]` and `.code`. Plain
 * `err.message` silently swallows that. Use this everywhere an error is
 * turned into user- or log-facing text.
 */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map((e) => describeError(e)).filter(Boolean).join("; ");
    return inner || err.message || "AggregateError";
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const base = err.message || err.constructor.name;
    return code ? `${base} (${code})` : base;
  }
  return String(err);
}

/**
 * Runs `fn`, rethrowing any failure as a plain Error with a readable
 * message. Use around resource read/list callbacks, whose errors are
 * relayed by the SDK using bare `.message` (AggregateError's is empty).
 */
export async function withClearError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new Error(describeError(err));
  }
}
