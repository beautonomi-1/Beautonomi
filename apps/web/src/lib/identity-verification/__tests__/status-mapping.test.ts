/**
 * Status mapping tests — normalizeDiditStatus.
 *
 * Uses Didit's actual case-sensitive status strings.
 * Unknown statuses map to "errored" (the service fallback).
 */

import { normalizeDiditStatus } from "../provider/didit-provider";

describe("normalizeDiditStatus", () => {
  // Approved / terminal success
  it("maps 'Approved' to approved", () => {
    expect(normalizeDiditStatus("Approved")).toBe("approved");
  });

  // Rejected / terminal failure
  it("maps 'Declined' to rejected", () => {
    expect(normalizeDiditStatus("Declined")).toBe("rejected");
  });

  // Pending review
  it("maps 'In Review' to pending_review", () => {
    expect(normalizeDiditStatus("In Review")).toBe("pending_review");
  });

  // In progress
  it("maps 'In Progress' to in_progress", () => {
    expect(normalizeDiditStatus("In Progress")).toBe("in_progress");
  });
  it("maps 'Resubmitted' to in_progress", () => {
    expect(normalizeDiditStatus("Resubmitted")).toBe("in_progress");
  });
  it("maps 'Awaiting User' to in_progress", () => {
    expect(normalizeDiditStatus("Awaiting User")).toBe("in_progress");
  });

  // Session created
  it("maps 'Not Started' to session_created", () => {
    expect(normalizeDiditStatus("Not Started")).toBe("session_created");
  });

  // Expired
  it("maps 'Expired' to expired", () => {
    expect(normalizeDiditStatus("Expired")).toBe("expired");
  });
  it("maps 'Kyc Expired' to expired", () => {
    expect(normalizeDiditStatus("Kyc Expired")).toBe("expired");
  });

  // Abandoned
  it("maps 'Abandoned' to abandoned", () => {
    expect(normalizeDiditStatus("Abandoned")).toBe("abandoned");
  });

  // Unknown / fallback → errored
  it("maps unknown status to errored", () => {
    expect(normalizeDiditStatus("SomeUnknownStatus")).toBe("errored");
  });
  it("maps null to errored", () => {
    expect(normalizeDiditStatus(null)).toBe("errored");
  });
  it("maps undefined to errored", () => {
    expect(normalizeDiditStatus(undefined)).toBe("errored");
  });
  it("maps empty string to errored", () => {
    expect(normalizeDiditStatus("")).toBe("errored");
  });

  // Case sensitivity (Didit sends exact case)
  it("maps lowercase 'approved' to errored (case-sensitive)", () => {
    expect(normalizeDiditStatus("approved")).toBe("errored");
  });
  it("maps uppercase 'APPROVED' to errored (case-sensitive)", () => {
    expect(normalizeDiditStatus("APPROVED")).toBe("errored");
  });
});
