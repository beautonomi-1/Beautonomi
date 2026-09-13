import { describe, expect, it } from "vitest";
import { recurringSeedVisitUpdate } from "../insert-customer-recurring-from-paid-booking";

describe("recurringSeedVisitUpdate", () => {
  it("confirms a still-pending checkout visit when attaching the series", () => {
    expect(recurringSeedVisitUpdate("series-1", "pending")).toEqual({
      recurring_series_id: "series-1",
      status: "confirmed",
    });
  });

  it("does not change a visit that is already confirmed, cancelled, or in progress", () => {
    expect(recurringSeedVisitUpdate("series-1", "confirmed")).toEqual({
      recurring_series_id: "series-1",
    });
    expect(recurringSeedVisitUpdate("series-1", "cancelled")).toEqual({
      recurring_series_id: "series-1",
    });
    expect(recurringSeedVisitUpdate("series-1", "in_progress")).toEqual({
      recurring_series_id: "series-1",
    });
  });
});
