import type { ApiResponse } from "@beautonomi/types";

jest.mock("@/lib/api-client", () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import { api } from "@/lib/api-client";
import { reverseGeocode, searchAddress } from "@/hooks/useAddresses";

const apiPostMock = api.post as jest.MockedFunction<typeof api.post>;

function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

function err(message: string, code?: string): ApiResponse<never> {
  return { data: null, error: { message, code } };
}

describe("searchAddress", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it("returns normalized suggestions on success", async () => {
    apiPostMock.mockResolvedValueOnce(
      ok([
        {
          place_name: "123 Main St, Johannesburg, South Africa",
          center: [28.0473, -26.2041],
          text: "Main St",
        },
      ]),
    );

    const result = await searchAddress("Main St", { country: "ZA" });

    expect(result.error).toBeNull();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.place_name).toContain("Johannesburg");
    expect(apiPostMock).toHaveBeenCalledWith("/api/mapbox/geocode", {
      query: "Main St",
      limit: 10,
      country: "ZA",
    });
  });

  it("surfaces API errors instead of returning an empty list silently", async () => {
    apiPostMock.mockResolvedValueOnce(
      err("Geocoding service unavailable", "GEOCODE_UNAVAILABLE"),
    );

    const result = await searchAddress("Sandton");

    expect(result.results).toEqual([]);
    expect(result.error).toContain("Geocoding service unavailable");
  });

  it("surfaces network errors from the API client", async () => {
    apiPostMock.mockResolvedValueOnce(
      err("Could not reach the server. Check your internet connection and that the app is configured with the correct API URL.", "NETWORK_ERROR"),
    );

    const result = await searchAddress("Rosebank");

    expect(result.results).toEqual([]);
    expect(result.error).toMatch(/Could not reach the server/i);
  });

  it("includes bundle-derived country when country option is omitted", async () => {
    apiPostMock.mockResolvedValueOnce(ok([]));

    await searchAddress("Cape Town", {
      bundleMeta: {
        active_market_country: "ZA",
      },
    });

    expect(apiPostMock).toHaveBeenCalledWith("/api/mapbox/geocode", {
      query: "Cape Town",
      limit: 10,
      country: "ZA",
    });
  });

  it("returns empty results for very short queries without calling the API", async () => {
    const result = await searchAddress("a");

    expect(result).toEqual({ results: [], error: null });
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it("returns a normalized feature on success", async () => {
    apiPostMock.mockResolvedValueOnce(
      ok({
        place_name: "45 Long St, Cape Town, South Africa",
        center: [18.4241, -33.9249],
        text: "Long St",
      }),
    );

    const result = await reverseGeocode(-33.9249, 18.4241);

    expect(result.error).toBeNull();
    expect(result.feature?.place_name).toContain("Cape Town");
    expect(apiPostMock).toHaveBeenCalledWith("/api/mapbox/reverse-geocode", {
      latitude: -33.9249,
      longitude: 18.4241,
    });
  });

  it("surfaces API errors instead of returning null silently", async () => {
    apiPostMock.mockResolvedValueOnce(err("Geocoding service unavailable", "GEOCODE_UNAVAILABLE"));

    const result = await reverseGeocode(-26.2, 28.0);

    expect(result.feature).toBeNull();
    expect(result.error).toContain("Geocoding service unavailable");
  });
});
