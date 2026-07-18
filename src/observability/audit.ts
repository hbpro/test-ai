export interface AuditEvent {
  tool: string;
  durationMs: number;
  ok: boolean;
  rowCount?: number;
  error?: string;
  sql?: string;
}

/**
 * Writes a structured audit line to stderr (stdout is reserved for the
 * stdio JSON-RPC transport). No params are logged, only the SQL shape.
 */
export function logAudit(event: AuditEvent): void {
  console.error(JSON.stringify({ type: "audit", timestamp: new Date().toISOString(), ...event }));
}
