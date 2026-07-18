import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSchemaCache } from "../../src/db/schema-cache.js";

function snapshot(n: number) {
  return { schemas: [`s${n}`], tables: [], fetchedAt: Date.now() };
}

describe("createSchemaCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches once and serves the cached value within the TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue(snapshot(1));
    const cache = createSchemaCache(fetcher, 60_000, 5_000);

    await cache.get();
    await cache.get();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    let call = 0;
    const fetcher = vi.fn().mockImplementation(async () => snapshot(++call));
    const cache = createSchemaCache(fetcher, 1_000, 0);

    const first = await cache.get();
    vi.advanceTimersByTime(1_001);
    const second = await cache.get();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  it("invalidate() drops the cache so the next get() refetches", async () => {
    let call = 0;
    const fetcher = vi.fn().mockImplementation(async () => snapshot(++call));
    const cache = createSchemaCache(fetcher, 60_000, 0);

    await cache.get();
    const { rateLimited } = cache.invalidate();
    await cache.get();

    expect(rateLimited).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rate-limits invalidate() calls that are too close together", async () => {
    const fetcher = vi.fn().mockResolvedValue(snapshot(1));
    const cache = createSchemaCache(fetcher, 60_000, 5_000);

    await cache.get();
    const first = cache.invalidate();
    const second = cache.invalidate();

    expect(first.rateLimited).toBe(false);
    expect(second.rateLimited).toBe(true);
  });
});
