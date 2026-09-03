import { beforeEach, describe, expect, it, vi } from "vitest";

const calculateRoute = vi.fn();
vi.mock("@/lib/mapbox/mapbox", () => ({
  getMapboxService: vi.fn(async () => ({ calculateRoute })),
}));

import {
  __resetDirectionsCacheForTests,
  DIRECTIONS_CACHE_TTL_SECONDS,
  directionsCacheKey,
  getCachedDirections,
} from "@/lib/availability/directions-cache";
import { calculateTravelTime } from "@/lib/availability/travel-buffers";

describe("Mapbox Directions cache", () => {
  beforeEach(() => {
    __resetDirectionsCacheForTests();
    calculateRoute.mockReset();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("keys by coords rounded to 4 dp + profile", () => {
    const a = directionsCacheKey({ fromLat: -26.20410001, fromLng: 28.04730002, toLat: -26.1, toLng: 28.0, profile: "driving" });
    const b = directionsCacheKey({ fromLat: -26.20409999, fromLng: 28.04729998, toLat: -26.1, toLng: 28.0, profile: "driving" });
    const c = directionsCacheKey({ fromLat: -26.2041, fromLng: 28.0473, toLat: -26.1, toLng: 28.0, profile: "walking" });
    const d = directionsCacheKey({ fromLat: -26.2051, fromLng: 28.0473, toLat: -26.1, toLng: 28.0, profile: "driving" });
    expect(a).toBe(b);
    expect(a).toBe("directions:v1:driving:-26.2041,28.0473:-26.1000,28.0000");
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("cache hit: second lookup for the same rounded pair does not call the loader", async () => {
    const loader = vi.fn().mockResolvedValue({ distance: 12_345, duration: 900 });
    const params = { fromLat: -26.2041, fromLng: 28.0473, toLat: -26.1076, toLng: 28.0567, profile: "driving" };
    const first = await getCachedDirections(params, loader);
    const second = await getCachedDirections({ ...params, fromLat: -26.20412 }, loader); // rounds to same key
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ distance: 12_345, duration: 900, cached: false });
    expect(second).toEqual({ distance: 12_345, duration: 900, cached: true });
  });

  it("writes with the 24h TTL and does not cache loader failures", async () => {
    const store = { get: vi.fn(async () => null), set: vi.fn(async () => undefined) };
    const params = { fromLat: 1, fromLng: 2, toLat: 3, toLng: 4, profile: "driving" };
    await getCachedDirections(params, async () => ({ distance: 10, duration: 20 }), { store });
    expect(store.set).toHaveBeenCalledWith(directionsCacheKey(params), { distance: 10, duration: 20 }, DIRECTIONS_CACHE_TTL_SECONDS);
    expect(DIRECTIONS_CACHE_TTL_SECONDS).toBe(86_400);

    store.set.mockClear();
    await expect(
      getCachedDirections(params, async () => {
        throw new Error("mapbox down");
      }, { store }),
    ).rejects.toThrow("mapbox down");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("calculateTravelTime hits Mapbox once for repeated address pairs", async () => {
    calculateRoute.mockResolvedValue({ distance: 10_000, duration: 600 });
    const a = await calculateTravelTime({} as never, -26.2041, 28.0473, -26.1076, 28.0567);
    const b = await calculateTravelTime({} as never, -26.20411, 28.04731, -26.10761, 28.05671);
    expect(calculateRoute).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ distanceKm: 10, estimatedMinutes: 10, bufferMinutes: 25 });
    expect(b).toEqual(a);
  });

  it("calculateTravelTime falls back to Haversine when Mapbox fails (and caches nothing)", async () => {
    calculateRoute.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await calculateTravelTime({} as never, -26.2041, 28.0473, -26.1076, 28.0567);
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.bufferMinutes).toBe(result.estimatedMinutes + 15);
    await calculateTravelTime({} as never, -26.2041, 28.0473, -26.1076, 28.0567);
    expect(calculateRoute).toHaveBeenCalledTimes(2); // failure was not cached
    warn.mockRestore();
  });
});
