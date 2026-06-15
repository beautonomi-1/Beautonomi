import { describe, expect, it } from "vitest";
import {
  applyPushUrlToPayload,
  resolvePushUrlFields,
  substituteTemplatePath,
  toWebPortalUrl,
} from "@/lib/notifications/push-url";

describe("push-url", () => {
  it("substitutes template variables in paths", () => {
    expect(substituteTemplatePath("/bookings/{{booking_id}}", { booking_id: "abc" })).toBe(
      "/bookings/abc",
    );
  });

  it("omits OneSignal launch URL for native customer pushes", () => {
    const fields = resolvePushUrlFields("/bookings/{{booking_id}}", { booking_id: "abc" }, {
      appType: "customer",
    });
    expect(fields.launchUrl).toBeUndefined();
    expect(fields.actionPath).toBe("/bookings/abc");
    expect(fields.webUrl).toBe(`${toWebPortalUrl("/bookings/abc")}`);
  });

  it("sets https launch URL for web portal sends", () => {
    const fields = resolvePushUrlFields("/bookings/{{booking_id}}", { booking_id: "abc" });
    expect(fields.launchUrl).toContain("/bookings/abc");
  });

  it("applyPushUrlToPayload stores relative deep_link in data for native", () => {
    const payload: Record<string, unknown> = { data: { template_key: "booking_confirmed" } };
    applyPushUrlToPayload(
      payload,
      resolvePushUrlFields("/bookings/xyz", {}, { appType: "provider" }),
    );
    expect(payload.url).toBeUndefined();
    expect((payload.data as Record<string, unknown>).deep_link).toBe("/bookings/xyz");
  });
});
