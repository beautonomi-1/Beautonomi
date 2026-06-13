import { describe, expect, it } from "vitest";
import {
  buildManualVerificationUpsertRow,
  getManualVerificationSubmitBlock,
  isUniqueVerificationConflict,
  mapVerificationUploadError,
} from "./manual-verification-submit";

describe("getManualVerificationSubmitBlock", () => {
  it("blocks when identity is already verified", () => {
    const block = getManualVerificationSubmitBlock({
      identityVerified: true,
      userStatus: "approved",
      verificationRecords: [],
    });

    expect(block).toEqual({
      status: 409,
      reason: "Your identity is already verified.",
    });
  });

  it("blocks when a record is pending review", () => {
    const block = getManualVerificationSubmitBlock({
      identityVerified: false,
      userStatus: "none",
      verificationRecords: [{ status: "pending", document_type: "license" }],
    });

    expect(block).toEqual({
      status: 409,
      reason: "You already have an identity verification submission under review.",
    });
  });

  it("blocks when the user-level status is in-flight and records exist", () => {
    const block = getManualVerificationSubmitBlock({
      identityVerified: false,
      userStatus: "under_review",
      verificationRecords: [{ status: "rejected", document_type: "sumsub" }],
    });

    expect(block).not.toBeNull();
  });

  it("allows resubmission after rejection", () => {
    const block = getManualVerificationSubmitBlock({
      identityVerified: false,
      userStatus: "rejected",
      verificationRecords: [{ status: "rejected", document_type: "license" }],
    });

    expect(block).toBeNull();
  });

  it("allows first-time submission (stale pending user status with no records)", () => {
    const block = getManualVerificationSubmitBlock({
      identityVerified: false,
      userStatus: "pending",
      verificationRecords: [],
    });

    expect(block).toBeNull();
  });
});

describe("mapVerificationUploadError", () => {
  it("maps unique constraint violations to a friendly 409", () => {
    const mapped = mapVerificationUploadError({ code: "23505" });
    expect(mapped).toEqual({
      status: 409,
      message:
        "You already have a submission of this document type under review. Please wait for the current review to complete.",
    });
  });

  it("returns null for unrelated errors", () => {
    expect(mapVerificationUploadError({ code: "42501" })).toBeNull();
  });
});

describe("isUniqueVerificationConflict", () => {
  it("detects postgres duplicate key errors", () => {
    expect(isUniqueVerificationConflict({ code: "23505" })).toBe(true);
    expect(
      isUniqueVerificationConflict({
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe(true);
    expect(isUniqueVerificationConflict({ code: "22P02" })).toBe(false);
  });
});

describe("buildManualVerificationUpsertRow", () => {
  it("resets rejected rows to a fresh pending submission", () => {
    const row = buildManualVerificationUpsertRow({
      userId: "user-1",
      documentType: "license",
      country: "ZA",
      documentUrl: "https://example.com/doc.jpg",
      tenantId: "tenant-1",
      submittedAt: "2026-06-12T10:00:00.000Z",
    });

    expect(row).toEqual({
      user_id: "user-1",
      document_type: "license",
      country: "ZA",
      document_url: "https://example.com/doc.jpg",
      status: "pending",
      rejection_reason: null,
      reviewed_at: null,
      reviewed_by: null,
      submitted_at: "2026-06-12T10:00:00.000Z",
      tenant_id: "tenant-1",
    });
  });
});
