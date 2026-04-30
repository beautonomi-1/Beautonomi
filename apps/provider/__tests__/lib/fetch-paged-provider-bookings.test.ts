import { api } from "@/lib/api-client";
import {
  fetchAllProviderBookingsPages,
  PROVIDER_BOOKINGS_PAGE_SIZE,
} from "@/lib/fetch-paged-provider-bookings";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn() },
}));

describe("fetchAllProviderBookingsPages", () => {
  beforeEach(() => {
    jest.mocked(api.get).mockReset();
  });

  it("merges multiple pages until a short page is returned", async () => {
    const fullPage = Array.from({ length: PROVIDER_BOOKINGS_PAGE_SIZE }, (_, i) => ({
      id: `r${i}`,
    }));
    const tail = [{ id: "last" }];
    jest.mocked(api.get)
      .mockResolvedValueOnce({ error: null, data: fullPage } as never)
      .mockResolvedValueOnce({ error: null, data: tail } as never);

    const out = await fetchAllProviderBookingsPages("/api/provider/bookings?start_date=a&end_date=b");
    expect(out).toHaveLength(PROVIDER_BOOKINGS_PAGE_SIZE + 1);
    expect(jest.mocked(api.get)).toHaveBeenCalledTimes(2);
  });

  it("throws when the first page returns an API error", async () => {
    jest.mocked(api.get).mockResolvedValue({
      error: { message: "server error" },
      data: null,
    } as never);
    await expect(fetchAllProviderBookingsPages("/api/x")).rejects.toThrow();
  });

});
