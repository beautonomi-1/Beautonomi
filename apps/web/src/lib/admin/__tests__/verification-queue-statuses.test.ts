import { describe, expect, it } from "vitest";
import { USER_VERIFICATION_QUEUE_STATUSES } from "../verification-queue-statuses";

describe("USER_VERIFICATION_QUEUE_STATUSES", () => {
  it("matches nav-counts pending verification filter", () => {
    expect(USER_VERIFICATION_QUEUE_STATUSES).toContain("pending");
    expect(USER_VERIFICATION_QUEUE_STATUSES).toContain("in_progress");
    expect(USER_VERIFICATION_QUEUE_STATUSES).toContain("submitted");
    expect(USER_VERIFICATION_QUEUE_STATUSES).not.toContain("approved");
    expect(USER_VERIFICATION_QUEUE_STATUSES).not.toContain("rejected");
  });
});
