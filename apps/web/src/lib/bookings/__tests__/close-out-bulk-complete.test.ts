import { describe, expect, it } from "vitest";
import {
  isAlreadyStartedForCompletion,
  isAtHomeCloseOutBlocked,
} from "@/lib/bookings/close-out-bulk-complete";
import {
  isBulkCloseOutCompleteStatus,
  isBulkCompleteEligibleStatus,
} from "@/lib/bookings/lifecycle-close-out";

describe("close-out bulk complete helpers", () => {
  it("isBulkCompleteEligibleStatus only allows in_progress and checked_in", () => {
    expect(isBulkCompleteEligibleStatus("in_progress")).toBe(true);
    expect(isBulkCompleteEligibleStatus("checked_in")).toBe(true);
    expect(isBulkCompleteEligibleStatus("confirmed")).toBe(false);
    expect(isBulkCompleteEligibleStatus("waiting")).toBe(false);
  });

  it("isBulkCloseOutCompleteStatus allows confirmed and waiting for API", () => {
    expect(isBulkCloseOutCompleteStatus("confirmed")).toBe(true);
    expect(isBulkCloseOutCompleteStatus("waiting")).toBe(true);
    expect(isBulkCloseOutCompleteStatus("pending")).toBe(false);
  });

  it("isAlreadyStartedForCompletion", () => {
    expect(isAlreadyStartedForCompletion({ status: "in_progress" })).toBe(true);
    expect(isAlreadyStartedForCompletion({ status: "confirmed", current_stage: "service_started" })).toBe(
      true,
    );
    expect(isAlreadyStartedForCompletion({ status: "checked_in" })).toBe(false);
  });

  it("isAtHomeCloseOutBlocked for confirmed at-home without journey", () => {
    expect(
      isAtHomeCloseOutBlocked({ location_type: "at_home", status: "confirmed", current_stage: null }),
    ).toBe(true);
    expect(
      isAtHomeCloseOutBlocked({
        location_type: "at_home",
        status: "confirmed",
        current_stage: "provider_arrived",
      }),
    ).toBe(false);
    expect(
      isAtHomeCloseOutBlocked({ location_type: "at_salon", status: "confirmed", current_stage: null }),
    ).toBe(false);
  });
});