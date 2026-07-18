import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describeError } from "../errors.js";

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(err: unknown): CallToolResult {
  return { content: [{ type: "text", text: describeError(err) }], isError: true };
}

/**
 * Halves `rows` until the JSON-serialized payload fits `maxBytes`, marking
 * `truncatedByByteCap` if it had to. A single oversized row is still
 * returned as-is — this bounds the common case, not every pathological one.
 */
export function capRowsToByteBudget<T extends { rows: unknown[] }>(
  data: T,
  maxBytes: number,
): T & { truncatedByByteCap: boolean } {
  let rows = data.rows;
  let truncatedByByteCap = false;
  while (rows.length > 1 && Buffer.byteLength(JSON.stringify({ ...data, rows }), "utf8") > maxBytes) {
    rows = rows.slice(0, Math.ceil(rows.length / 2));
    truncatedByByteCap = true;
  }
  return { ...data, rows, truncatedByByteCap };
}
