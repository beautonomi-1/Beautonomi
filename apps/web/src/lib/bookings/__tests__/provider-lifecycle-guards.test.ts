import {
  BOOKING_SERVICE_EDIT_LOCKED_STATUSES,
  PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES,
} from "../reschedule-core";

describe("provider booking lifecycle guards", () => {
  it("blocks provider PATCH reschedule once service has started", () => {
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("in_progress")).toBe(true);
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("confirmed")).toBe(false);
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("checked_in")).toBe(false);
  });

  it("blocks provider PATCH reschedule for terminal statuses", () => {
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("completed")).toBe(true);
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("cancelled")).toBe(true);
    expect(PROVIDER_PATCH_NON_RESCHEDULABLE_STATUSES.has("no_show")).toBe(true);
  });

  it("blocks service edits on terminal/closed statuses", () => {
    expect(BOOKING_SERVICE_EDIT_LOCKED_STATUSES.has("completed")).toBe(true);
    expect(BOOKING_SERVICE_EDIT_LOCKED_STATUSES.has("cancelled")).toBe(true);
    expect(BOOKING_SERVICE_EDIT_LOCKED_STATUSES.has("no_show")).toBe(true);
    expect(BOOKING_SERVICE_EDIT_LOCKED_STATUSES.has("in_progress")).toBe(false);
  });
});
