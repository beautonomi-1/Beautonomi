import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertReportSubscriptionAccess } from "../report-gating";
import * as featureAccess from "../feature-access";

describe("assertReportSubscriptionAccess", () => {
  const supabase = {} as never;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows superadmin", async () => {
    const result = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "staff",
      supabase,
      isSuperadmin: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("fail-opens when advanced_analytics key is missing", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "plan-1",
      planName: "Legacy",
      features: { online_booking: { enabled: true } },
      isFree: false,
    });

    const result = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "staff",
      supabase,
    });
    expect(result.allowed).toBe(true);
  });

  it("Starter allows clients via report_types", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "starter",
      planName: "Starter",
      features: {
        advanced_analytics: {
          enabled: true,
          basic_reports: true,
          advanced_reports: false,
          report_types: ["sales", "bookings", "clients"],
        },
      },
      isFree: true,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: true,
      basicReports: true,
      advancedReports: false,
      dataExport: false,
      apiAccess: false,
      reportTypes: ["sales", "bookings", "clients"],
    });

    const clients = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "clients",
      supabase,
    });
    expect(clients.allowed).toBe(true);

    const staff = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "staff",
      supabase,
    });
    expect(staff.allowed).toBe(false);
    if (!staff.allowed) {
      const body = await staff.response.json();
      expect(body.error.message).toMatch(/memberships/i);
      expect(body.error.message).toContain("Growth");
    }
  });

  it("Growth allows memberships but not gift_cards", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "growth",
      planName: "Growth",
      features: {
        advanced_analytics: {
          enabled: true,
          report_types: ["sales", "bookings", "staff", "clients", "products", "payments", "memberships"],
        },
      },
      isFree: false,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: true,
      basicReports: true,
      advancedReports: true,
      dataExport: true,
      apiAccess: false,
      reportTypes: ["sales", "bookings", "staff", "clients", "products", "payments", "memberships"],
    });

    const memberships = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "memberships",
      supabase,
    });
    expect(memberships.allowed).toBe(true);

    const giftCards = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "gift_cards",
      supabase,
    });
    expect(giftCards.allowed).toBe(false);
  });

  it("Scale allows every report type", async () => {
    const all = [
      "sales",
      "bookings",
      "staff",
      "clients",
      "products",
      "payments",
      "gift_cards",
      "packages",
      "memberships",
    ];
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "scale",
      planName: "Scale",
      features: { advanced_analytics: { enabled: true, report_types: all } },
      isFree: false,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: true,
      basicReports: true,
      advancedReports: true,
      dataExport: true,
      apiAccess: true,
      reportTypes: all,
    });

    for (const reportType of all) {
      const result = await assertReportSubscriptionAccess({ providerId: "p1", reportType, supabase });
      expect(result.allowed, reportType).toBe(true);
    }
    const schedule = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "analytics_only",
      supabase,
    });
    expect(schedule.allowed).toBe(true);
  });

  it("empty report_types falls back to basic/advanced buckets", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "legacy-basic",
      planName: "Legacy basic",
      features: { advanced_analytics: { enabled: true, basic_reports: true, advanced_reports: false } },
      isFree: false,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: true,
      basicReports: true,
      advancedReports: false,
      dataExport: false,
      apiAccess: false,
      reportTypes: [],
    });

    const sales = await assertReportSubscriptionAccess({ providerId: "p1", reportType: "sales", supabase });
    expect(sales.allowed).toBe(true);

    const staff = await assertReportSubscriptionAccess({ providerId: "p1", reportType: "staff", supabase });
    expect(staff.allowed).toBe(false);
  });

  it("Starter gift_cards deny uses Scale-only catalog copy", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "starter",
      planName: "Beautonomi Starter",
      features: {
        advanced_analytics: {
          enabled: true,
          report_types: ["sales", "bookings", "clients"],
        },
      },
      isFree: true,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: true,
      basicReports: true,
      advancedReports: false,
      dataExport: false,
      apiAccess: false,
      reportTypes: ["sales", "bookings", "clients"],
    });

    const result = await assertReportSubscriptionAccess({
      providerId: "p1",
      reportType: "gift_cards",
      supabase,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    const body = await result.response.json();
    expect(body.error.message).toMatch(/Scale/i);
    expect(body.error.message).not.toMatch(/Professional|Enterprise/i);
  });

  it("analytics disabled → 403 with SUBSCRIPTION_REQUIRED body", async () => {
    vi.spyOn(featureAccess, "getProviderSubscriptionTier").mockResolvedValue({
      planId: "no-analytics",
      planName: "No analytics",
      features: { advanced_analytics: { enabled: false } },
      isFree: true,
    });
    vi.spyOn(featureAccess, "checkAnalyticsFeatureAccess").mockResolvedValue({
      enabled: false,
      basicReports: false,
      advancedReports: false,
      dataExport: false,
      apiAccess: false,
      reportTypes: [],
    });

    const result = await assertReportSubscriptionAccess({ providerId: "p1", reportType: "sales", supabase });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(typeof body.error.message).toBe("string");
  });
});
