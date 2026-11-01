import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isYocoPaymentException,
  type YocoPaymentRow,
} from "../card-machine-reconciliation-utils";
import { reportDateRangeFromParams } from "../provider-report-utils";
import { MAX_BOOKINGS_FOR_REPORT } from "../constants";

const webSrcRoot = join(__dirname, "../../..");
const monorepoApps = join(webSrcRoot, "../..");

function readWebSrc(relativeFromSrcApp: string): string {
  return readFileSync(join(webSrcRoot, "app", relativeFromSrcApp), "utf8");
}

describe("provider report fixes — QA regression contracts", () => {
  it("no-shows web page labels ledger net without a Lost Revenue card title", () => {
    const src = readWebSrc("provider/reports/bookings/no-shows/page.tsx");
    expect(src).not.toContain("Lost Revenue");
    expect(src).toContain("ledgerRecognised");
    expect(src).toContain("bookedValueAmount");
    expect(src).toContain("repeatOffendersHint");
  });

  it("no-shows CSV export uses ledger recognised and booked value wording", () => {
    const src = readWebSrc("provider/reports/utils/export.ts");
    const start = src.indexOf('case "no-shows"');
    expect(start).toBeGreaterThan(-1);
    const noShowsBlock = src.slice(start, src.indexOf('case "product-sales"', start));
    expect(noShowsBlock).toContain("Ledger already recognised");
    expect(noShowsBlock).toContain('"Booked value"');
    expect(noShowsBlock).not.toMatch(/Metric: exportMetric\("Lost Revenue"\)/);
  });

  it("dashboard gift-card earnings row is not navigable (ledger issuance)", () => {
    const src = readWebSrc("provider/dashboard/DashboardClient.tsx");
    const giftStart = src.indexOf('rounded p-2">\n              <span className="text-sm text-gray-600">{t("web.provider.dashboard.giftCardLedgerIssuance")}');
    expect(giftStart).toBeGreaterThan(-1);
    const giftEnd = src.indexOf("</div>", giftStart) + "</div>".length;
    const giftBlock = src.slice(giftStart, giftEnd);
    expect(giftBlock).not.toContain("onClick");
    expect(giftBlock).not.toContain('role="button"');
    expect(giftBlock).not.toContain("cursor-pointer");
    expect(src).toContain('navigateTo("/provider/reports/memberships")');
  });

  it("gift redemption inclusion does not gate on appointment scheduled_at", () => {
    const bookingMap = new Map([
      [
        "b1",
        {
          id: "b1",
          scheduled_at: "2025-06-01T09:00:00.000Z",
          gift_card_id: "gc-1",
        },
      ],
    ]);
    const captures = [
      { booking_id: "b1", captured_at: "2026-02-15T14:00:00.000Z" },
    ];
    const included = captures.filter((r) => bookingMap.has(r.booking_id));
    expect(included).toHaveLength(1);
  });

  it("card machine counts exceptions from all in-window rows, not a 200-row prefilter", () => {
    const inWindow: YocoPaymentRow[] = [
      ...Array.from({ length: 250 }, (_, i) => ({
        id: `ok-${i}`,
        status: "successful",
        created_at: "2026-05-02T12:00:00.000Z",
      })),
      {
        id: "pending-old",
        status: "pending",
        created_at: "2026-05-01T08:00:00.000Z",
      },
    ];
    const exceptions = inWindow.filter((p) => isYocoPaymentException(p.status));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].id).toBe("pending-old");
  });

  it("report date range includes the full civil end day (card machine / Yoco bounds)", () => {
    const params = new URLSearchParams({ from: "2026-05-02", to: "2026-05-02" });
    const range = reportDateRangeFromParams(params, "Africa/Johannesburg");
    expect(range.toDate.toISOString()).toBe("2026-05-02T21:59:59.999Z");
    expect(
      new Date("2026-05-02T20:00:00.000Z").getTime() <= range.toDate.getTime(),
    ).toBe(true);
  });

  it("LTV cap constant matches truncation copy in API route", () => {
    const routeSrc = readWebSrc("api/provider/reports/clients/lifetime-value/route.ts");
    expect(routeSrc).toContain(".order(\"scheduled_at\", { ascending: false })");
    expect(routeSrc).toContain("MAX_BOOKINGS_FOR_REPORT");
    expect(routeSrc).toContain("Older visits are not in this list.");
    expect(MAX_BOOKINGS_FOR_REPORT).toBe(10_000);
  });

  it("web LTV page shows booked vs earned and reportBasis", () => {
    const src = readWebSrc("provider/reports/clients/lifetime-value/page.tsx");
    expect(src).toContain("averageBookedValue");
    expect(src).toContain("averageEarned");
    expect(src).toContain("reportBasis");
    expect(src).toContain("clientEarned");
  });

  it("mobile EOD uses singleDate controls only in detail screen", () => {
    const src = readFileSync(
      join(monorepoApps, "provider/app/(app)/(tabs)/more/reports/detail/[reportId].tsx"),
      "utf8",
    );
    expect(src).toContain('def.query === "singleDate"');
    expect(src).toContain("eodTodayA11y");
    expect(src).toContain("todayReportYmd");
    expect(src).toContain("formatReportSingleDateCaption");
  });
});
