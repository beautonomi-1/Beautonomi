import { describe, expect, it } from "vitest";
import {
  parseProviderStaffToken,
  PROVIDER_ANY_STAFF_TOKEN,
  writeStaffTokenToServiceLine,
} from "../resolve-provider-any-staff-on-create";

describe("parseProviderStaffToken", () => {
  it("accepts any, uuid, none, and rejects garbage", () => {
    expect(parseProviderStaffToken(PROVIDER_ANY_STAFF_TOKEN)).toEqual({ kind: "any" });
    expect(parseProviderStaffToken("550e8400-e29b-41d4-a716-446655440000")).toEqual({
      kind: "uuid",
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(parseProviderStaffToken("")).toEqual({ kind: "none" });
    expect(parseProviderStaffToken("not-a-staff")).toEqual({ kind: "invalid" });
  });
});

describe("writeStaffTokenToServiceLine", () => {
  it("writes staff_id when absent", () => {
    const line: Record<string, unknown> = { service_id: "svc" };
    writeStaffTokenToServiceLine(line, "550e8400-e29b-41d4-a716-446655440000");
    expect(line.staff_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
