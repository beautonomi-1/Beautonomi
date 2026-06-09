import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetMapboxService = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mapbox/mapbox", () => ({
  getMapboxService: () => mockGetMapboxService(),
}));

describe("POST /api/mapbox/geocode", () => {
  beforeEach(() => {
    mockGetMapboxService.mockReset();
  });

  it("returns MAPBOX_NOT_CONFIGURED when the service token is missing", async () => {
    mockGetMapboxService.mockRejectedValue(
      new Error(
        "MAPBOX_ACCESS_TOKEN not configured. Please set it in the admin portal at /admin/mapbox or environment variables.",
      ),
    );

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Sandton" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error?.code).toBe("MAPBOX_NOT_CONFIGURED");
    expect(json.error?.message).toMatch(/Admin → Mapbox/i);
    expect(json.data).toEqual([]);
  });

  it("returns suggestions when Mapbox is configured", async () => {
    mockGetMapboxService.mockResolvedValue({
      geocode: vi.fn().mockResolvedValue([
        {
          id: "place.1",
          place_name: "Sandton, Gauteng, South Africa",
          center: [28.0567, -26.1076],
          text: "Sandton",
        },
      ]),
    });

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/mapbox/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Sandton" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.error).toBeNull();
    expect(json.data).toHaveLength(1);
  });
});
