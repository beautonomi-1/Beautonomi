import { describe, expect, it } from "vitest";
import { adminSpaAbsoluteUrl, adminSpaTo } from "./adminSpaPath";

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

describe("adminSpaAbsoluteUrl", () => {
  it("builds origin + /admin/ + path", () => {
    expect(adminSpaAbsoluteUrl("/admin/users/x")).toContain("/admin/users/x");
  });
});
