import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_PURGE_AUDIT_DETAIL_COLUMNS,
  COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS,
  parseCompliancePurgeAuditPagination,
  validatePurgeTypeFilter,
} from "./purge-audit-query";

describe("purge-audit-query", () => {
  it("defaults pagination to page 1 and limit 50", () => {
    const params = new URLSearchParams();
    expect(parseCompliancePurgeAuditPagination(params)).toEqual({
      page: 1,
      limit: 50,
      offset: 0,
    });
  });

  it("clamps limit to 100 max", () => {
    const params = new URLSearchParams({ limit: "500", page: "2" });
    expect(parseCompliancePurgeAuditPagination(params)).toEqual({
      page: 2,
      limit: 100,
      offset: 100,
    });
  });

  it("list columns omit report; detail columns include report", () => {
    expect(COMPLIANCE_PURGE_AUDIT_LIST_COLUMNS.includes("report")).toBe(false);
    expect(COMPLIANCE_PURGE_AUDIT_DETAIL_COLUMNS.includes("report")).toBe(true);
  });

  it("validatePurgeTypeFilter rejects unknown types", () => {
    expect(validatePurgeTypeFilter("user")).toBe(true);
    expect(validatePurgeTypeFilter("")).toBe(true);
    expect(validatePurgeTypeFilter(null)).toBe(true);
    expect(validatePurgeTypeFilter("invalid")).toBe(false);
  });
});
