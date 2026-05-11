import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetMapboxAccessToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/secrets", () => ({
  getMapboxAccessToken: () => mockGetMapboxAccessToken(),
}));

describe("GET /api/mapbox/static-image", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetMapboxAccessToken.mockResolvedValue("test-secret-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when lat is not finite", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/mapbox/static-image?lat=foo&lng=18"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when latitude is out of range", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/mapbox/static-image?lat=91&lng=0"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when Mapbox token is not configured", async () => {
    mockGetMapboxAccessToken.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/mapbox/static-image?lat=-33.9&lng=18.4"));
    expect(res.status).toBe(503);
  });

  it("returns 502 when upstream Mapbox returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/mapbox/static-image?lat=-33.9&lng=18.4&w=100&h=50"));
    expect(res.status).toBe(502);
  });

  it("streams image bytes when upstream succeeds", async () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => buf,
      }),
    );
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/mapbox/static-image?lat=-33.9&lng=18.4&w=100&h=50"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const out = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("api.mapbox.com");
    expect(calledUrl).toContain("access_token=test-secret-token");
    // Marker must be requested (lon,lat order inside pin per Mapbox Static Images API)
    expect(calledUrl).toContain("pin-l+FF0077(18.4,-33.9)");
    expect(calledUrl).toContain("/auto/100x50");
  });

  it("requests two markers when sec_lat and sec_lng are set", async () => {
    const buf = new Uint8Array([9]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => buf,
      }),
    );
    const { GET } = await import("../route");
    const u = new URL("http://localhost/api/mapbox/static-image");
    u.searchParams.set("lat", "-33");
    u.searchParams.set("lng", "18");
    u.searchParams.set("sec_lat", "-34");
    u.searchParams.set("sec_lng", "19");
    u.searchParams.set("w", "200");
    u.searchParams.set("h", "100");
    const res = await GET(new Request(u.toString()));
    expect(res.status).toBe(200);
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("pin-l+FF0077(18,-33)");
    expect(calledUrl).toContain("pin-l+2563EB(19,-34)");
    expect(calledUrl).toContain("/auto/200x100");
  });
});
