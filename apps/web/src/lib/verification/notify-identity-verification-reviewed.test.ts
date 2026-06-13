import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendTemplateNotification = vi.fn();

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
}));

import {
  extractSumsubRejectionReason,
  notifyIdentityVerificationReviewed,
  shouldNotifyIdentityVerificationTransition,
} from "./notify-identity-verification-reviewed";

describe("notifyIdentityVerificationReviewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTemplateNotification.mockResolvedValue({ success: true });
  });

  it("sends the approved template to a customer with the customer URL", async () => {
    await notifyIdentityVerificationReviewed({
      userId: "user-1",
      outcome: "approved",
      isProvider: false,
      tenantId: "tenant-1",
    });

    expect(mockSendTemplateNotification).toHaveBeenCalledWith(
      "identity_verification_approved",
      ["user-1"],
      { verification_url: "/account-settings/identity-verification" },
      ["push", "email"],
      { appType: "customer", tenantId: "tenant-1" },
    );
  });

  it("sends the rejected template to a provider with a plain reason (no trailing period)", async () => {
    await notifyIdentityVerificationReviewed({
      userId: "user-2",
      outcome: "rejected",
      rejectionReason: "Document is blurry.",
      isProvider: true,
    });

    expect(mockSendTemplateNotification).toHaveBeenCalledWith(
      "identity_verification_rejected",
      ["user-2"],
      {
        verification_url: "/provider/settings/verification",
        rejection_reason: "Document is blurry",
      },
      ["push", "email"],
      { appType: "provider", tenantId: undefined },
    );
  });

  it("falls back to a generic reason when none is provided", async () => {
    await notifyIdentityVerificationReviewed({
      userId: "user-3",
      outcome: "rejected",
      rejectionReason: null,
      isProvider: false,
    });

    const variables = mockSendTemplateNotification.mock.calls[0]?.[2] as Record<string, string>;
    expect(variables.rejection_reason).toBe(
      "We could not verify your document. Please upload a clear photo of a valid ID",
    );
  });

  it("never throws when the send fails", async () => {
    mockSendTemplateNotification.mockRejectedValueOnce(new Error("OneSignal down"));

    await expect(
      notifyIdentityVerificationReviewed({
        userId: "user-4",
        outcome: "approved",
        isProvider: false,
      }),
    ).resolves.toBeUndefined();
  });

  it("does nothing without a user id", async () => {
    await notifyIdentityVerificationReviewed({
      userId: "",
      outcome: "approved",
      isProvider: false,
    });

    expect(mockSendTemplateNotification).not.toHaveBeenCalled();
  });
});

describe("shouldNotifyIdentityVerificationTransition", () => {
  it("notifies when status transitions into approved", () => {
    expect(shouldNotifyIdentityVerificationTransition("pending", "approved")).toBe(true);
    expect(shouldNotifyIdentityVerificationTransition("in_progress", "approved")).toBe(true);
  });

  it("notifies when status transitions into rejected", () => {
    expect(shouldNotifyIdentityVerificationTransition("pending", "rejected")).toBe(true);
    expect(shouldNotifyIdentityVerificationTransition("in_progress", "rejected")).toBe(true);
  });

  it("skips duplicate webhook deliveries", () => {
    expect(shouldNotifyIdentityVerificationTransition("approved", "approved")).toBe(false);
    expect(shouldNotifyIdentityVerificationTransition("rejected", "rejected")).toBe(false);
  });

  it("ignores non-terminal statuses", () => {
    expect(shouldNotifyIdentityVerificationTransition("pending", "in_progress")).toBe(false);
    expect(shouldNotifyIdentityVerificationTransition(null, "submitted")).toBe(false);
  });
});

describe("extractSumsubRejectionReason", () => {
  it("joins Sumsub rejection fields when present", () => {
    const reason = extractSumsubRejectionReason({
      reviewResult: {
        clientComment: "Document is blurry",
        moderationComment: "Please resubmit",
        rejectLabels: ["UNSATISFACTORY_PHOTOS"],
      },
    });

    expect(reason).toBe(
      "Document is blurry. Please resubmit. UNSATISFACTORY_PHOTOS",
    );
  });

  it("returns null when no rejection details are present", () => {
    expect(extractSumsubRejectionReason({})).toBeNull();
    expect(extractSumsubRejectionReason({ reviewResult: {} })).toBeNull();
  });
});
