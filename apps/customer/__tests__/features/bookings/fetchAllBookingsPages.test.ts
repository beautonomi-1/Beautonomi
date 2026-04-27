import { fetchAllBookingsPages } from "@/features/bookings/fetchAllBookingsPages";
import { api } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockGet = api.get as jest.MockedFunction<typeof api.get>;

describe("fetchAllBookingsPages", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("walks paginated bookings until has_more is false", async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { items: [{ id: "booking-1" }], has_more: true },
        error: null,
      } as any)
      .mockResolvedValueOnce({
        data: { items: [{ id: "booking-2" }], has_more: false },
        error: null,
      } as any);

    const res = await fetchAllBookingsPages({
      status: "past",
      sortBy: "scheduled_at",
      sortDir: "desc",
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.map((booking) => booking.id)).toEqual(["booking-1", "booking-2"]);
    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      "/api/me/bookings?status=past&sort_by=scheduled_at&sort_dir=desc&limit=100&page=1",
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      "/api/me/bookings?status=past&sort_by=scheduled_at&sort_dir=desc&limit=100&page=2",
    );
  });

  it("returns the first API error without requesting later pages", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { message: "No session" },
    } as any);

    const res = await fetchAllBookingsPages({
      status: "upcoming",
      sortBy: "created_at",
      sortDir: "asc",
    });

    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("No session");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
