/**
 * Utility functions for exporting report data to CSV and PDF
 */

import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { toast } from "sonner";

/** Generic report row shape for export formatters */
export type ReportRow = Record<string, unknown>;

/** Escape text for HTML print/PDF to avoid script injection and broken layout from `<` in values. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format numeric amounts for CSV/PDF export rows (tenant currency from config bundle). */
export function fm(amount: unknown, currencyCode: string): string {
  const n =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? parseFloat(amount)
        : Number(amount ?? 0);
  return formatCurrency(Number.isFinite(n) ? n : 0, currencyCode);
}

/** Human-readable CSV column titles from camelCase / snake_case keys. */
export function humanizeExportHeader(key: string): string {
  const known: Record<string, string> = {
    totalBookings: "Total bookings",
    totalRevenue: "Total revenue",
    serviceName: "Service name",
    staffName: "Staff name",
    clientName: "Client name",
    created_at: "Created at",
    paystack_reference: "Paystack reference",
    paid_amount: "Paid amount",
    allocation_status: "Allocation status",
    amount_match_status: "Amount match status",
    payout_eligibility_status: "Payout eligibility",
  };
  if (known[key]) return known[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  if (typeof value === "object") {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) {
    toast.error("No data to export");
    return;
  }

  const headers = Object.keys(data[0]);
  const headerLabels = headers.map(humanizeExportHeader);

  const csvContent = [
    headerLabels.map((h) => escapeCsvCell(h)).join(","),
    ...data.map((row) =>
      headers.map((header) => escapeCsvCell(row[header])).join(",")
    ),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  toast.success("CSV downloaded");
}

/**
 * Export report to PDF using browser print functionality
 * Can export either from a report element ID or from data array
 */
export function exportToPDF(reportIdOrData: string | unknown[], filename?: string, title: string = "Report") {
  const toastId = toast.loading("Preparing PDF…");
  const finish = (ok: boolean, message?: string) => {
    toast.dismiss(toastId);
    if (!ok && message) toast.error(message);
  };

  // If first parameter is a string, it's a report ID - export the HTML element
  if (typeof reportIdOrData === "string") {
    const reportElement = document.getElementById(reportIdOrData);
    if (!reportElement) {
      finish(false, "Report element not found");
      return;
    }

    // Clone the element to avoid modifying the original
    const clonedElement = reportElement.cloneNode(true) as HTMLElement;
    
    // Create HTML document
    const safeTitle = escapeHtml(title);
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
              body { margin: 0; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 1000px;
              color: #111;
            }
            h1 {
              margin-bottom: 20px;
              color: #333;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
            * {
              box-sizing: border-box;
            }
            #reportRoot table {
              width: 100%;
              border-collapse: collapse;
              margin: 0.5rem 0;
            }
            #reportRoot th,
            #reportRoot td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              text-align: left;
              font-size: 12px;
              color: #111;
              background: #fff;
            }
            #reportRoot img { max-width: 100% !important; }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <p>Generated: ${escapeHtml(new Date().toLocaleString())}</p>
          <div id="reportRoot">${clonedElement.outerHTML}</div>
          <div class="footer">
            <p>Report generated by Beautonomi</p>
          </div>
        </body>
      </html>
    `;

    // Open in new window and print
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      finish(false, "Allow popups to export PDF");
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        finish(true);
      }, 250);
    };
    return;
  }

  // Otherwise, treat as data array (legacy support)
  const data = reportIdOrData;
  if (!data || data.length === 0) {
    finish(false, "No data to export");
    return;
  }

  const headers = Object.keys(data[0]);
  const headerLabels = headers.map(humanizeExportHeader);
  
  // Create HTML table
  const tableRows = data.map((row) => {
    const cells = headers.map((header) => {
      const value = row[header];
      let displayValue = "";
      
      if (value === null || value === undefined) {
        displayValue = "";
      } else if (value instanceof Date) {
        displayValue = value.toLocaleDateString();
      } else if (typeof value === "object") {
        displayValue = JSON.stringify(value);
      } else {
        displayValue = String(value);
      }
      
      return `<td>${displayValue}</td>`;
    }).join("");
    
    return `<tr>${cells}</tr>`;
  }).join("");

  const headerCells = headerLabels.map((h) => `<th>${escapeHtml(h)}</th>`).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            @page { margin: 1cm; }
            body { margin: 0; }
          }
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          h1 {
            margin-bottom: 20px;
            color: #333;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f5f5f5;
            font-weight: bold;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Generated: ${escapeHtml(new Date().toLocaleString())}</p>
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="footer">
          <p>Report generated by Beautonomi</p>
        </div>
      </body>
    </html>
  `;

  // Open in new window and print
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    finish(false, "Allow popups to export PDF");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      finish(true);
    }, 250);
  };
}

export function formatReportDataForExport(
  data: ReportRow,
  reportType: string,
  currencyCode: string = LAST_RESORT_CURRENCY
): Record<string, unknown>[] {
  switch (reportType) {
    case "booking-summary":
      return [
        { Metric: "Total Bookings", Value: data.totalBookings || 0 },
        { Metric: "Total Revenue", Value: fm((data.totalRevenue as number), currencyCode) },
        { Metric: "Average Booking Value", Value: fm((data.averageBookingValue as number), currencyCode) },
        ...((data.statusBreakdown as ReportRow[]) || []).map((status) => ({
          Status: status.status,
          Count: status.count,
          Revenue: fm((status.revenue as number), currencyCode),
          Percentage: `${(status.percentage as number)?.toFixed(1) || 0}%`,
        })),
        ...((data.dailyBookings as ReportRow[]) || []).map((day) => ({
          Date: day.date,
          Bookings: day.count,
          Revenue: fm((day.revenue as number), currencyCode),
        })),
        ...((data.topServices as ReportRow[]) || []).map((service) => ({
          Service: service.serviceName,
          Bookings: service.bookings,
          Revenue: fm((service.revenue as number), currencyCode),
        })),
      ];

    case "business-dashboard": {
      const today = (data.today ?? {}) as Record<string, unknown>;
      const week = (data.week ?? {}) as Record<string, unknown>;
      const month = (data.month ?? {}) as Record<string, unknown>;
      const windows = data.windows as Record<string, { fromYmd?: string; toYmd?: string }> | undefined;
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "Basis (summary)", Value: data.reportBasis }]
          : []),
        ...(windows?.today?.fromYmd && windows?.today?.toYmd
          ? [{ Metric: "Today window (YMD)", Value: `${windows.today.fromYmd} → ${windows.today.toYmd}` }]
          : []),
        ...(windows?.week?.fromYmd && windows?.week?.toYmd
          ? [{ Metric: "Week window (YMD)", Value: `${windows.week.fromYmd} → ${windows.week.toYmd}` }]
          : []),
        ...(windows?.month?.fromYmd && windows?.month?.toYmd
          ? [{ Metric: "Month window (YMD)", Value: `${windows.month.fromYmd} → ${windows.month.toYmd}` }]
          : []),
        { Metric: "Ledger earnings · today", Value: fm(Number(today.revenue ?? 0), currencyCode) },
        {
          Metric: "Ledger from bookings · today",
          Value: fm(Number(today.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders · today",
          Value: fm(Number(today.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Scheduled bookings · today", Value: Number(today.bookings ?? 0) },
        { Metric: "Completed · today", Value: Number(today.completed ?? 0) },
        { Metric: "Ledger earnings · week", Value: fm(Number(week.revenue ?? 0), currencyCode) },
        {
          Metric: "Ledger from bookings · week",
          Value: fm(Number(week.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders · week",
          Value: fm(Number(week.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Scheduled bookings · week", Value: Number(week.bookings ?? 0) },
        { Metric: "Ledger earnings · month", Value: fm(Number(month.revenue ?? 0), currencyCode) },
        {
          Metric: "Ledger from bookings · month",
          Value: fm(Number(month.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders · month",
          Value: fm(Number(month.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Scheduled bookings · month", Value: Number(month.bookings ?? 0) },
        { Metric: "Distinct clients · month", Value: Number(month.clients ?? 0) },
        ...((data.upcomingBookings as ReportRow[]) || []).map((booking) => ({
          "Upcoming at": new Date((booking.scheduled_at as string) || 0).toLocaleString(),
          Status: booking.status,
          "Booked total (snapshot)": fm(Number(booking.total_amount ?? 0), currencyCode),
        })),
        ...((data.recentBookings as ReportRow[]) || []).map((booking) => ({
          "Recent at": new Date((booking.scheduled_at as string) || 0).toLocaleString(),
          Status: booking.status,
          "Booked total (snapshot)": fm(Number(booking.total_amount ?? 0), currencyCode),
        })),
      ];
    }
    
    case "sales-summary": {
      const rt = data.recordedTakings as Record<string, unknown> | undefined;
      const byMethod = rt?.byPaymentMethod as Record<string, number> | undefined;
      const methodRows =
        byMethod != null
          ? Object.entries(byMethod)
              .filter(([, amt]) => Number(amt) > 0.005)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .map(([method, amt]) => ({
                Metric: `Recorded takings — ${method}`,
                Value: fm(Number(amt), currencyCode),
              }))
          : [];
      return [
        { Metric: "Total revenue (ledger net)", Value: fm(data.totalRevenue, currencyCode) },
        { Metric: "Appointment ledger revenue", Value: fm(Number(data.appointmentLedgerRevenue ?? data.totalRevenue ?? 0), currencyCode) },
        { Metric: "Retail ledger revenue", Value: fm(Number(data.retailLedgerRevenue ?? 0), currencyCode) },
        { Metric: "Recorded takings total (logged in-app)", Value: fm(Number(rt?.total ?? 0), currencyCode) },
        { Metric: "Recorded — booking payments", Value: fm(Number(rt?.bookingPaymentsTotal ?? 0), currencyCode) },
        { Metric: "Recorded — wallet on bookings", Value: fm(Number(rt?.walletTotal ?? 0), currencyCode) },
        { Metric: "Recorded — retail & legacy sales", Value: fm(Number(rt?.retailAndLegacySalesTotal ?? 0), currencyCode) },
        { Metric: "Recorded — tips (ledger date)", Value: fm(Number(rt?.tipsTotal ?? 0), currencyCode) },
        { Metric: "Recorded — cancellation fees", Value: fm(Number(rt?.cancellationFeesTotal ?? 0), currencyCode) },
        ...methodRows,
        { Metric: "Scheduled appointments (all statuses)", Value: data.totalBookings || 0 },
        { Metric: "Appointments with ledger activity", Value: Number(data.bookingsWithLedgerActivity ?? 0) },
        { Metric: "Avg ledger per appointment (with activity)", Value: fm(data.averageBookingValue, currencyCode) },
        ...((data.revenueByDay as ReportRow[]) || []).map((item) => ({
          Date: item.date,
          Revenue: fm((item.revenue as number), currencyCode),
          "Scheduled bookings that day": item.bookings || 0,
        })),
      ];
    }

    case "staff-performance": {
      const sum = data.summary as Record<string, unknown> | undefined;
      return [
        ...(sum
          ? [
              { Metric: "Unique appointments (summary)", Value: Number(sum.uniqueAppointments ?? sum.totalBookings ?? 0) },
              { Metric: "Ledger net (sum)", Value: fm(Number(sum.totalRevenue ?? 0), currencyCode) },
              { Metric: "Avg rating (weighted)", Value: Number(sum.averageRating ?? 0).toFixed(2) },
            ]
          : []),
        ...((data.staffMembers as ReportRow[]) || []).map((staff) => ({
          "Staff Name": staff.staffName,
          "Appointments (staff)": staff.totalBookings,
          "Ledger net": fm((staff.totalRevenue || 0), currencyCode),
          "Hours worked": `${Number(staff.totalHours ?? 0).toFixed(1)}h`,
          "Average rating": staff.averageRating != null ? Number(staff.averageRating).toFixed(1) : "N/A",
          Commission: fm((staff.commissionEarned || 0), currencyCode),
        })),
      ];
    }
    
    case "client-summary": {
      const cs = data as ReportRow & { clientRetention?: { retentionRate?: number } };
      return [
        { Metric: "Total Clients (distinct in window)", Value: data.totalClients || 0 },
        { Metric: "New Clients (first-ever in scope in window)", Value: data.newClients || 0 },
        { Metric: "Returning (2+ bookings in window)", Value: data.returningClients || 0 },
        { Metric: "Avg spend per client (window)", Value: fm(Number(data.averageLifetimeValue ?? 0), currencyCode) },
        {
          Metric: "Avg bookings per client",
          Value: Number(cs.averageBookingsPerClient ?? 0).toFixed(2),
        },
        {
          Metric: "Retention %",
          Value: `${Number(cs.clientRetention?.retentionRate ?? 0).toFixed(1)}%`,
        },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: "Basis", Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "Summary (one line)", Value: data.reportBasis }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...((data.topClients as ReportRow[]) || []).map((client) => ({
          "Client Name": client.clientName,
          "Total Bookings": client.totalBookings,
          "Total Spent": fm((client.totalSpent as number), currencyCode),
          "Last Visit": client.lastVisit,
        })),
      ];
    }

    case "booking-status":
      return [
        { Metric: "Total Bookings", Value: data.totalBookings || 0 },
        { Metric: "Completion Rate", Value: `${Number(data.completionRate ?? 0).toFixed(1)}%` },
        { Metric: "Cancellation Rate", Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: "No-Show Rate", Value: `${Number(data.noShowRate ?? 0).toFixed(1)}%` },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: "Basis (counts & ledger)", Value: data.basisNote }]
          : []),
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: "Ledger transaction types", Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
          : []),
        ...((data.bookingsByStatus as ReportRow[]) || []).map((status) => ({
          Status: status.status,
          Count: status.count,
          Percentage: `${(status.percentage as number)?.toFixed(1) || 0}%`,
          Revenue: fm((status.revenue as number), currencyCode),
        })),
      ];

    case "service-performance":
      return [
        { Metric: "Distinct offerings", Value: data.totalServices || 0 },
        { Metric: "Completed appointments (unique)", Value: data.totalBookings || 0 },
        { Metric: "Ledger net allocated (total)", Value: fm(data.totalRevenue, currencyCode) },
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: "Ledger transaction types", Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
          : []),
        ...((data.topServices as ReportRow[]) || (data.allServices as ReportRow[]) || []).map((s) => ({
          Service: s.serviceName,
          Category: s.category,
          Bookings: s.bookings,
          Revenue: fm((s.revenue as number), currencyCode),
          "Avg ledger per visit": fm(
            Number(
              (s as { averageRevenuePerBooking?: number }).averageRevenuePerBooking ??
                (s as { averagePrice?: number }).averagePrice ??
                0,
            ),
            currencyCode,
          ),
        })),
      ];

    case "revenue-trends":
      return [
        { Metric: "Granularity", Value: data.period || "" },
        ...(data.dateRange && typeof data.dateRange === "object"
          ? [
              {
                Metric: "Window",
                Value: `${(data.dateRange as { fromYmd?: string }).fromYmd ?? ""} → ${(data.dateRange as { toYmd?: string }).toYmd ?? ""}`,
              },
              ...((data.dateRange as { timezone?: string }).timezone
                ? [{ Metric: "Timezone", Value: String((data.dateRange as { timezone: string }).timezone) }]
                : []),
            ]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: "Basis (summary)", Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: "Ledger net (sum of buckets)", Value: fm(data.totalRevenue, currencyCode) },
        { Metric: "Scheduled visits (sum)", Value: data.totalBookings || 0 },
        { Metric: "Avg ledger per bucket", Value: fm(Number(data.averageRevenue ?? 0), currencyCode) },
        {
          Metric: "Δ revenue vs prior bucket",
          Value: `${Number(data.revenueGrowth ?? 0).toFixed(1)}%`,
        },
        {
          Metric: "Δ visits vs prior bucket",
          Value: `${Number(data.bookingsGrowth ?? 0).toFixed(1)}%`,
        },
        ...((data.trends as ReportRow[]) || []).map((t) => ({
          Bucket: t.period,
          "Ledger net": fm((t.revenue as number), currencyCode),
          Visits: t.bookings || 0,
        })),
      ];

    case "business-overview":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Calendar window", Value: `${data.fromYmd} → ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "Basis (summary)", Value: data.reportBasis }]
          : []),
        { Metric: "Ledger earnings (provider_earnings)", Value: fm(data.totalRevenue, currencyCode) },
        {
          Metric: "Ledger from bookings",
          Value: fm(Number((data as ReportRow).ledgerEarningsFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders",
          Value: fm(Number((data as ReportRow).ledgerEarningsFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Net after refunds & cancellation fees", Value: fm(data.netRevenue, currencyCode) },
        { Metric: "Refunds (ledger)", Value: fm(data.totalRefunded, currencyCode) },
        { Metric: "Cancellation fees (net)", Value: fm(Number((data as ReportRow).cancellationFees ?? 0), currencyCode) },
        { Metric: "Tips (ledger)", Value: fm(Number((data as ReportRow).tipsTotal ?? 0), currencyCode) },
        { Metric: "Scheduled bookings (all statuses)", Value: data.totalBookings || 0 },
        { Metric: "Distinct clients", Value: data.uniqueClients || 0 },
        { Metric: "Avg ledger / booking (with earnings)", Value: fm(data.averageBookingValue, currencyCode) },
        { Metric: "Completion rate", Value: `${Number(data.completionRate ?? 0).toFixed(1)}%` },
        { Metric: "Cancellation rate", Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: "No-show rate", Value: `${Number(data.noShowRate ?? 0).toFixed(1)}%` },
        {
          Metric: "Ledger growth vs prior window",
          Value: `${Number(data.revenueGrowth ?? 0).toFixed(1)}%`,
        },
        {
          Metric: "Payments succeeded / total",
          Value: `${Number((data as ReportRow).successfulPayments ?? 0)} / ${Number((data as ReportRow).totalPayments ?? 0)}`,
        },
        { Metric: "Staff profiles (provider-wide)", Value: (data as ReportRow).totalStaff ?? "" },
      ];

    case "business-comparison": {
      const current = (data.current ?? {}) as Record<string, unknown>;
      const previous = (data.previous ?? {}) as Record<string, unknown>;
      const growth = (data.growth ?? {}) as Record<string, unknown>;
      const windows = data.windows as
        | Record<string, { fromYmd?: string; toYmd?: string; description?: string }>
        | undefined;
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.period === "string" ? [{ Metric: "Granularity", Value: data.period }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "Basis (summary)", Value: data.reportBasis }]
          : []),
        ...(windows?.current?.fromYmd && windows?.current?.toYmd
          ? [
              {
                Metric: "Current window (YMD)",
                Value: `${windows.current.fromYmd} → ${windows.current.toYmd}`,
              },
            ]
          : []),
        ...(windows?.previous?.fromYmd && windows?.previous?.toYmd
          ? [
              {
                Metric: "Previous window (YMD)",
                Value: `${windows.previous.fromYmd} → ${windows.previous.toYmd}`,
              },
            ]
          : []),
        { Metric: "Ledger earnings · current", Value: fm(Number(current.revenue ?? 0), currencyCode) },
        {
          Metric: "Ledger from bookings · current",
          Value: fm(Number(current.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders · current",
          Value: fm(Number(current.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Ledger earnings · previous", Value: fm(Number(previous.revenue ?? 0), currencyCode) },
        {
          Metric: "Ledger from bookings · previous",
          Value: fm(Number(previous.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: "Ledger from product orders · previous",
          Value: fm(Number(previous.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: "Growth · ledger headline %", Value: `${Number(growth.revenue ?? 0).toFixed(1)}%` },
        { Metric: "Scheduled bookings · current", Value: Number(current.bookings ?? 0) },
        { Metric: "Scheduled bookings · previous", Value: Number(previous.bookings ?? 0) },
        { Metric: "Growth · bookings %", Value: `${Number(growth.bookings ?? 0).toFixed(1)}%` },
        { Metric: "Distinct clients · current", Value: Number(current.clients ?? 0) },
        { Metric: "Distinct clients · previous", Value: Number(previous.clients ?? 0) },
        { Metric: "Growth · clients %", Value: `${Number(growth.clients ?? 0).toFixed(1)}%` },
        {
          Metric: "Avg ledger / scheduled booking · current",
          Value: fm(Number(current.averageLedgerPerScheduledBooking ?? current.averageValue ?? 0), currencyCode),
        },
        {
          Metric: "Avg ledger / scheduled booking · previous",
          Value: fm(Number(previous.averageLedgerPerScheduledBooking ?? previous.averageValue ?? 0), currencyCode),
        },
        {
          Metric: "Growth · avg ledger / booking %",
          Value: `${Number(growth.averageLedgerPerScheduledBooking ?? 0).toFixed(1)}%`,
        },
      ];
    }

    case "gift-card-sales":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "What this report counts", Value: String(data.reportBasis) }]
          : []),
        { Metric: "Redemption rows", Value: data.totalGiftCardsSold || 0 },
        { Metric: "Redeemed value (sum of amounts)", Value: fm(data.totalRevenue, currencyCode) },
        { Metric: "Avg per redemption row", Value: fm(Number(data.averageGiftCardValue ?? 0), currencyCode) },
        ...((data.giftCardSales as ReportRow[]) || []).map((item) => ({
          Section: "By amount",
          Amount: fm(Number(item.amount || 0), currencyCode),
          Rows: item.count || 0,
          Subtotal: fm(Number(item.revenue || 0), currencyCode),
          "Pct of rows": `${Number(item.percentage ?? 0).toFixed(1)}%`,
        })),
      ];

    case "gift-card-redemptions":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "What this report counts", Value: String(data.reportBasis) }]
          : []),
        { Metric: "Redemption rows", Value: data.totalRedemptions || 0 },
        { Metric: "Redeemed value", Value: fm(data.totalRedeemedValue, currencyCode) },
        { Metric: "Avg per row", Value: fm(Number(data.averageRedemptionValue ?? 0), currencyCode) },
        ...((data.redemptions as ReportRow[]) || []).map((r) => ({
          Section: "Capture",
          Amount: fm(Number(r.amount || 0), currencyCode),
          "Captured at": (r.redeemed_at as string) ?? (r.captured_at as string) ?? "",
        })),
      ];

    case "cancellations":
      return [
        { Metric: "Total Cancelled", Value: data.totalCancelled || 0 },
        { Metric: "Total Bookings (denominator)", Value: data.totalBookings ?? "" },
        { Metric: "Cancellation Rate", Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: "Ledger net (in window)", Value: fm(Number(data.lostRevenue ?? 0), currencyCode) },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: "Basis", Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "Summary (one line)", Value: data.reportBasis }]
          : []),
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: "Ledger transaction types", Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...((data.dailyBreakdown as ReportRow[]) || []).map((d) => ({
          "Daily bucket": d.date,
          Cancellations: d.count,
        })),
        ...((data.cancellationReasons as ReportRow[]) || []).map((r) => ({
          Reason: r.reason,
          Count: r.count,
          Percentage: `${((r.percentage as number) || 0).toFixed(1)}%`,
        })),
      ];

    case "no-shows":
      return [
        { Metric: "Total No-Shows", Value: data.totalNoShows || 0 },
        { Metric: "Lost Revenue", Value: fm(data.lostRevenue, currencyCode) },
        ...((data.repeatOffenders as ReportRow[]) || []).map((r) => ({
          Name: r.name,
          Count: r.count,
          Revenue: fm(Number(r.revenue || 0), currencyCode),
        })),
      ];

    case "product-sales":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "What this report counts", Value: data.reportBasis }]
          : []),
        { Metric: "Total units sold", Value: data.totalProductsSold || 0 },
        ...(typeof data.unitsFromBookings === "number"
          ? [{ Metric: "Units from appointment add-ons (booking_products)", Value: data.unitsFromBookings }]
          : []),
        ...(typeof data.unitsFromOrders === "number"
          ? [{ Metric: "Units from paid retail orders", Value: data.unitsFromOrders }]
          : []),
        { Metric: "Total Revenue", Value: fm(data.totalRevenue, currencyCode) },
        ...(typeof data.revenueFromBookings === "number"
          ? [{ Metric: "Revenue from appointment add-ons", Value: fm(data.revenueFromBookings, currencyCode) }]
          : []),
        ...(typeof data.revenueFromOrders === "number"
          ? [{ Metric: "Revenue from paid retail orders", Value: fm(data.revenueFromOrders, currencyCode) }]
          : []),
        { Metric: "Total Cost (supply_price × qty)", Value: fm((data.totalCost ?? 0), currencyCode) },
        { Metric: "Total Profit", Value: fm((data.totalProfit ?? 0), currencyCode) },
        {
          Metric: "Avg revenue per unit sold",
          Value: fm(
            typeof data.averageRevenuePerUnitSold === "number"
              ? data.averageRevenuePerUnitSold
              : (data.averageProductValue as number) ?? 0,
            currencyCode,
          ),
        },
        ...((data.topProducts as ReportRow[]) || []).map((p) => ({
          Section: "Top products",
          Product: p.productName,
          "Quantity Sold": p.quantitySold || 0,
          Revenue: fm(((p.revenue as number) || 0), currencyCode),
          Cost: fm(((p.cost as number) ?? 0), currencyCode),
          Profit: fm(((p.profit as number) ?? 0), currencyCode),
        })),
        ...((data.productsByCategory as ReportRow[]) || []).map((p) => ({
          Section: "By category",
          Category: p.category,
          "Quantity Sold": p.quantitySold || 0,
          Revenue: fm(((p.revenue as number) || 0), currencyCode),
          Profit: fm(((p.profit as number) ?? 0), currencyCode),
        })),
      ];

    case "payment-summary":
      return [
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: "Basis", Value: (data as ReportRow).reportBasis }]
          : []),
        ...(typeof (data as ReportRow).timezone === "string"
          ? [{ Metric: "Timezone", Value: (data as ReportRow).timezone }]
          : []),
        { Metric: "Bookings (excl. pending)", Value: data.totalPayments || 0 },
        { Metric: "Gross Booked Value", Value: fm(data.grossBookedValue ?? data.totalAmount, currencyCode) },
        { Metric: "Customer Funds Settled (deduped)", Value: fm(data.settledLedgerAmount ?? data.totalCollected, currencyCode) },
        { Metric: "Customer Payments by Method Total", Value: fm(data.customerPaymentsByMethodTotal, currencyCode) },
        { Metric: "Gateway charge rows (payment_transactions)", Value: (data as ReportRow).gatewayChargeCount ?? "" },
        { Metric: "Provider Earnings", Value: fm(data.providerEarnings, currencyCode) },
        { Metric: "Provider Net Activity", Value: fm(data.providerNetActivity ?? data.netAmount, currencyCode) },
        { Metric: "Refunded Amount", Value: fm(data.refundedAmount, currencyCode) },
        { Metric: "Refund Rate", Value: `${Number(data.refundRate ?? 0).toFixed(1)}%` },
        ...((data.paymentsByMethod as ReportRow[]) || []).map((p) => ({
          Method: p.method,
          Count: p.count,
          Amount: fm(((p.amount as number) || 0), currencyCode),
        })),
      ];

    case "new-clients":
      return [
        { Metric: "Total New Clients", Value: data.totalNewClients || 0 },
        { Metric: "Return Rate", Value: `${Number(data.returnRate ?? 0).toFixed(1)}%` },
        ...((data.newClients as ReportRow[]) || []).map((c) => ({
          "Client Name": c.clientName,
          "First Visit": c.firstVisit,
          "Total Spent": fm(((c.totalSpent as number) || 0), currencyCode),
          Returned: c.hasReturned ? "Yes" : "No",
        })),
      ];

    case "client-retention":
      return [
        { Metric: "Distinct clients", Value: data.totalClients ?? "" },
        { Metric: "Single-visit clients", Value: data.newClients ?? "" },
        { Metric: "Repeat clients (2+ visits)", Value: data.returningClients ?? "" },
        { Metric: "Repeat share %", Value: `${Number(data.overallRetentionRate ?? 0).toFixed(1)}%` },
        { Metric: "Avg visits / client", Value: Number((data as ReportRow).averageVisitsPerClient ?? 0).toFixed(2) },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: "Basis", Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "Summary (one line)", Value: data.reportBasis }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(((data.retentionByPeriod as ReportRow[]) || (data.periods as ReportRow[]) || []) as ReportRow[]).map(
          (p) => ({
            Period: p.period,
            "Retention vs prior %": `${((p.retentionRate as number) ?? (p.retention_rate as number) ?? 0).toFixed(1)}%`,
            "Clients in bucket": (p.clients as number) ?? (p.clientCount as number) ?? 0,
            "Prior bucket clients": (p.clientsInPriorPeriod as number) ?? "",
            "Returned from prior": (p.returnedFromPriorPeriod as number) ?? "",
          }),
        ),
      ];

    case "lifetime-value":
      return [
        { Metric: "Total Clients", Value: data.totalClients || 0 },
        { Metric: "Average LTV", Value: fm(data.averageLTV, currencyCode) },
        ...((data.topClients as ReportRow[]) || (data.clientLTV as ReportRow[]) || []).slice(0, 50).map((c) => ({
          Client: c.clientName ?? c.customerId,
          "Total Spent": fm(((c.totalSpent as number) || 0), currencyCode),
          Bookings: c.totalBookings || 0,
        })),
      ];

    case "package-usage":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "Basis", Value: data.reportBasis }]
          : []),
        { Metric: "Usage events", Value: data.totalPackagesUsed || 0 },
        { Metric: "Distinct clients (deduped)", Value: data.totalUniqueClients || 0 },
        ...((data.packageUsage as ReportRow[]) || []).map((p) => ({
          Package: p.packageName ?? p.name,
          "Usage events": p.totalUsage || 0,
          "Distinct clients": p.uniqueClientsCount || 0,
          "Avg events / client": Number(p.averageUsagePerClient ?? 0).toFixed(2),
        })),
        ...((data.topClients as ReportRow[]) || []).map((c) => ({
          "Top client": c.clientName ?? c.customerId,
          Email: c.email ?? "",
          "Package-included bookings": c.packagesUsed || 0,
        })),
      ];

    case "package-sales":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: "Basis", Value: data.reportBasis }]
          : []),
        { Metric: "Bookings in window", Value: data.totalPackagesSold || 0 },
        { Metric: "Booked package value", Value: fm(data.totalRevenue, currencyCode) },
        {
          Metric: "Avg booked value / booking",
          Value: fm(data.averagePackageValue ?? 0, currencyCode),
        },
        ...((data.packageSales as ReportRow[]) || []).map((p) => ({
          Package: p.packageName ?? p.name,
          Bookings: p.bookings || 0,
          "Booked value": fm(((p.revenue as number) || 0), currencyCode),
          "Avg / booking": fm(((p.averageValue as number) || 0), currencyCode),
        })),
      ];

    case "payouts":
      return [
        ...(typeof (data as ReportRow).timezone === "string"
          ? [{ Metric: "Timezone", Value: String((data as ReportRow).timezone) }]
          : []),
        ...(typeof (data as ReportRow).fromYmd === "string" && typeof (data as ReportRow).toYmd === "string"
          ? [{ Metric: "Ledger window", Value: `${(data as ReportRow).fromYmd} → ${(data as ReportRow).toYmd}` }]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: "Basis", Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: "Ledger rows", Value: data.totalPayouts || 0 },
        { Metric: "Net provider earnings", Value: fm((data.totalPayoutAmount || 0), currencyCode) },
        {
          Metric: "Gross booked (linked rows)",
          Value: fm(data.totalBookedAmount ?? (data as ReportRow).bookedAmount ?? data.totalGrossAmount, currencyCode),
        },
        {
          Metric: "Booked net of refunds",
          Value: fm(
            (data as ReportRow).totalBookedNetOfRefunds ?? (data as ReportRow).bookedNetOfRefunds ?? 0,
            currencyCode,
          ),
        },
        { Metric: "Platform & service fees", Value: fm(data.totalPlatformFees, currencyCode) },
        { Metric: "Refunds (ledger)", Value: fm(data.totalRefunded, currencyCode) },
        { Metric: "Avg per row", Value: fm(data.averagePayout, currencyCode) },
        {
          Metric: "Fees % of gross booked",
          Value: `${Number((data as ReportRow).platformFeeRate ?? 0).toFixed(2)}%`,
        },
        ...((data.monthlyBreakdown as ReportRow[]) || []).map((m) => ({
          Month: m.month,
          "Rows with earnings": m.count || 0,
          "Ledger amount": fm(((m.amount as number) || 0), currencyCode),
        })),
        ...((data.recentPayouts as ReportRow[]) || []).map((p) => ({
          Reference: (p.referenceLabel as string) || "",
          "Settlement at": (p.ledgerSettlementAt as string) || p.createdAt,
          "Booked Amount": fm(((p.bookedAmount as number) ?? (p.grossAmount as number) ?? 0), currencyCode),
          "Booked Net of Refunds": fm(((p.bookedNetOfRefunds as number) ?? (p.netAmount as number) ?? 0), currencyCode),
          "Platform Fee": fm(((p.platformFee as number) ?? 0), currencyCode),
          "Net earnings": fm(((p.payoutAmount as number) ?? (p.amount as number) ?? 0), currencyCode),
        })),
      ];

    case "top-products":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: "Timezone", Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: "Period (calendar)", Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.limit === "number" ? [{ Metric: "Rank list limit", Value: data.limit }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: "What this report counts", Value: String(data.reportBasis) }]
          : []),
        { Metric: "Units sold (all SKUs in window)", Value: data.totalProductsSold || 0 },
        { Metric: "Line revenue (all SKUs in window)", Value: fm(data.totalRevenue, currencyCode) },
        ...((data.topProducts as ReportRow[]) || []).map((p, idx) => ({
          "#": idx + 1,
          Product: p.productName ?? p.name,
          Category: (p.category as string) ?? "",
          Units: p.totalQuantity ?? p.quantitySold ?? 0,
          "Avg / unit": fm(Number((p as ReportRow).averagePrice ?? 0), currencyCode),
          "Line rows": (p.timesSold as number) ?? "",
          Revenue: fm(((p.totalRevenue as number) ?? (p.revenue as number) ?? 0), currencyCode),
        })),
      ];

    case "payment-methods":
      return [
        ...(typeof (data as ReportRow).timezone === "string"
          ? [{ Metric: "Timezone", Value: String((data as ReportRow).timezone) }]
          : []),
        ...(typeof (data as ReportRow).fromYmd === "string" && typeof (data as ReportRow).toYmd === "string"
          ? [{ Metric: "Date range (provider TZ)", Value: `${(data as ReportRow).fromYmd} → ${(data as ReportRow).toYmd}` }]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: "Basis", Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: "Total line items", Value: (data as ReportRow).totalLineItems ?? (data as ReportRow).totalPayments ?? 0 },
        { Metric: "Total amount", Value: fm(Number((data as ReportRow).totalAmount ?? 0), currencyCode) },
        ...(() => {
          const d = (data as ReportRow).diagnostics as
            | { failedCaptureAttemptsInRange?: number; failedCaptureAttemptsAttributed?: number }
            | undefined;
          if (!d) return [] as Array<{ Metric: string; Value: string | number }>;
          const rows: Array<{ Metric: string; Value: string | number }> = [];
          if (typeof d.failedCaptureAttemptsInRange === "number") {
            rows.push({ Metric: "Failed captures in window (all)", Value: d.failedCaptureAttemptsInRange });
          }
          if (typeof d.failedCaptureAttemptsAttributed === "number") {
            rows.push({ Metric: "Failed captures linked to bookings here", Value: d.failedCaptureAttemptsAttributed });
          }
          return rows;
        })(),
        ...((data.methods as ReportRow[]) || []).map((m) => ({
          Method: (m.label as string) || (m.method as string),
          Key: m.method,
          "Line items": m.totalCount || 0,
          "Total amount": fm((m.totalAmount || 0), currencyCode),
          "Gateway rows": m.paymentTransactionCount ?? "",
          "Gateway amount": m.paymentTransactionAmount != null ? fm(Number(m.paymentTransactionAmount), currencyCode) : "",
          "Till / manual rows": m.bookingPaymentCount ?? "",
          "Till / manual amount": m.bookingPaymentAmount != null ? fm(Number(m.bookingPaymentAmount), currencyCode) : "",
          "Wallet split rows": m.walletBookingAdjustmentCount ?? "",
          "Wallet split amount":
            m.walletBookingAdjustmentAmount != null ? fm(Number(m.walletBookingAdjustmentAmount), currencyCode) : "",
          Share: `${Number(m.percentage ?? 0).toFixed(2)}%`,
        })),
      ];

    case "refunds": {
      const d = data as ReportRow;
      return [
        ...(typeof d.timezone === "string" ? [{ Metric: "Timezone", Value: d.timezone }] : []),
        ...(typeof d.reportBasis === "string" && String(d.reportBasis).trim()
          ? [{ Metric: "Basis", Value: d.reportBasis }]
          : []),
        { Metric: "Refund ledger rows", Value: d.totalRefunds || 0 },
        { Metric: "Customer refund gross", Value: fm((d.totalRefundAmount as number) || 0, currencyCode) },
        { Metric: "Provider earnings reversal", Value: fm((d.providerEarningsReversed as number) || 0, currencyCode) },
        {
          Metric: "Payment ledger in window (ratio denominator)",
          Value: fm(
            ((d.totalPaymentLedgerAmount as number) ?? (d.totalPaymentAmount as number)) || 0,
            currencyCode,
          ),
        },
        {
          Metric: "Refund share of payment ledger %",
          Value: `${Number(d.refundShareOfPaymentLedgerPercent ?? d.refundRate ?? 0).toFixed(2)}%`,
        },
        ...((d.methodBreakdown as ReportRow[]) || (d.refunds as ReportRow[]) || []).map((r) => ({
          Method: r.method,
          Count: r.count || 0,
          Amount: fm(((r.amount as number) || 0), currencyCode),
        })),
      ];
    }

    case "paystack-terminal-reconciliation": {
      const d = data as ReportRow;
      const totals = (d.totals as Record<string, number>) || {};
      return [
        ...(typeof d.fromYmd === "string" && typeof d.toYmd === "string"
          ? [{ Metric: "Capture window", Value: `${d.fromYmd} → ${d.toYmd}` }]
          : []),
        { Metric: "Rows returned", Value: d.count ?? (d.rows as ReportRow[])?.length ?? 0 },
        { Metric: "Received", Value: fm(Number(totals.received ?? 0), currencyCode) },
        { Metric: "Allocated", Value: fm(Number(totals.allocated ?? 0), currencyCode) },
        { Metric: "Unallocated", Value: fm(Number(totals.unallocated ?? 0), currencyCode) },
        { Metric: "Held", Value: fm(Number(totals.held ?? 0), currencyCode) },
        { Metric: "Eligible", Value: fm(Number(totals.eligible ?? 0), currencyCode) },
        { Metric: "Declined", Value: fm(Number(totals.declined ?? 0), currencyCode) },
        ...((d.rows as ReportRow[]) || []).map((row) => ({
          Reference: row.paystack_reference,
          Amount: fm(Number(row.paid_amount ?? 0), currencyCode),
          Allocation: row.allocation_status,
          "Amount match": row.amount_match_status,
          "Payout eligibility": row.payout_eligibility_status,
          Terminal: (row.terminal as { name?: string })?.name ?? "",
          "Created at": row.created_at,
        })),
      ];
    }

    case "yoco-reconciliation": {
      const summary = data.summary as Record<string, unknown> | undefined;
      const d = data as ReportRow;
      return [
        ...(typeof d.timezone === "string" ? [{ Metric: "Timezone", Value: String(d.timezone) }] : []),
        ...(typeof d.fromYmd === "string" && typeof d.toYmd === "string"
          ? [{ Metric: "Capture window", Value: `${d.fromYmd} → ${d.toYmd}` }]
          : []),
        ...(typeof d.reportBasis === "string" && String(d.reportBasis).trim()
          ? [{ Metric: "Basis", Value: String(d.reportBasis) }]
          : []),
        { Metric: "Row limit", Value: (d.limit as number) ?? "" },
        { Metric: "Rows returned", Value: (summary?.total as number) ?? 0 },
        { Metric: "Booking-linked", Value: (summary?.with_booking as number) ?? 0 },
        { Metric: "Synced (booking_payments)", Value: (summary?.synced as number) ?? 0 },
        { Metric: "Not synced (booking-linked)", Value: (summary?.not_synced as number) ?? 0 },
        { Metric: "Sale-linked only", Value: (summary?.with_sale_only as number) ?? 0 },
        { Metric: "Unlinked", Value: (summary?.unlinked as number) ?? 0 },
        ...((data.payments as ReportRow[]) || []).map((p) => ({
          Date: p.created_at,
          "Yoco ID": p.yoco_payment_id,
          Amount: `${((p.amount as number) / 100).toFixed(2)} ${p.currency}`,
          Status: p.status,
          "Link kind": (p.link_kind as string) ?? "",
          "Booking synced": p.link_kind === "booking" ? (p.booking_synced ? "Yes" : "No") : "—",
        })),
      ];
    }

    case "inventory": {
      const inv = data as ReportRow;
      return [
        ...(typeof inv.reportBasis === "string" && String(inv.reportBasis).trim()
          ? [{ Metric: "Basis", Value: String(inv.reportBasis) }]
          : []),
        ...(typeof inv.timezone === "string" ? [{ Metric: "Timezone", Value: inv.timezone }] : []),
        ...(typeof inv.asOf === "string" ? [{ Metric: "Generated at", Value: inv.asOf }] : []),
        { Metric: "Total products", Value: inv.totalProducts ?? 0 },
        { Metric: "Active products", Value: inv.activeProducts ?? 0 },
        { Metric: "Inactive products", Value: inv.inactiveProducts ?? 0 },
        { Metric: "Products tracking stock", Value: inv.productsTrackingStock ?? 0 },
        { Metric: "Retail stock value", Value: fm(Number(inv.totalStockValue ?? 0), currencyCode) },
        { Metric: "Low stock (count)", Value: inv.lowStockCount ?? 0 },
        { Metric: "Out of stock (count)", Value: inv.outOfStockCount ?? 0 },
        ...((inv.categoryBreakdown as ReportRow[]) || []).map((c) => ({
          Category: (c.category as string) ?? "",
          Products: c.count ?? 0,
          "Stock value": fm(Number(c.stockValue ?? 0), currencyCode),
        })),
        ...((inv.allProducts as ReportRow[]) || []).map((p) => {
          const qty = Number((p.quantity as number) ?? (p.stock_quantity as number) ?? 0);
          const lineRetail =
            typeof p.retail_line_value === "number"
              ? Number(p.retail_line_value)
              : qty * Number((p.price as number) ?? (p.retail_price as number) ?? 0);
          const displayPrice = Number((p.price as number) ?? (p.retail_price as number) ?? 0);
          return {
            Product: p.name ?? p.productName,
            Category: (p.category as string) ?? "",
            Active: p.is_active === false ? "No" : "Yes",
            "Track stock": p.track_stock_quantity === false ? "No" : "Yes",
            Variants: (p.has_variants as boolean) ? "Yes" : "No",
            Stock: qty,
            "Display price": fm(displayPrice, currencyCode),
            "Line retail value": fm(lineRetail, currencyCode),
          };
        }),
      ];
    }

    case "commission":
      return ((data.staffCommissions as ReportRow[]) || (data.commissionData as ReportRow[]) || []).map((s) => ({
        "Staff Name": s.staffName ?? s.name,
        "Total Revenue": fm(((s.totalRevenue as number) || 0), currencyCode),
        "Commission": fm(((s.totalCommission as number) ?? (s.commissionEarned as number) ?? 0), currencyCode),
      }));

    case "staff-hours":
      return ((data.staffHours as ReportRow[]) || (data.hoursData as ReportRow[]) || []).map((s) => ({
        "Staff Name": s.staffName ?? s.name,
        "Total Hours": ((s.totalHours as number) || 0).toFixed(1),
        Bookings: (s.completedBookings as number) ?? (s.totalBookings as number) ?? 0,
      }));

    case "occupancy": {
      const d = data as ReportRow;
      const summary = d.summary as
        | {
            totalAvailableMinutes?: number;
            totalBookedMinutes?: number;
            occupancyPercent?: number | null;
            staffMemberCount?: number;
            dayCount?: number;
          }
        | undefined;
      const pct = (v: unknown) =>
        v === null || v === undefined ? "N/A" : typeof v === "number" ? `${v}%` : String(v);
      const byDate = (data.byDate as ReportRow[]) || [];
      const byStaff = (data.byStaff as ReportRow[]) || [];
      return [
        ...(summary
          ? [
              { Metric: "Period total available (min)", Value: summary.totalAvailableMinutes ?? "" },
              { Metric: "Period total booked (min)", Value: summary.totalBookedMinutes ?? "" },
              { Metric: "Period occupancy %", Value: pct(summary.occupancyPercent) },
              { Metric: "Staff in scope", Value: summary.staffMemberCount ?? "" },
              { Metric: "Days in range", Value: summary.dayCount ?? "" },
            ]
          : []),
        ...(typeof d.basisNote === "string" && d.basisNote.trim()
          ? [{ Metric: "Basis", Value: d.basisNote }]
          : []),
        ...(typeof d.reportBasis === "string" && d.reportBasis.trim()
          ? [{ Metric: "Summary (one line)", Value: d.reportBasis }]
          : []),
        ...(Array.isArray(d.includedBookingStatuses) && d.includedBookingStatuses.length
          ? [{ Metric: "Booking statuses", Value: (d.includedBookingStatuses as string[]).join(", ") }]
          : []),
        ...(typeof d.timezone === "string" ? [{ Metric: "Timezone", Value: d.timezone }] : []),
        ...byDate.map((row) => ({
          View: "by_date",
          "Staff name": "",
          Date: row.date,
          "Available (min)": row.totalAvailable,
          "Booked (min)": row.totalBooked,
          "Occupancy %": pct(row.occupancyPercent),
        })),
        ...byStaff.flatMap((staff) => {
          const s = staff as ReportRow;
          return ((s.byDate as ReportRow[]) || []).map((row) => ({
            View: "by_staff",
            "Staff name": s.staffName,
            Date: row.date,
            "Available (min)": row.availableMinutes,
            "Booked (min)": row.bookedMinutes,
            "Occupancy %": pct(row.occupancyPercent),
          }));
        }),
      ];
    }

    case "end-of-day": {
      const d = data as ReportRow;
      const byM = (d.byPaymentMethod as Record<string, number> | undefined) || {};
      return [
        { Field: "Date", Value: String(d.date ?? "") },
        ...(typeof (d as ReportRow).timezone === "string"
          ? [{ Field: "Timezone", Value: (d as ReportRow).timezone }]
          : []),
        ...(typeof (d as ReportRow).reportBasis === "string" && String((d as ReportRow).reportBasis).trim()
          ? [{ Field: "Basis", Value: (d as ReportRow).reportBasis }]
          : []),
        { Field: "Booking count", Value: d.bookingCount },
        { Field: "Total", Value: fm((d.total as number) || 0, currencyCode) },
        { Field: "Booking payments total", Value: fm((d.bookingPaymentsTotal as number) || 0, currencyCode) },
        { Field: "Wallet total (split-safe)", Value: fm((d.walletTotal as number) || 0, currencyCode) },
        { Field: "Sales total", Value: fm((d.salesTotal as number) || 0, currencyCode) },
        { Field: "Tips total", Value: fm((d.tipsTotal as number) || 0, currencyCode) },
        {
          Field: "Cashback total (till cash-out, not in recorded total)",
          Value: fm((d.cashbackTotal as number) || 0, currencyCode),
        },
        { Field: "Cancellation fees", Value: fm((d.cancellationFeesTotal as number) || 0, currencyCode) },
        { Field: "Note", Value: String(d.note ?? "") },
        ...Object.keys(byM).map((k) => ({
          Field: `Payment: ${k}`,
          Value: fm((byM[k] as number) || 0, currencyCode),
        })),
      ];
    }

    default:
      if (Array.isArray(data)) {
        return data as Record<string, unknown>[];
      }
      const arrayKeys = Object.keys(data).filter((key) => Array.isArray(data[key]));
      if (arrayKeys.length > 0) {
        return (data[arrayKeys[0]] as Record<string, unknown>[]) ?? [];
      }
      return [data];
  }
}
