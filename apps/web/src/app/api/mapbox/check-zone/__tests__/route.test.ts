/**
 * POST /api/mapbox/check-zone
 * - Validates body (point, optional zone_id, provider_id).
 * - Builds zone data from DB columns (zone_type, polygon_coordinates, center_*, radius_km).
 * - Returns in_zone, zones, platform_in_zone, platform_zones.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/mock-supabase";

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => mockGetSupabaseServer(),
}));

const mockIsPointInZone = vi.fn();
vi.mock("@/lib/mapbox/mapbox", () => ({
  getMapboxService: vi.fn().mockResolvedValue({
    isPointInZone: (point: unknown, zoneData: unknown) => mockIsPointInZone(point, zoneData),
  }),
}));

function thenable<T>(value: T): Promise<T> & { then: Promise<T>["then"]; catch: Promise<T>["catch"] } {
  const p = Promise.resolve(value);
  return Object.assign(p, { then: p.then.bind(p), catch: p.catch.bind(p) });
}

describe("POST /api/mapbox/check-zone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPointInZone.mockReturnValue(false);
    const client = createMockSupabaseClient();
    client.rpc.mockResolvedValue({ data: [], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (onFulfilled?: (v: { data: unknown[]; error: null }) => unknown) =>
        thenable({ data: [], error: null }).then(onFulfilled as (v: { data: unknown[]; error: null }) => unknown),
      catch: (onRejected?: (e: unknown) => unknown) => thenable({ data: [], error: null }).catch(onRejected),
    };
    client.from.mockReturnValue(chain);
    mockGetSupabaseServer.mockResolvedValue(client);
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/check-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.data).toBeNull();
  });

  it("returns 200 with in_zone false when no zones", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/check-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        point: { longitude: 18.42, latitude: -33.92 },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.in_zone).toBe(false);
    expect(body.data.zones).toEqual([]);
    expect(body.data.platform_in_zone).toBeDefined();
    expect(Array.isArray(body.data.platform_zones)).toBe(true);
  });

  it("uses zone_type and polygon_coordinates and returns in_zone true when point inside", async () => {
    const client = createMockSupabaseClient();
    client.rpc.mockResolvedValue({ data: [], error: null });
    const polygonZone = {
      id: "zone-uuid-1",
      name: "Cape Town",
      zone_type: "polygon",
      polygon_coordinates: [
        [18.41, -33.93],
        [18.43, -33.93],
        [18.43, -33.91],
        [18.41, -33.91],
        [18.41, -33.93],
      ],
      center_latitude: null,
      center_longitude: null,
      radius_km: null,
      is_active: true,
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (onFulfilled?: (v: { data: unknown[]; error: null }) => unknown) =>
        thenable({ data: [polygonZone], error: null }).then(onFulfilled as (v: { data: unknown[]; error: null }) => unknown),
      catch: (onRejected?: (e: unknown) => unknown) => thenable({ data: [polygonZone], error: null }).catch(onRejected),
    };
    client.from.mockReturnValue(chain);
    mockGetSupabaseServer.mockResolvedValue(client);
    mockIsPointInZone.mockReturnValue(true);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/check-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        point: { longitude: 18.42, latitude: -33.92 },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.in_zone).toBe(true);
    expect(body.data.zones).toHaveLength(1);
    expect(body.data.zones[0]).toMatchObject({ id: "zone-uuid-1", name: "Cape Town", type: "polygon" });
    expect(mockIsPointInZone).toHaveBeenCalledWith(
      { longitude: 18.42, latitude: -33.92 },
      expect.objectContaining({
        type: "polygon",
        coordinates: expect.any(Array),
      })
    );
  });

  it("uses zone_type radius and center_* when zone is radius", async () => {
    const client = createMockSupabaseClient();
    client.rpc.mockResolvedValue({ data: [], error: null });
    const radiusZone = {
      id: "zone-uuid-2",
      name: "10km radius",
      zone_type: "radius",
      polygon_coordinates: null,
      center_latitude: -33.92,
      center_longitude: 18.42,
      radius_km: 10,
      is_active: true,
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (onFulfilled?: (v: { data: unknown[]; error: null }) => unknown) =>
        thenable({ data: [radiusZone], error: null }).then(onFulfilled as (v: { data: unknown[]; error: null }) => unknown),
      catch: (onRejected?: (e: unknown) => unknown) => thenable({ data: [radiusZone], error: null }).catch(onRejected),
    };
    client.from.mockReturnValue(chain);
    mockGetSupabaseServer.mockResolvedValue(client);
    mockIsPointInZone.mockReturnValue(true);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/check-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        point: { longitude: 18.42, latitude: -33.92 },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.in_zone).toBe(true);
    expect(mockIsPointInZone).toHaveBeenCalledWith(
      { longitude: 18.42, latitude: -33.92 },
      expect.objectContaining({
        type: "radius",
        coordinates: { longitude: 18.42, latitude: -33.92 },
        radius_km: 10,
      })
    );
  });

  it("includes platform_zones when RPC returns data", async () => {
    const client = createMockSupabaseClient();
    client.rpc.mockResolvedValue({
      data: [{ zone_id: "pz-1", zone_name: "Cape Metro" }],
      error: null,
    });
    // Route only uses PostGIS results when active platform_zones exist (count query).
    const platformZonesCountChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (onFulfilled?: (v: { count: number; data: null; error: null }) => unknown) =>
        thenable({ count: 1, data: null, error: null }).then(
          onFulfilled as (v: { count: number; data: null; error: null }) => unknown
        ),
      catch: (onRejected?: (e: unknown) => unknown) =>
        thenable({ count: 1, data: null, error: null }).catch(onRejected),
    };
    client.from.mockImplementation((table: string) => {
      if (table === "platform_zones") return platformZonesCountChain;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (onFulfilled?: (v: { data: unknown[]; error: null }) => unknown) =>
          thenable({ data: [], error: null }).then(onFulfilled as (v: { data: unknown[]; error: null }) => unknown),
        catch: (onRejected?: (e: unknown) => unknown) => thenable({ data: [], error: null }).catch(onRejected),
      };
    });
    mockGetSupabaseServer.mockResolvedValue(client);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/check-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        point: { longitude: 18.42, latitude: -33.92 },
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.platform_in_zone).toBe(true);
    expect(body.data.platform_zones).toEqual([{ zone_id: "pz-1", zone_name: "Cape Metro" }]);
  });
});
