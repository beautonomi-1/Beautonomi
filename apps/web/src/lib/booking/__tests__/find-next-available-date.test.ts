import { describe, expect, it, vi } from "vitest";
import { findNextAvailableDate } from "../find-next-available-date";

describe("findNextAvailableDate", () => {
  it("returns the first day with a future slot within the search window", async () => {
    const fetchAvailability = vi
      .fn()
      .mockResolvedValueOnce({ slots: [] })
      .mockResolvedValueOnce({
        slots: [{ start: "2026-10-10T10:00:00.000Z", is_available: true }],
      });

    const result = await findNextAvailableDate({
      providerSlug: "salon-a",
      providerTimezone: "Africa/Johannesburg",
      serviceId: "svc-1",
      staffId: "any",
      durationMinutes: 60,
      bufferMinutes: 0,
      maxAdvanceDays: 14,
      fetchAvailability,
    });

    expect(result).not.toBeNull();
    expect(fetchAvailability).toHaveBeenCalledTimes(2);
  });

  it("respects startDayOffset", async () => {
    const fetchAvailability = vi.fn().mockResolvedValue({ slots: [] });
    await findNextAvailableDate({
      providerSlug: "salon-a",
      providerTimezone: null,
      serviceId: "svc-1",
      staffId: "any",
      durationMinutes: 30,
      bufferMinutes: 0,
      maxAdvanceDays: 14,
      startDayOffset: 3,
      fetchAvailability,
    });
    expect(fetchAvailability.mock.calls[0][0]).toMatch(/date=/);
  });
});
