import { describe, expect, it } from "vitest";
import { buildUserReportPayload, canSubmitUserReport } from "../report-user-payload";

describe("report-user payload", () => {
  it("requires an identifier and a 10+ character description", () => {
    expect(canSubmitUserReport("a", "long enough text")).toBe(false);
    expect(canSubmitUserReport("@jo", "too short")).toBe(false);
    expect(canSubmitUserReport("@jo", "this is long enough")).toBe(true);
  });

  it("sends handles without the leading @, including handles that contain a dash", () => {
    expect(buildUserReportPayload(" @@jane ", " harassment in chat ")).toEqual({
      report_type: "safety_report_user",
      description: "harassment in chat",
      reported_handle: "jane",
    });
    expect(buildUserReportPayload("anne-marie", "harassment in chat")).toMatchObject({
      reported_handle: "anne-marie",
    });
  });

  it("sends only real UUIDs as reported_user_id", () => {
    const id = "6f1c2a3b-0000-4000-8000-000000000001";
    expect(buildUserReportPayload(id, "harassment in chat").reported_user_id).toBe(id);
  });
});
