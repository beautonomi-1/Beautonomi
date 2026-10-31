import { describe, expect, it } from "vitest";
import { adminSpaAbsoluteUrl, adminSpaNotificationLink, adminSpaTo } from "./adminSpaPath";

describe("adminSpaTo", () => {
  it("returns root-absolute paths for React Router (leading slash)", () => {
    expect(adminSpaTo("/admin/dashboard")).toBe("/dashboard");
    expect(adminSpaTo("/admin/control-plane/overview")).toBe("/control-plane/overview");
    expect(adminSpaTo("/admin/users/abc")).toBe("/users/abc");
    expect(adminSpaTo("finance")).toBe("/finance");
  });

  it("maps bare /admin to /", () => {
    expect(adminSpaTo("/admin")).toBe("/");
    expect(adminSpaTo("/admin/")).toBe("/");
  });

  it("preserves query strings", () => {
    expect(adminSpaTo("/admin/login?next=%2Fadmin%2Fdashboard")).toBe("/login?next=%2Fadmin%2Fdashboard");
    expect(adminSpaTo("/admin/verifications?status=all")).toBe("/verifications?status=all");
    expect(adminSpaTo("/admin/refunds?status=success")).toBe("/refunds?status=success");
    expect(adminSpaTo("/admin/disputes?status=open")).toBe("/disputes?status=open");
    expect(adminSpaTo("/admin/webhooks?tab=failures")).toBe("/webhooks?tab=failures");
  });
});

describe("adminSpaNotificationLink", () => {
  const ticketId = "6506a136-d3cd-4b8e-8c21-d51b411327a3";

  it("rewrites customer my-tickets detail to support-tickets", () => {
    expect(adminSpaNotificationLink(`/help/my-tickets/${ticketId}`)).toBe(
      `/support-tickets/${ticketId}`,
    );
  });

  it("rewrites /admin/help/my-tickets detail to support-tickets", () => {
    expect(adminSpaNotificationLink(`/admin/help/my-tickets/${ticketId}`)).toBe(
      `/support-tickets/${ticketId}`,
    );
  });

  it("rewrites legacy support/tickets detail to support-tickets", () => {
    expect(adminSpaNotificationLink(`/support/tickets/${ticketId}`)).toBe(
      `/support-tickets/${ticketId}`,
    );
  });

  it("rewrites my-tickets list to support-tickets queue", () => {
    expect(adminSpaNotificationLink("/help/my-tickets")).toBe("/support-tickets");
  });

  it("preserves assist query on admin support-ticket links", () => {
    expect(
      adminSpaNotificationLink(
        `/admin/support-tickets/${ticketId}?assist=5d23c4d3-7e30-4567-bac9-7faa413e2d41`,
      ),
    ).toBe(`/support-tickets/${ticketId}?assist=5d23c4d3-7e30-4567-bac9-7faa413e2d41`);
  });

  it("leaves unrelated admin links unchanged", () => {
    expect(adminSpaNotificationLink("/admin/payouts")).toBe("/payouts");
  });
});

describe("adminSpaAbsoluteUrl", () => {
  it("builds origin + /admin/ + path", () => {
    expect(adminSpaAbsoluteUrl("/admin/users/x")).toContain("/admin/users/x");
  });
});
