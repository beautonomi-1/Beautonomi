/**
 * PII sanitisation tests for Didit decision payloads.
 *
 * sanitiseDecisionForStorage returns {} for null/undefined (not null).
 * It strips known PII keys and preserves non-PII keys.
 */

import { sanitiseDecisionForStorage } from "../provider/didit-provider";

describe("sanitiseDecisionForStorage", () => {
  it("returns empty object for null input", () => {
    expect(sanitiseDecisionForStorage(null)).toEqual({});
  });

  it("returns empty object for undefined input", () => {
    expect(sanitiseDecisionForStorage(undefined as unknown as null)).toEqual({});
  });

  it("preserves non-PII top-level fields", () => {
    const input = {
      status: "Approved",
      reason: "Document verified",
      document_type: "PASSPORT",
    };
    const result = sanitiseDecisionForStorage(input);
    expect(result).toMatchObject({
      status: "Approved",
      reason: "Document verified",
      document_type: "PASSPORT",
    });
  });

  it("strips document_number", () => {
    const input = { status: "Approved", document_number: "AB123456" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("document_number");
    expect(result.status).toBe("Approved");
  });

  it("strips first_name", () => {
    const input = { status: "Approved", first_name: "John" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("first_name");
  });

  it("strips last_name", () => {
    const input = { status: "Approved", last_name: "Doe" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("last_name");
  });

  it("strips date_of_birth", () => {
    const input = { status: "Approved", date_of_birth: "1990-01-15" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("date_of_birth");
  });

  it("strips face_image", () => {
    const input = { status: "Approved", face_image: "base64faceimage" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("face_image");
  });

  it("strips portrait", () => {
    const input = { status: "Approved", portrait: "base64portrait" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("portrait");
  });

  it("strips mrz_line1 and mrz_line2", () => {
    const input = { status: "Approved", mrz_line1: "P<ZADOE<<JOHN", mrz_line2: "AB123456" };
    const result = sanitiseDecisionForStorage(input);
    expect(result).not.toHaveProperty("mrz_line1");
    expect(result).not.toHaveProperty("mrz_line2");
  });

  it("scrubs PII from nested objects", () => {
    const input = {
      status: "Approved",
      verification_details: {
        document_number: "AB123456",
        first_name: "John",
        sub_check: "PASS",
      },
    };
    const result = sanitiseDecisionForStorage(input);
    const details = result.verification_details as Record<string, unknown>;
    expect(details).not.toHaveProperty("document_number");
    expect(details).not.toHaveProperty("first_name");
    expect(details.sub_check).toBe("PASS");
  });

  it("handles arrays with nested PII", () => {
    const input = {
      checks: [
        { name: "liveness", status: "PASS", document_number: "AB123" },
      ],
    };
    const result = sanitiseDecisionForStorage(input);
    const checks = result.checks as Record<string, unknown>[];
    expect(checks[0]).not.toHaveProperty("document_number");
    expect(checks[0].name).toBe("liveness");
    expect(checks[0].status).toBe("PASS");
  });
});
