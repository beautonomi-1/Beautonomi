/**
 * Build CSV from arbitrary report JSON for mobile share (Excel / Google Sheets).
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform, Share } from "react-native";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return JSON.stringify(value).replace(/"/g, '""');
  }
  return String(value).replace(/"/g, '""');
}

function toCsvRow(cells: string[]): string {
  return cells.map((c) => `"${c}"`).join(",");
}

/** Unwrap typical `{ data: T }` API responses. */
export function unwrapReportPayload(input: unknown): unknown {
  if (input && typeof input === "object" && "data" in input && !Array.isArray(input)) {
    return (input as { data: unknown }).data;
  }
  return input;
}

function rowsFromFirstObjectArray(
  obj: Record<string, unknown>
): { headers: string[]; rows: string[][] } | null {
  for (const v of Object.values(obj)) {
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === "object" &&
      v[0] !== null &&
      !Array.isArray(v[0])
    ) {
      const arr = v as Record<string, unknown>[];
      const keys = new Set<string>();
      for (const row of arr) {
        for (const k of Object.keys(row)) {
          keys.add(k);
        }
      }
      const headers = Array.from(keys);
      const rows = arr.map((row) => headers.map((h) => escapeCell(row[h])));
      return { headers, rows };
    }
  }
  return null;
}

function productSalesPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("period_from", p.fromYmd);
  kv("period_to", p.toYmd);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  kv("total_units_sold", p.totalProductsSold);
  kv("units_from_booking_products", p.unitsFromBookings);
  kv("units_from_paid_orders", p.unitsFromOrders);
  kv("revenue_total", p.totalRevenue);
  kv("revenue_from_booking_lines", p.revenueFromBookings);
  kv("revenue_from_order_lines", p.revenueFromOrders);
  kv("cost_total", p.totalCost);
  kv("profit_total", p.totalProfit);
  kv(
    "average_revenue_per_unit_sold",
    typeof p.averageRevenuePerUnitSold === "number"
      ? p.averageRevenuePerUnitSold
      : p.averageProductValue,
  );

  rows.push("");
  rows.push(toCsvRow(["section", "product_name", "qty", "revenue", "profit"]));
  const top = Array.isArray(p.topProducts) ? (p.topProducts as Record<string, unknown>[]) : [];
  for (const row of top) {
    rows.push(
      toCsvRow([
        "top_product",
        escapeCell(row.productName),
        escapeCell(row.quantitySold),
        escapeCell(row.revenue),
        escapeCell(row.profit),
      ]),
    );
  }

  rows.push("");
  rows.push(toCsvRow(["section", "category", "qty", "revenue", "profit"]));
  const cats = Array.isArray(p.productsByCategory)
    ? (p.productsByCategory as Record<string, unknown>[])
    : [];
  for (const row of cats) {
    rows.push(
      toCsvRow([
        "by_category",
        escapeCell(row.category),
        escapeCell(row.quantitySold),
        escapeCell(row.revenue),
        escapeCell(row.profit),
      ]),
    );
  }

  return rows.join("\n");
}

function inventoryPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("as_of", p.asOf);
  kv("report_basis", p.reportBasis);
  kv("total_products", p.totalProducts);
  kv("active_products", p.activeProducts);
  kv("inactive_products", p.inactiveProducts);
  kv("products_tracking_stock", p.productsTrackingStock);
  kv("total_stock_value", p.totalStockValue);
  kv("low_stock_count", p.lowStockCount);
  kv("out_of_stock_count", p.outOfStockCount);

  rows.push("");
  rows.push(toCsvRow(["section", "category", "product_count", "stock_value"]));
  const cats = Array.isArray(p.categoryBreakdown) ? (p.categoryBreakdown as Record<string, unknown>[]) : [];
  for (const c of cats) {
    rows.push(
      toCsvRow(["category", escapeCell(c.category), escapeCell(c.count), escapeCell(c.stockValue)]),
    );
  }

  rows.push("");
  rows.push(toCsvRow(["section", "name", "category", "on_hand", "line_retail", "from_price"]));
  const low = Array.isArray(p.lowStockProducts) ? (p.lowStockProducts as Record<string, unknown>[]) : [];
  for (const x of low) {
    rows.push(
      toCsvRow([
        "low_stock_preview",
        escapeCell(x.name),
        escapeCell(x.category),
        escapeCell(x.stock_quantity),
        escapeCell(x.retail_line_value),
        escapeCell(x.price),
      ]),
    );
  }

  rows.push("");
  const out = Array.isArray(p.outOfStockProducts) ? (p.outOfStockProducts as Record<string, unknown>[]) : [];
  for (const x of out) {
    rows.push(
      toCsvRow([
        "out_of_stock_preview",
        escapeCell(x.name),
        escapeCell(x.category),
        escapeCell(x.stock_quantity),
        escapeCell(x.retail_line_value),
        escapeCell(x.price),
      ]),
    );
  }

  const all = Array.isArray(p.allProducts) ? (p.allProducts as Record<string, unknown>[]) : [];
  if (all.length > 0) {
    rows.push("");
    rows.push(toCsvRow(["section", "name", "category", "stock", "line_retail", "tracks_stock"]));
    for (const x of all) {
      rows.push(
        toCsvRow([
          "all_products",
          escapeCell(x.name),
          escapeCell(x.category),
          escapeCell(x.stock_quantity ?? x.quantity),
          escapeCell(x.retail_line_value),
          escapeCell(x.track_stock_quantity === false ? "no" : "yes"),
        ]),
      );
    }
  }

  return rows.join("\n");
}

function packageSalesPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("period_from", p.fromYmd);
  kv("period_to", p.toYmd);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  kv("total_bookings_in_window", p.totalPackagesSold);
  kv("total_booked_package_value", p.totalRevenue);
  kv("average_booked_value_per_booking", p.averagePackageValue);

  rows.push("");
  rows.push(toCsvRow(["package_name", "bookings", "booked_value", "avg_per_booking"]));
  const list = Array.isArray(p.packageSales) ? (p.packageSales as Record<string, unknown>[]) : [];
  for (const row of list) {
    rows.push(
      toCsvRow([
        escapeCell(row.packageName),
        escapeCell(row.bookings),
        escapeCell(row.revenue),
        escapeCell(row.averageValue),
      ]),
    );
  }

  return rows.join("\n");
}

function packageUsagePayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("period_from", p.fromYmd);
  kv("period_to", p.toYmd);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  kv("total_usage_events", p.totalPackagesUsed);
  kv("distinct_clients_union", p.totalUniqueClients);

  rows.push("");
  rows.push(toCsvRow(["package_name", "usage_events", "distinct_clients", "avg_events_per_client"]));
  const usage = Array.isArray(p.packageUsage) ? (p.packageUsage as Record<string, unknown>[]) : [];
  for (const row of usage) {
    rows.push(
      toCsvRow([
        escapeCell(row.packageName),
        escapeCell(row.totalUsage),
        escapeCell(row.uniqueClientsCount),
        escapeCell(row.averageUsagePerClient),
      ]),
    );
  }

  rows.push("");
  rows.push(toCsvRow(["top_client_name", "email", "package_included_bookings"]));
  const top = Array.isArray(p.topClients) ? (p.topClients as Record<string, unknown>[]) : [];
  for (const row of top) {
    rows.push(
      toCsvRow([escapeCell(row.clientName), escapeCell(row.email), escapeCell(row.packagesUsed)]),
    );
  }

  return rows.join("\n");
}

function performanceDashboardPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  const windows = p.windows as Record<string, { fromYmd?: string; toYmd?: string }> | undefined;
  if (windows?.today) {
    kv(
      "window_today_ymd",
      `${windows.today?.fromYmd ?? ""}→${windows.today?.toYmd ?? ""}`,
    );
  }
  if (windows?.week) {
    kv("window_week_ymd", `${windows.week?.fromYmd ?? ""}→${windows.week?.toYmd ?? ""}`);
  }
  if (windows?.month) {
    kv("window_month_ymd", `${windows.month?.fromYmd ?? ""}→${windows.month?.toYmd ?? ""}`);
  }

  const today = (p.today ?? {}) as Record<string, unknown>;
  const week = (p.week ?? {}) as Record<string, unknown>;
  const month = (p.month ?? {}) as Record<string, unknown>;
  kv("ledger_revenue_today", today.revenue);
  kv("ledger_from_bookings_today", today.ledgerFromBookings);
  kv("ledger_from_orders_today", today.ledgerFromProductOrders);
  kv("scheduled_bookings_today", today.bookings);
  kv("completed_today", today.completed);

  kv("ledger_revenue_week", week.revenue);
  kv("ledger_from_bookings_week", week.ledgerFromBookings);
  kv("ledger_from_orders_week", week.ledgerFromProductOrders);
  kv("scheduled_bookings_week", week.bookings);

  kv("ledger_revenue_month", month.revenue);
  kv("ledger_from_bookings_month", month.ledgerFromBookings);
  kv("ledger_from_orders_month", month.ledgerFromProductOrders);
  kv("scheduled_bookings_month", month.bookings);
  kv("distinct_clients_month", month.clients);

  rows.push("");
  rows.push(toCsvRow(["section", "scheduled_at", "status", "booked_total_snapshot"]));
  const upcoming = Array.isArray(p.upcomingBookings) ? p.upcomingBookings : [];
  for (const row of upcoming as Record<string, unknown>[]) {
    rows.push(
      toCsvRow([
        "upcoming",
        escapeCell(row.scheduled_at),
        escapeCell(row.status),
        escapeCell(row.total_amount),
      ]),
    );
  }
  const recent = Array.isArray(p.recentBookings) ? p.recentBookings : [];
  for (const row of recent as Record<string, unknown>[]) {
    rows.push(
      toCsvRow(["recent", escapeCell(row.scheduled_at), escapeCell(row.status), escapeCell(row.total_amount)]),
    );
  }

  return rows.join("\n");
}

function periodComparisonPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("granularity", p.period);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  const windows = p.windows as Record<string, { fromYmd?: string; toYmd?: string; description?: string }> | undefined;
  if (windows?.current) {
    kv(
      "current_window_ymd",
      `${windows.current.fromYmd ?? ""}→${windows.current.toYmd ?? ""}`,
    );
  }
  if (windows?.previous) {
    kv(
      "previous_window_ymd",
      `${windows.previous.fromYmd ?? ""}→${windows.previous.toYmd ?? ""}`,
    );
  }

  const cur = (p.current ?? {}) as Record<string, unknown>;
  const prev = (p.previous ?? {}) as Record<string, unknown>;
  const gro = (p.growth ?? {}) as Record<string, unknown>;

  kv("ledger_current", cur.revenue);
  kv("ledger_bookings_component_current", cur.ledgerFromBookings);
  kv("ledger_orders_component_current", cur.ledgerFromProductOrders);
  kv("bookings_current", cur.bookings);
  kv("clients_current", cur.clients);
  kv("avg_ledger_per_booking_current", cur.averageLedgerPerScheduledBooking ?? cur.averageValue);

  kv("ledger_previous", prev.revenue);
  kv("ledger_bookings_component_previous", prev.ledgerFromBookings);
  kv("ledger_orders_component_previous", prev.ledgerFromProductOrders);
  kv("bookings_previous", prev.bookings);
  kv("clients_previous", prev.clients);
  kv("avg_ledger_per_booking_previous", prev.averageLedgerPerScheduledBooking ?? prev.averageValue);

  kv("growth_revenue_pct", gro.revenue);
  kv("growth_bookings_pct", gro.bookings);
  kv("growth_clients_pct", gro.clients);
  kv("growth_avg_ledger_per_booking_pct", gro.averageLedgerPerScheduledBooking);

  return rows.join("\n");
}

function topProductsPayloadToCsv(p: Record<string, unknown>): string {
  const rows: string[] = [];
  const kv = (k: string, v: unknown) => rows.push(toCsvRow([k, escapeCell(v)]));

  kv("timezone", p.timezone);
  kv("period_from", p.fromYmd);
  kv("period_to", p.toYmd);
  kv("list_limit", p.limit);
  kv("report_basis", p.reportBasis ?? p.report_basis);
  kv("units_all_skus_in_window", p.totalProductsSold);
  kv("line_revenue_all_skus_in_window", p.totalRevenue);

  rows.push("");
  rows.push(toCsvRow(["rank", "product", "category", "units", "line_rows", "avg_unit", "line_revenue"]));
  const list = Array.isArray(p.topProducts) ? (p.topProducts as Record<string, unknown>[]) : [];
  list.forEach((row, i) => {
    rows.push(
      toCsvRow([
        String(i + 1),
        escapeCell(row.productName),
        escapeCell(row.category),
        escapeCell(row.totalQuantity),
        escapeCell(row.timesSold),
        escapeCell(row.averagePrice),
        escapeCell(row.totalRevenue),
      ]),
    );
  });

  return rows.join("\n");
}

/**
 * Flattens nested report payloads to a CSV string.
 */
export function reportPayloadToCsvString(payload: unknown, reportId: string): string {
  const p = unwrapReportPayload(payload);
  if (reportId === "product-sales" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return productSalesPayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "inventory" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return inventoryPayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "top-products" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return topProductsPayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "package-sales" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return packageSalesPayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "package-usage" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return packageUsagePayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "performance-dashboard" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return performanceDashboardPayloadToCsv(p as Record<string, unknown>);
  }
  if (reportId === "comparison" && p != null && typeof p === "object" && !Array.isArray(p)) {
    return periodComparisonPayloadToCsv(p as Record<string, unknown>);
  }
  if (p == null) {
    return toCsvRow(["(empty)"]);
  }

  if (Array.isArray(p)) {
    if (p.length === 0) {
      return toCsvRow(["(empty)"]);
    }
    const first = p[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const keys = new Set<string>();
      for (const row of p) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          for (const k of Object.keys(row as object)) {
            keys.add(k);
          }
        }
      }
      const headers = Array.from(keys);
      const lines = p.map((row) => {
        const r = (row as Record<string, unknown>) || {};
        return toCsvRow(headers.map((h) => escapeCell(r[h])));
      });
      return [toCsvRow(headers), ...lines].join("\n");
    }
    return [toCsvRow(["value"]), ...p.map((v) => toCsvRow([escapeCell(v)]))].join("\n");
  }

  if (typeof p === "object" && p !== null) {
    const obj = p as Record<string, unknown>;
    const tab = rowsFromFirstObjectArray(obj);
    if (tab) {
      return [toCsvRow(tab.headers), ...tab.rows.map((r) => toCsvRow(r))].join("\n");
    }
    return [
      toCsvRow(["key", "value"]),
      ...Object.entries(obj).map(([k, v]) => toCsvRow([k, escapeCell(v)])),
    ].join("\n");
  }

  return toCsvRow([String(p)]);
}

/**
 * Write CSV to cache and open the native share sheet (file on iOS / Android where supported).
 */
export async function shareReportAsCsv(
  reportId: string,
  displayTitle: string,
  payload: unknown
): Promise<void> {
  const csv = reportPayloadToCsvString(payload, reportId);
  const safe = reportId.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
  const name = `beautonomi_report_${safe}_${new Date().toISOString().slice(0, 10)}.csv`;
  const base = FileSystem.cacheDirectory;
  if (!base && Platform.OS !== "web") {
    await Share.share({ title: displayTitle, message: `${displayTitle}\n\n${csv.slice(0, 12_000)}` });
    return;
  }
  const uri = `${base ?? ""}${name}`;

  await FileSystem.writeAsStringAsync(uri, "\uFEFF" + csv);

  if (Platform.OS === "web") {
    await Share.share({
      title: displayTitle,
      message: csv.length > 12_000 ? `${displayTitle} — use the mobile app to share a .csv file.` : `${displayTitle}\n\n${csv}`,
    });
    return;
  }

  await Share.share({
    title: displayTitle,
    url: uri,
    message: `${displayTitle} (CSV)`,
  });
}
