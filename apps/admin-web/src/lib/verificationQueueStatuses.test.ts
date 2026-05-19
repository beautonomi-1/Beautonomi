import { describe, expect, it } from "vitest";
import { isUserVerificationQueueStatus, USER_VERIFICATION_QUEUE_STATUSES } from "./verificationQueueStatuses";

describe("verificationQueueStatuses", () => {
  it("includes all non-terminal queue statuses", () => {
    expect(USER_VERIFICATION_QUEUE_STATUSES).toEqual([
      "pending",
      "in_progress",
      "under_review",
      "submitted",
    ]);
  });

  it("detects queue vs terminal statuses", () => {
    expect(isUserVerificationQueueStatus("pending")).toBe(true);
    expect(isUserVerificationQueueStatus("in_progress")).toBe(true);
    expect(isUserVerificationQueueStatus("approved")).toBe(false);
    expect(isUserVerificationQueueStatus("rejected")).toBe(false);
  });
});
