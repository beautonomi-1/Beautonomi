/**
 * Utility functions for exporting report data to CSV and PDF
 */

import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { i18n } from "@beautonomi/i18n";
import { toast } from "sonner";

const EXPORT_NS = "web.provider.reports.export";

function exportT(key: string, params?: Record<string, string | number>): string {
  const full = `${EXPORT_NS}.${key}`;
  const result = i18n.t(full, params as Record<string, string>);
  return result === full ? key : result;
}

function exportMetric(label: string, params?: Record<string, string | number>): string {
  const slug = ({"Active products":"activeProducts","Allocated":"allocated","Appointment ledger revenue":"appointmentLedgerRevenue","Appointments with ledger activity":"appointmentsWithLedgerActivity","Average Booking Value":"averageBookingValue","Average LTV":"averageLtv","Avg booked value / booking":"avgBookedValueBooking","Avg bookings per client":"avgBookingsPerClient","Avg ledger / booking (with earnings)":"avgLedgerBookingWithEarnings","Avg ledger / scheduled booking · current":"avgLedgerScheduledBookingCurrent","Avg ledger / scheduled booking · previous":"avgLedgerScheduledBookingPrevious","Avg ledger per appointment (with activity)":"avgLedgerPerAppointmentWithActivity","Avg ledger per bucket":"avgLedgerPerBucket","Avg per redemption row":"avgPerRedemptionRow","Avg per row":"avgPerRow","Avg rating (weighted)":"avgRatingWeighted","Avg revenue per unit sold":"avgRevenuePerUnitSold","Avg spend per client (window)":"avgSpendPerClientWindow","Avg visits / client":"avgVisitsClient","Basis":"basis","Basis (counts & ledger)":"basisCountsLedger","Basis (summary)":"basisSummary","Booked net of refunds":"bookedNetOfRefunds","Booked package value":"bookedPackageValue","Booking count":"bookingCount","Booking payments total":"bookingPaymentsTotal","Booking statuses":"bookingStatuses","Booking-linked":"bookingLinked","Bookings (excl. pending)":"bookingsExclPending","Bookings in window":"bookingsInWindow","Calendar window":"calendarWindow","Cancellation Rate":"cancellationRate","Cancellation fees":"cancellationFees","Cancellation fees (net)":"cancellationFeesNet","Cancellation rate":"cancellationRate2","Capture window":"captureWindow","Cashback total (till cash-out, not in recorded total)":"cashbackTotalTillCashOutNotInRecordedTotal","Completed appointments (unique)":"completedAppointmentsUnique","Completed · today":"completedToday","Completion Rate":"completionRate","Completion rate":"completionRate2","Current window (YMD)":"currentWindowYmd","Customer Funds Settled (deduped)":"customerFundsSettledDeduped","Customer Payments by Method Total":"customerPaymentsByMethodTotal","Customer refund gross":"customerRefundGross","Date":"date","Date range (provider TZ)":"dateRangeProviderTz","Days in range":"daysInRange","Declined":"declined","Distinct clients":"distinctClients","Distinct clients (deduped)":"distinctClientsDeduped","Distinct clients · current":"distinctClientsCurrent","Distinct clients · month":"distinctClientsMonth","Distinct clients · previous":"distinctClientsPrevious","Distinct offerings":"distinctOfferings","Eligible":"eligible","Failed captures in window (all)":"failedCapturesInWindowAll","Failed captures linked to bookings here":"failedCapturesLinkedToBookingsHere","Fees % of gross booked":"feesOfGrossBooked","Gateway charge rows (payment_transactions)":"gatewayChargeRowsPaymentTransactions","Generated at":"generatedAt","Granularity":"granularity","Gross Booked Value":"grossBookedValue","Gross booked (linked rows)":"grossBookedLinkedRows","Growth · avg ledger / booking %":"growthAvgLedgerBooking","Growth · bookings %":"growthBookings","Growth · clients %":"growthClients","Growth · ledger headline %":"growthLedgerHeadline","Held":"held","Inactive products":"inactiveProducts","Ledger earnings (provider_earnings)":"ledgerEarningsProviderEarnings","Ledger earnings · current":"ledgerEarningsCurrent","Ledger earnings · month":"ledgerEarningsMonth","Ledger earnings · previous":"ledgerEarningsPrevious","Ledger earnings · today":"ledgerEarningsToday","Ledger earnings · week":"ledgerEarningsWeek","Ledger from bookings":"ledgerFromBookings","Ledger from bookings · current":"ledgerFromBookingsCurrent","Ledger from bookings · month":"ledgerFromBookingsMonth","Ledger from bookings · previous":"ledgerFromBookingsPrevious","Ledger from bookings · today":"ledgerFromBookingsToday","Ledger from bookings · week":"ledgerFromBookingsWeek","Ledger from product orders":"ledgerFromProductOrders","Ledger from product orders · current":"ledgerFromProductOrdersCurrent","Ledger from product orders · month":"ledgerFromProductOrdersMonth","Ledger from product orders · previous":"ledgerFromProductOrdersPrevious","Ledger from product orders · today":"ledgerFromProductOrdersToday","Ledger from product orders · week":"ledgerFromProductOrdersWeek","Ledger growth vs prior window":"ledgerGrowthVsPriorWindow","Ledger net (in window)":"ledgerNetInWindow","Ledger net (sum of buckets)":"ledgerNetSumOfBuckets","Ledger net (sum)":"ledgerNetSum","Ledger net allocated (total)":"ledgerNetAllocatedTotal","Ledger rows":"ledgerRows","Ledger transaction types":"ledgerTransactionTypes","Ledger window":"ledgerWindow","Line revenue (all SKUs in window)":"lineRevenueAllSkusInWindow","Lost Revenue":"lostRevenue","Low stock (count)":"lowStockCount","Month window (YMD)":"monthWindowYmd","Net after refunds & cancellation fees":"netAfterRefundsCancellationFees","Net provider earnings":"netProviderEarnings","New Clients (first-ever in scope in window)":"newClientsFirstEverInScopeInWindow","No-Show Rate":"noShowRate","No-show rate":"noShowRate2","Not synced (booking-linked)":"notSyncedBookingLinked","Note":"note","Out of stock (count)":"outOfStockCount","Payment ledger in window (ratio denominator)":"paymentLedgerInWindowRatioDenominator","Payments succeeded / total":"paymentsSucceededTotal","Period (calendar)":"periodCalendar","Period occupancy %":"periodOccupancy","Period total available (min)":"periodTotalAvailableMin","Period total booked (min)":"periodTotalBookedMin","Platform & service fees":"platformServiceFees","Previous window (YMD)":"previousWindowYmd","Products tracking stock":"productsTrackingStock","Provider Earnings":"providerEarnings","Provider Net Activity":"providerNetActivity","Provider earnings reversal":"providerEarningsReversal","Rank list limit":"rankListLimit","Received":"received","Recorded takings total (logged in-app)":"recordedTakingsTotalLoggedInApp","Recorded — booking payments":"recordedBookingPayments","Recorded — cancellation fees":"recordedCancellationFees","Recorded — retail & legacy sales":"recordedRetailLegacySales","Recorded — tips (ledger date)":"recordedTipsLedgerDate","Recorded — wallet on bookings":"recordedWalletOnBookings","Redeemed value":"redeemedValue","Redeemed value (sum of amounts)":"redeemedValueSumOfAmounts","Redemption rows":"redemptionRows","Refund Rate":"refundRate","Refund ledger rows":"refundLedgerRows","Refund share of payment ledger %":"refundShareOfPaymentLedger","Refunded Amount":"refundedAmount","Refunds (ledger)":"refundsLedger","Repeat clients (2+ visits)":"repeatClients2Visits","Repeat share %":"repeatShare","Retail ledger revenue":"retailLedgerRevenue","Retail stock value":"retailStockValue","Retention %":"retention","Return Rate":"returnRate","Returning (2+ bookings in window)":"returning2BookingsInWindow","Revenue from appointment add-ons":"revenueFromAppointmentAddOns","Revenue from paid retail orders":"revenueFromPaidRetailOrders","Row limit":"rowLimit","Rows returned":"rowsReturned","Sale-linked only":"saleLinkedOnly","Sales total":"salesTotal","Scheduled appointments (all statuses)":"scheduledAppointmentsAllStatuses","Scheduled bookings (all statuses)":"scheduledBookingsAllStatuses","Scheduled bookings · current":"scheduledBookingsCurrent","Scheduled bookings · month":"scheduledBookingsMonth","Scheduled bookings · previous":"scheduledBookingsPrevious","Scheduled bookings · today":"scheduledBookingsToday","Scheduled bookings · week":"scheduledBookingsWeek","Scheduled visits (sum)":"scheduledVisitsSum","Single-visit clients":"singleVisitClients","Staff in scope":"staffInScope","Staff profiles (provider-wide)":"staffProfilesProviderWide","Summary (one line)":"summaryOneLine","Synced (booking_payments)":"syncedBookingPayments","Timezone":"timezone","Tips (ledger)":"tipsLedger","Tips total":"tipsTotal","Today window (YMD)":"todayWindowYmd","Total":"total","Total Bookings":"totalBookings","Total Bookings (denominator)":"totalBookingsDenominator","Total Cancelled":"totalCancelled","Total Clients":"totalClients","Total Clients (distinct in window)":"totalClientsDistinctInWindow","Total Cost (supply_price × qty)":"totalCostSupplyPriceQty","Total New Clients":"totalNewClients","Total No-Shows":"totalNoShows","Total Profit":"totalProfit","Total Revenue":"totalRevenue","Total amount":"totalAmount","Total line items":"totalLineItems","Total products":"totalProducts","Total revenue (ledger net)":"totalRevenueLedgerNet","Total units sold":"totalUnitsSold","Unallocated":"unallocated","Unique appointments (summary)":"uniqueAppointmentsSummary","Units from appointment add-ons (booking_products)":"unitsFromAppointmentAddOnsBookingProducts","Units from paid retail orders":"unitsFromPaidRetailOrders","Units sold (all SKUs in window)":"unitsSoldAllSkusInWindow","Unlinked":"unlinked","Usage events":"usageEvents","Wallet total (split-safe)":"walletTotalSplitSafe","Week window (YMD)":"weekWindowYmd","What this report counts":"whatThisReportCounts","Window":"window","Δ revenue vs prior bucket":"revenueVsPriorBucket","Δ visits vs prior bucket":"visitsVsPriorBucket"} as Record<string, string>)[label];
  if (slug) return exportT(`metrics.${slug}`, params);
  if (label.startsWith("Recorded takings — ")) {
    return exportT("dynamic.recordedTakingsMethod", { method: label.slice("Recorded takings — ".length) });
  }
  if (label.startsWith("Payment: ")) {
    return exportT("dynamic.paymentField", { method: label.slice("Payment: ".length) });
  }
  return label;
}

function exportColumnHeaderFromKey(key: string): string {
  const colSlug = ({"#":"unknown","Amount match":"amountMatch","Appointments (staff)":"appointmentsStaff","Available (min)":"availableMin","Average rating":"averageRating","Avg / booking":"avgBooking","Avg / unit":"avgUnit","Avg events / client":"avgEventsClient","Avg ledger per visit":"avgLedgerPerVisit","Booked (min)":"bookedMin","Booked Amount":"bookedAmount","Booked Net of Refunds":"bookedNetOfRefunds2","Booked total (snapshot)":"bookedTotalSnapshot","Booked value":"bookedValue","Booking synced":"bookingSynced","Captured at":"capturedAt","Client Name":"clientName","Clients in bucket":"clientsInBucket","Commission":"commission","Created at":"createdAt","Daily bucket":"dailyBucket","Display price":"displayPrice","Distinct clients":"distinctClients2","First Visit":"firstVisit","Gateway amount":"gatewayAmount","Gateway rows":"gatewayRows","Hours worked":"hoursWorked","Last Visit":"lastVisit","Ledger amount":"ledgerAmount","Ledger net":"ledgerNet","Line items":"lineItems","Line retail value":"lineRetailValue","Line rows":"lineRows","Link kind":"linkKind","Net earnings":"netEarnings","Occupancy %":"occupancy","Package-included bookings":"packageIncludedBookings","Payout eligibility":"payoutEligibility","Pct of rows":"pctOfRows","Platform Fee":"platformFee","Prior bucket clients":"priorBucketClients","Quantity Sold":"quantitySold","Recent at":"recentAt","Retention vs prior %":"retentionVsPrior","Returned from prior":"returnedFromPrior","Rows with earnings":"rowsWithEarnings","Scheduled bookings that day":"scheduledBookingsThatDay","Settlement at":"settlementAt","Staff Name":"staffName","Staff name":"staffName2","Stock value":"stockValue","Till / manual amount":"tillManualAmount","Till / manual rows":"tillManualRows","Top client":"topClient","Total Bookings":"totalBookings2","Total Hours":"totalHours","Total Revenue":"totalRevenue2","Total Spent":"totalSpent","Total amount":"totalAmount2","Track stock":"trackStock","Upcoming at":"upcomingAt","Usage events":"usageEvents2","Wallet split amount":"walletSplitAmount","Wallet split rows":"walletSplitRows","Yoco ID":"yocoId"} as Record<string, string>)[key];
  if (colSlug) return exportT(`columns.${colSlug}`);
  const headerSlug = ({
    totalBookings: "totalBookings",
    totalRevenue: "totalRevenue",
    serviceName: "serviceName",
    staffName: "staffName",
    clientName: "clientName",
    created_at: "created_at",
    paystack_reference: "paystack_reference",
    paid_amount: "paid_amount",
    allocation_status: "allocation_status",
    amount_match_status: "amount_match_status",
    payout_eligibility_status: "payout_eligibility_status",
  } as Record<string, string>)[key];
  if (headerSlug) return exportT(`headers.${headerSlug}`);
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}


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
  return exportColumnHeaderFromKey(key);
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
    toast.error(exportT("toast.noData"));
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
  toast.success(exportT("toast.csvDownloaded"));
}

/**
 * Export report to PDF using browser print functionality
 * Can export either from a report element ID or from data array
 */
export function exportToPDF(reportIdOrData: string | unknown[], filename?: string, title?: string) {
  const resolvedTitle = title ?? exportT("toast.defaultReportTitle");
  const toastId = toast.loading(exportT("toast.preparingPdf"));
  const finish = (ok: boolean, message?: string) => {
    toast.dismiss(toastId);
    if (!ok && message) toast.error(message);
  };

  // If first parameter is a string, it's a report ID - export the HTML element
  if (typeof reportIdOrData === "string") {
    const reportElement = document.getElementById(reportIdOrData);
    if (!reportElement) {
      finish(false, exportT("toast.reportElementNotFound"));
      return;
    }

    // Clone the element to avoid modifying the original
    const clonedElement = reportElement.cloneNode(true) as HTMLElement;
    
    // Create HTML document
    const safeTitle = escapeHtml(resolvedTitle);
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
              text-align: start;
              font-size: 12px;
              color: #111;
              background: #fff;
            }
            #reportRoot img { max-width: 100% !important; }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <p>${escapeHtml(exportT("toast.generatedAt", { date: new Date().toLocaleString() }))}</p>
          <div id="reportRoot">${clonedElement.outerHTML}</div>
          <div class="footer">
            <p>${i18n.t("web.provider.reports.common.generatedByBeautonomi")}</p>
          </div>
        </body>
      </html>
    `;

    // Open in new window and print
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      finish(false, exportT("toast.allowPopups"));
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
    finish(false, exportT("toast.noData"));
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
        <title>${resolvedTitle}</title>
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
            text-align: start;
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
        <h1>${escapeHtml(resolvedTitle)}</h1>
        <p>${escapeHtml(exportT("toast.generatedAt", { date: new Date().toLocaleString() }))}</p>
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <div class="footer">
          <p>${i18n.t("web.provider.reports.common.generatedByBeautonomi")}</p>
        </div>
      </body>
    </html>
  `;

  // Open in new window and print
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    finish(false, exportT("toast.allowPopups"));
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
        { Metric: exportMetric("Total Bookings"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Total Revenue"), Value: fm((data.totalRevenue as number), currencyCode) },
        { Metric: exportMetric("Average Booking Value"), Value: fm((data.averageBookingValue as number), currencyCode) },
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
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis (summary)"), Value: data.reportBasis }]
          : []),
        ...(windows?.today?.fromYmd && windows?.today?.toYmd
          ? [{ Metric: exportMetric("Today window (YMD)"), Value: `${windows.today.fromYmd} → ${windows.today.toYmd}` }]
          : []),
        ...(windows?.week?.fromYmd && windows?.week?.toYmd
          ? [{ Metric: exportMetric("Week window (YMD)"), Value: `${windows.week.fromYmd} → ${windows.week.toYmd}` }]
          : []),
        ...(windows?.month?.fromYmd && windows?.month?.toYmd
          ? [{ Metric: exportMetric("Month window (YMD)"), Value: `${windows.month.fromYmd} → ${windows.month.toYmd}` }]
          : []),
        { Metric: exportMetric("Ledger earnings · today"), Value: fm(Number(today.revenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings · today"),
          Value: fm(Number(today.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders · today"),
          Value: fm(Number(today.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Scheduled bookings · today"), Value: Number(today.bookings ?? 0) },
        { Metric: exportMetric("Completed · today"), Value: Number(today.completed ?? 0) },
        { Metric: exportMetric("Ledger earnings · week"), Value: fm(Number(week.revenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings · week"),
          Value: fm(Number(week.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders · week"),
          Value: fm(Number(week.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Scheduled bookings · week"), Value: Number(week.bookings ?? 0) },
        { Metric: exportMetric("Ledger earnings · month"), Value: fm(Number(month.revenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings · month"),
          Value: fm(Number(month.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders · month"),
          Value: fm(Number(month.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Scheduled bookings · month"), Value: Number(month.bookings ?? 0) },
        { Metric: exportMetric("Distinct clients · month"), Value: Number(month.clients ?? 0) },
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
                Metric: exportMetric(`Recorded takings — ${method}`),
                Value: fm(Number(amt), currencyCode),
              }))
          : [];
      return [
        { Metric: exportMetric("Total revenue (ledger net)"), Value: fm(data.totalRevenue, currencyCode) },
        { Metric: exportMetric("Appointment ledger revenue"), Value: fm(Number(data.appointmentLedgerRevenue ?? data.totalRevenue ?? 0), currencyCode) },
        { Metric: exportMetric("Retail ledger revenue"), Value: fm(Number(data.retailLedgerRevenue ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded takings total (logged in-app)"), Value: fm(Number(rt?.total ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded — booking payments"), Value: fm(Number(rt?.bookingPaymentsTotal ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded — wallet on bookings"), Value: fm(Number(rt?.walletTotal ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded — retail & legacy sales"), Value: fm(Number(rt?.retailAndLegacySalesTotal ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded — tips (ledger date)"), Value: fm(Number(rt?.tipsTotal ?? 0), currencyCode) },
        { Metric: exportMetric("Recorded — cancellation fees"), Value: fm(Number(rt?.cancellationFeesTotal ?? 0), currencyCode) },
        ...methodRows,
        { Metric: exportMetric("Scheduled appointments (all statuses)"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Appointments with ledger activity"), Value: Number(data.bookingsWithLedgerActivity ?? 0) },
        { Metric: exportMetric("Avg ledger per appointment (with activity)"), Value: fm(data.averageBookingValue, currencyCode) },
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
              { Metric: exportMetric("Unique appointments (summary)"), Value: Number(sum.uniqueAppointments ?? sum.totalBookings ?? 0) },
              { Metric: exportMetric("Ledger net (sum)"), Value: fm(Number(sum.totalRevenue ?? 0), currencyCode) },
              { Metric: exportMetric("Avg rating (weighted)"), Value: Number(sum.averageRating ?? 0).toFixed(2) },
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
        { Metric: exportMetric("Total Clients (distinct in window)"), Value: data.totalClients || 0 },
        { Metric: exportMetric("New Clients (first-ever in scope in window)"), Value: data.newClients || 0 },
        { Metric: exportMetric("Returning (2+ bookings in window)"), Value: data.returningClients || 0 },
        { Metric: exportMetric("Avg spend per client (window)"), Value: fm(Number(data.averageLifetimeValue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Avg bookings per client"),
          Value: Number(cs.averageBookingsPerClient ?? 0).toFixed(2),
        },
        {
          Metric: exportMetric("Retention %"),
          Value: `${Number(cs.clientRetention?.retentionRate ?? 0).toFixed(1)}%`,
        },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: exportMetric("Basis"), Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("Summary (one line)"), Value: data.reportBasis }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
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
        { Metric: exportMetric("Total Bookings"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Completion Rate"), Value: `${Number(data.completionRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Cancellation Rate"), Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("No-Show Rate"), Value: `${Number(data.noShowRate ?? 0).toFixed(1)}%` },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: exportMetric("Basis (counts & ledger)"), Value: data.basisNote }]
          : []),
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: exportMetric("Ledger transaction types"), Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
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
        { Metric: exportMetric("Distinct offerings"), Value: data.totalServices || 0 },
        { Metric: exportMetric("Completed appointments (unique)"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Ledger net allocated (total)"), Value: fm(data.totalRevenue, currencyCode) },
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: exportMetric("Ledger transaction types"), Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
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
        { Metric: exportMetric("Granularity"), Value: data.period || "" },
        ...(data.dateRange && typeof data.dateRange === "object"
          ? [
              {
                Metric: exportMetric("Window"),
                Value: `${(data.dateRange as { fromYmd?: string }).fromYmd ?? ""} → ${(data.dateRange as { toYmd?: string }).toYmd ?? ""}`,
              },
              ...((data.dateRange as { timezone?: string }).timezone
                ? [{ Metric: exportMetric("Timezone"), Value: String((data.dateRange as { timezone: string }).timezone) }]
                : []),
            ]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: exportMetric("Basis (summary)"), Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: exportMetric("Ledger net (sum of buckets)"), Value: fm(data.totalRevenue, currencyCode) },
        { Metric: exportMetric("Scheduled visits (sum)"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Avg ledger per bucket"), Value: fm(Number(data.averageRevenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Δ revenue vs prior bucket"),
          Value: `${Number(data.revenueGrowth ?? 0).toFixed(1)}%`,
        },
        {
          Metric: exportMetric("Δ visits vs prior bucket"),
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
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Calendar window"), Value: `${data.fromYmd} → ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis (summary)"), Value: data.reportBasis }]
          : []),
        { Metric: exportMetric("Ledger earnings (provider_earnings)"), Value: fm(data.totalRevenue, currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings"),
          Value: fm(Number((data as ReportRow).ledgerEarningsFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders"),
          Value: fm(Number((data as ReportRow).ledgerEarningsFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Net after refunds & cancellation fees"), Value: fm(data.netRevenue, currencyCode) },
        { Metric: exportMetric("Refunds (ledger)"), Value: fm(data.totalRefunded, currencyCode) },
        { Metric: exportMetric("Cancellation fees (net)"), Value: fm(Number((data as ReportRow).cancellationFees ?? 0), currencyCode) },
        { Metric: exportMetric("Tips (ledger)"), Value: fm(Number((data as ReportRow).tipsTotal ?? 0), currencyCode) },
        { Metric: exportMetric("Scheduled bookings (all statuses)"), Value: data.totalBookings || 0 },
        { Metric: exportMetric("Distinct clients"), Value: data.uniqueClients || 0 },
        { Metric: exportMetric("Avg ledger / booking (with earnings)"), Value: fm(data.averageBookingValue, currencyCode) },
        { Metric: exportMetric("Completion rate"), Value: `${Number(data.completionRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Cancellation rate"), Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("No-show rate"), Value: `${Number(data.noShowRate ?? 0).toFixed(1)}%` },
        {
          Metric: exportMetric("Ledger growth vs prior window"),
          Value: `${Number(data.revenueGrowth ?? 0).toFixed(1)}%`,
        },
        {
          Metric: exportMetric("Payments succeeded / total"),
          Value: `${Number((data as ReportRow).successfulPayments ?? 0)} / ${Number((data as ReportRow).totalPayments ?? 0)}`,
        },
        { Metric: exportMetric("Staff profiles (provider-wide)"), Value: (data as ReportRow).totalStaff ?? "" },
      ];

    case "business-comparison": {
      const current = (data.current ?? {}) as Record<string, unknown>;
      const previous = (data.previous ?? {}) as Record<string, unknown>;
      const growth = (data.growth ?? {}) as Record<string, unknown>;
      const windows = data.windows as
        | Record<string, { fromYmd?: string; toYmd?: string; description?: string }>
        | undefined;
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.period === "string" ? [{ Metric: exportMetric("Granularity"), Value: data.period }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis (summary)"), Value: data.reportBasis }]
          : []),
        ...(windows?.current?.fromYmd && windows?.current?.toYmd
          ? [
              {
                Metric: exportMetric("Current window (YMD)"),
                Value: `${windows.current.fromYmd} → ${windows.current.toYmd}`,
              },
            ]
          : []),
        ...(windows?.previous?.fromYmd && windows?.previous?.toYmd
          ? [
              {
                Metric: exportMetric("Previous window (YMD)"),
                Value: `${windows.previous.fromYmd} → ${windows.previous.toYmd}`,
              },
            ]
          : []),
        { Metric: exportMetric("Ledger earnings · current"), Value: fm(Number(current.revenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings · current"),
          Value: fm(Number(current.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders · current"),
          Value: fm(Number(current.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Ledger earnings · previous"), Value: fm(Number(previous.revenue ?? 0), currencyCode) },
        {
          Metric: exportMetric("Ledger from bookings · previous"),
          Value: fm(Number(previous.ledgerFromBookings ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Ledger from product orders · previous"),
          Value: fm(Number(previous.ledgerFromProductOrders ?? 0), currencyCode),
        },
        { Metric: exportMetric("Growth · ledger headline %"), Value: `${Number(growth.revenue ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Scheduled bookings · current"), Value: Number(current.bookings ?? 0) },
        { Metric: exportMetric("Scheduled bookings · previous"), Value: Number(previous.bookings ?? 0) },
        { Metric: exportMetric("Growth · bookings %"), Value: `${Number(growth.bookings ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Distinct clients · current"), Value: Number(current.clients ?? 0) },
        { Metric: exportMetric("Distinct clients · previous"), Value: Number(previous.clients ?? 0) },
        { Metric: exportMetric("Growth · clients %"), Value: `${Number(growth.clients ?? 0).toFixed(1)}%` },
        {
          Metric: exportMetric("Avg ledger / scheduled booking · current"),
          Value: fm(Number(current.averageLedgerPerScheduledBooking ?? current.averageValue ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Avg ledger / scheduled booking · previous"),
          Value: fm(Number(previous.averageLedgerPerScheduledBooking ?? previous.averageValue ?? 0), currencyCode),
        },
        {
          Metric: exportMetric("Growth · avg ledger / booking %"),
          Value: `${Number(growth.averageLedgerPerScheduledBooking ?? 0).toFixed(1)}%`,
        },
      ];
    }

    case "gift-card-sales":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("What this report counts"), Value: String(data.reportBasis) }]
          : []),
        { Metric: exportMetric("Redemption rows"), Value: data.totalGiftCardsSold || 0 },
        { Metric: exportMetric("Redeemed value (sum of amounts)"), Value: fm(data.totalRevenue, currencyCode) },
        { Metric: exportMetric("Avg per redemption row"), Value: fm(Number(data.averageGiftCardValue ?? 0), currencyCode) },
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
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("What this report counts"), Value: String(data.reportBasis) }]
          : []),
        { Metric: exportMetric("Redemption rows"), Value: data.totalRedemptions || 0 },
        { Metric: exportMetric("Redeemed value"), Value: fm(data.totalRedeemedValue, currencyCode) },
        { Metric: exportMetric("Avg per row"), Value: fm(Number(data.averageRedemptionValue ?? 0), currencyCode) },
        ...((data.redemptions as ReportRow[]) || []).map((r) => ({
          Section: "Capture",
          Amount: fm(Number(r.amount || 0), currencyCode),
          "Captured at": (r.redeemed_at as string) ?? (r.captured_at as string) ?? "",
        })),
      ];

    case "cancellations":
      return [
        { Metric: exportMetric("Total Cancelled"), Value: data.totalCancelled || 0 },
        { Metric: exportMetric("Total Bookings (denominator)"), Value: data.totalBookings ?? "" },
        { Metric: exportMetric("Cancellation Rate"), Value: `${Number(data.cancellationRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Ledger net (in window)"), Value: fm(Number(data.lostRevenue ?? 0), currencyCode) },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: exportMetric("Basis"), Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("Summary (one line)"), Value: data.reportBasis }]
          : []),
        ...(Array.isArray(data.ledgerTransactionTypes) && data.ledgerTransactionTypes.length
          ? [{ Metric: exportMetric("Ledger transaction types"), Value: (data.ledgerTransactionTypes as string[]).join(", ") }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
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
        { Metric: exportMetric("Total No-Shows"), Value: data.totalNoShows || 0 },
        { Metric: exportMetric("Lost Revenue"), Value: fm(data.lostRevenue, currencyCode) },
        ...((data.repeatOffenders as ReportRow[]) || []).map((r) => ({
          Name: r.name,
          Count: r.count,
          Revenue: fm(Number(r.revenue || 0), currencyCode),
        })),
      ];

    case "product-sales":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("What this report counts"), Value: data.reportBasis }]
          : []),
        { Metric: exportMetric("Total units sold"), Value: data.totalProductsSold || 0 },
        ...(typeof data.unitsFromBookings === "number"
          ? [{ Metric: exportMetric("Units from appointment add-ons (booking_products)"), Value: data.unitsFromBookings }]
          : []),
        ...(typeof data.unitsFromOrders === "number"
          ? [{ Metric: exportMetric("Units from paid retail orders"), Value: data.unitsFromOrders }]
          : []),
        { Metric: exportMetric("Total Revenue"), Value: fm(data.totalRevenue, currencyCode) },
        ...(typeof data.revenueFromBookings === "number"
          ? [{ Metric: exportMetric("Revenue from appointment add-ons"), Value: fm(data.revenueFromBookings, currencyCode) }]
          : []),
        ...(typeof data.revenueFromOrders === "number"
          ? [{ Metric: exportMetric("Revenue from paid retail orders"), Value: fm(data.revenueFromOrders, currencyCode) }]
          : []),
        { Metric: exportMetric("Total Cost (supply_price × qty)"), Value: fm((data.totalCost ?? 0), currencyCode) },
        { Metric: exportMetric("Total Profit"), Value: fm((data.totalProfit ?? 0), currencyCode) },
        {
          Metric: exportMetric("Avg revenue per unit sold"),
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
          ? [{ Metric: exportMetric("Basis"), Value: (data as ReportRow).reportBasis }]
          : []),
        ...(typeof (data as ReportRow).timezone === "string"
          ? [{ Metric: exportMetric("Timezone"), Value: (data as ReportRow).timezone }]
          : []),
        { Metric: exportMetric("Bookings (excl. pending)"), Value: data.totalPayments || 0 },
        { Metric: exportMetric("Gross Booked Value"), Value: fm(data.grossBookedValue ?? data.totalAmount, currencyCode) },
        { Metric: exportMetric("Customer Funds Settled (deduped)"), Value: fm(data.settledLedgerAmount ?? data.totalCollected, currencyCode) },
        { Metric: exportMetric("Customer Payments by Method Total"), Value: fm(data.customerPaymentsByMethodTotal, currencyCode) },
        { Metric: exportMetric("Gateway charge rows (payment_transactions)"), Value: (data as ReportRow).gatewayChargeCount ?? "" },
        { Metric: exportMetric("Provider Earnings"), Value: fm(data.providerEarnings, currencyCode) },
        { Metric: exportMetric("Provider Net Activity"), Value: fm(data.providerNetActivity ?? data.netAmount, currencyCode) },
        { Metric: exportMetric("Refunded Amount"), Value: fm(data.refundedAmount, currencyCode) },
        { Metric: exportMetric("Refund Rate"), Value: `${Number(data.refundRate ?? 0).toFixed(1)}%` },
        ...((data.paymentsByMethod as ReportRow[]) || []).map((p) => ({
          Method: p.method,
          Count: p.count,
          Amount: fm(((p.amount as number) || 0), currencyCode),
        })),
      ];

    case "new-clients":
      return [
        { Metric: exportMetric("Total New Clients"), Value: data.totalNewClients || 0 },
        { Metric: exportMetric("Return Rate"), Value: `${Number(data.returnRate ?? 0).toFixed(1)}%` },
        ...((data.newClients as ReportRow[]) || []).map((c) => ({
          "Client Name": c.clientName,
          "First Visit": c.firstVisit,
          "Total Spent": fm(((c.totalSpent as number) || 0), currencyCode),
          Returned: c.hasReturned ? exportT("yesNo.yes") : exportT("yesNo.no"),
        })),
      ];

    case "client-retention":
      return [
        { Metric: exportMetric("Distinct clients"), Value: data.totalClients ?? "" },
        { Metric: exportMetric("Single-visit clients"), Value: data.newClients ?? "" },
        { Metric: exportMetric("Repeat clients (2+ visits)"), Value: data.returningClients ?? "" },
        { Metric: exportMetric("Repeat share %"), Value: `${Number(data.overallRetentionRate ?? 0).toFixed(1)}%` },
        { Metric: exportMetric("Avg visits / client"), Value: Number((data as ReportRow).averageVisitsPerClient ?? 0).toFixed(2) },
        ...(typeof data.basisNote === "string" && data.basisNote.trim()
          ? [{ Metric: exportMetric("Basis"), Value: data.basisNote }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("Summary (one line)"), Value: data.reportBasis }]
          : []),
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
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
        { Metric: exportMetric("Total Clients"), Value: data.totalClients || 0 },
        { Metric: exportMetric("Average LTV"), Value: fm(data.averageLTV, currencyCode) },
        ...((data.topClients as ReportRow[]) || (data.clientLTV as ReportRow[]) || []).slice(0, 50).map((c) => ({
          Client: c.clientName ?? c.customerId,
          "Total Spent": fm(((c.totalSpent as number) || 0), currencyCode),
          Bookings: c.totalBookings || 0,
        })),
      ];

    case "package-usage":
      return [
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("Basis"), Value: data.reportBasis }]
          : []),
        { Metric: exportMetric("Usage events"), Value: data.totalPackagesUsed || 0 },
        { Metric: exportMetric("Distinct clients (deduped)"), Value: data.totalUniqueClients || 0 },
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
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.reportBasis === "string" && data.reportBasis.trim()
          ? [{ Metric: exportMetric("Basis"), Value: data.reportBasis }]
          : []),
        { Metric: exportMetric("Bookings in window"), Value: data.totalPackagesSold || 0 },
        { Metric: exportMetric("Booked package value"), Value: fm(data.totalRevenue, currencyCode) },
        {
          Metric: exportMetric("Avg booked value / booking"),
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
          ? [{ Metric: exportMetric("Timezone"), Value: String((data as ReportRow).timezone) }]
          : []),
        ...(typeof (data as ReportRow).fromYmd === "string" && typeof (data as ReportRow).toYmd === "string"
          ? [{ Metric: exportMetric("Ledger window"), Value: `${(data as ReportRow).fromYmd} → ${(data as ReportRow).toYmd}` }]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: exportMetric("Basis"), Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: exportMetric("Ledger rows"), Value: data.totalPayouts || 0 },
        { Metric: exportMetric("Net provider earnings"), Value: fm((data.totalPayoutAmount || 0), currencyCode) },
        {
          Metric: exportMetric("Gross booked (linked rows)"),
          Value: fm(data.totalBookedAmount ?? (data as ReportRow).bookedAmount ?? data.totalGrossAmount, currencyCode),
        },
        {
          Metric: exportMetric("Booked net of refunds"),
          Value: fm(
            (data as ReportRow).totalBookedNetOfRefunds ?? (data as ReportRow).bookedNetOfRefunds ?? 0,
            currencyCode,
          ),
        },
        { Metric: exportMetric("Platform & service fees"), Value: fm(data.totalPlatformFees, currencyCode) },
        { Metric: exportMetric("Refunds (ledger)"), Value: fm(data.totalRefunded, currencyCode) },
        { Metric: exportMetric("Avg per row"), Value: fm(data.averagePayout, currencyCode) },
        {
          Metric: exportMetric("Fees % of gross booked"),
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
        ...(typeof data.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: data.timezone }] : []),
        ...(typeof data.fromYmd === "string" && typeof data.toYmd === "string"
          ? [{ Metric: exportMetric("Period (calendar)"), Value: `${data.fromYmd} – ${data.toYmd}` }]
          : []),
        ...(typeof data.limit === "number" ? [{ Metric: exportMetric("Rank list limit"), Value: data.limit }] : []),
        ...(typeof data.reportBasis === "string" && String(data.reportBasis).trim()
          ? [{ Metric: exportMetric("What this report counts"), Value: String(data.reportBasis) }]
          : []),
        { Metric: exportMetric("Units sold (all SKUs in window)"), Value: data.totalProductsSold || 0 },
        { Metric: exportMetric("Line revenue (all SKUs in window)"), Value: fm(data.totalRevenue, currencyCode) },
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
          ? [{ Metric: exportMetric("Timezone"), Value: String((data as ReportRow).timezone) }]
          : []),
        ...(typeof (data as ReportRow).fromYmd === "string" && typeof (data as ReportRow).toYmd === "string"
          ? [{ Metric: exportMetric("Date range (provider TZ)"), Value: `${(data as ReportRow).fromYmd} → ${(data as ReportRow).toYmd}` }]
          : []),
        ...(typeof (data as ReportRow).reportBasis === "string" && String((data as ReportRow).reportBasis).trim()
          ? [{ Metric: exportMetric("Basis"), Value: String((data as ReportRow).reportBasis) }]
          : []),
        { Metric: exportMetric("Total line items"), Value: (data as ReportRow).totalLineItems ?? (data as ReportRow).totalPayments ?? 0 },
        { Metric: exportMetric("Total amount"), Value: fm(Number((data as ReportRow).totalAmount ?? 0), currencyCode) },
        ...(() => {
          const d = (data as ReportRow).diagnostics as
            | { failedCaptureAttemptsInRange?: number; failedCaptureAttemptsAttributed?: number }
            | undefined;
          if (!d) return [] as Array<{ Metric: string; Value: string | number }>;
          const rows: Array<{ Metric: string; Value: string | number }> = [];
          if (typeof d.failedCaptureAttemptsInRange === "number") {
            rows.push({ Metric: exportMetric("Failed captures in window (all)"), Value: d.failedCaptureAttemptsInRange });
          }
          if (typeof d.failedCaptureAttemptsAttributed === "number") {
            rows.push({ Metric: exportMetric("Failed captures linked to bookings here"), Value: d.failedCaptureAttemptsAttributed });
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
        ...(typeof d.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: d.timezone }] : []),
        ...(typeof d.reportBasis === "string" && String(d.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis"), Value: d.reportBasis }]
          : []),
        { Metric: exportMetric("Refund ledger rows"), Value: d.totalRefunds || 0 },
        { Metric: exportMetric("Customer refund gross"), Value: fm((d.totalRefundAmount as number) || 0, currencyCode) },
        { Metric: exportMetric("Provider earnings reversal"), Value: fm((d.providerEarningsReversed as number) || 0, currencyCode) },
        {
          Metric: exportMetric("Payment ledger in window (ratio denominator)"),
          Value: fm(
            ((d.totalPaymentLedgerAmount as number) ?? (d.totalPaymentAmount as number)) || 0,
            currencyCode,
          ),
        },
        {
          Metric: exportMetric("Refund share of payment ledger %"),
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
          ? [{ Metric: exportMetric("Capture window"), Value: `${d.fromYmd} → ${d.toYmd}` }]
          : []),
        { Metric: exportMetric("Rows returned"), Value: d.count ?? (d.rows as ReportRow[])?.length ?? 0 },
        { Metric: exportMetric("Received"), Value: fm(Number(totals.received ?? 0), currencyCode) },
        { Metric: exportMetric("Allocated"), Value: fm(Number(totals.allocated ?? 0), currencyCode) },
        { Metric: exportMetric("Unallocated"), Value: fm(Number(totals.unallocated ?? 0), currencyCode) },
        { Metric: exportMetric("Held"), Value: fm(Number(totals.held ?? 0), currencyCode) },
        { Metric: exportMetric("Eligible"), Value: fm(Number(totals.eligible ?? 0), currencyCode) },
        { Metric: exportMetric("Declined"), Value: fm(Number(totals.declined ?? 0), currencyCode) },
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
        ...(typeof d.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: String(d.timezone) }] : []),
        ...(typeof d.fromYmd === "string" && typeof d.toYmd === "string"
          ? [{ Metric: exportMetric("Capture window"), Value: `${d.fromYmd} → ${d.toYmd}` }]
          : []),
        ...(typeof d.reportBasis === "string" && String(d.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis"), Value: String(d.reportBasis) }]
          : []),
        { Metric: exportMetric("Row limit"), Value: (d.limit as number) ?? "" },
        { Metric: exportMetric("Rows returned"), Value: (summary?.total as number) ?? 0 },
        { Metric: exportMetric("Booking-linked"), Value: (summary?.with_booking as number) ?? 0 },
        { Metric: exportMetric("Synced (booking_payments)"), Value: (summary?.synced as number) ?? 0 },
        { Metric: exportMetric("Not synced (booking-linked)"), Value: (summary?.not_synced as number) ?? 0 },
        { Metric: exportMetric("Sale-linked only"), Value: (summary?.with_sale_only as number) ?? 0 },
        { Metric: exportMetric("Unlinked"), Value: (summary?.unlinked as number) ?? 0 },
        ...((data.payments as ReportRow[]) || []).map((p) => ({
          Date: p.created_at,
          "Yoco ID": p.yoco_payment_id,
          Amount: `${((p.amount as number) / 100).toFixed(2)} ${p.currency}`,
          Status: p.status,
          "Link kind": (p.link_kind as string) ?? "",
          "Booking synced": p.link_kind === "booking" ? (p.booking_synced ? exportT("yesNo.yes") : exportT("yesNo.no")) : "—",
        })),
      ];
    }

    case "inventory": {
      const inv = data as ReportRow;
      return [
        ...(typeof inv.reportBasis === "string" && String(inv.reportBasis).trim()
          ? [{ Metric: exportMetric("Basis"), Value: String(inv.reportBasis) }]
          : []),
        ...(typeof inv.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: inv.timezone }] : []),
        ...(typeof inv.asOf === "string" ? [{ Metric: exportMetric("Generated at"), Value: inv.asOf }] : []),
        { Metric: exportMetric("Total products"), Value: inv.totalProducts ?? 0 },
        { Metric: exportMetric("Active products"), Value: inv.activeProducts ?? 0 },
        { Metric: exportMetric("Inactive products"), Value: inv.inactiveProducts ?? 0 },
        { Metric: exportMetric("Products tracking stock"), Value: inv.productsTrackingStock ?? 0 },
        { Metric: exportMetric("Retail stock value"), Value: fm(Number(inv.totalStockValue ?? 0), currencyCode) },
        { Metric: exportMetric("Low stock (count)"), Value: inv.lowStockCount ?? 0 },
        { Metric: exportMetric("Out of stock (count)"), Value: inv.outOfStockCount ?? 0 },
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
            Active: p.is_active === false ? exportT("yesNo.no") : exportT("yesNo.yes"),
            "Track stock": p.track_stock_quantity === false ? exportT("yesNo.no") : exportT("yesNo.yes"),
            Variants: (p.has_variants as boolean) ? exportT("yesNo.yes") : exportT("yesNo.no"),
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
              { Metric: exportMetric("Period total available (min)"), Value: summary.totalAvailableMinutes ?? "" },
              { Metric: exportMetric("Period total booked (min)"), Value: summary.totalBookedMinutes ?? "" },
              { Metric: exportMetric("Period occupancy %"), Value: pct(summary.occupancyPercent) },
              { Metric: exportMetric("Staff in scope"), Value: summary.staffMemberCount ?? "" },
              { Metric: exportMetric("Days in range"), Value: summary.dayCount ?? "" },
            ]
          : []),
        ...(typeof d.basisNote === "string" && d.basisNote.trim()
          ? [{ Metric: exportMetric("Basis"), Value: d.basisNote }]
          : []),
        ...(typeof d.reportBasis === "string" && d.reportBasis.trim()
          ? [{ Metric: exportMetric("Summary (one line)"), Value: d.reportBasis }]
          : []),
        ...(Array.isArray(d.includedBookingStatuses) && d.includedBookingStatuses.length
          ? [{ Metric: exportMetric("Booking statuses"), Value: (d.includedBookingStatuses as string[]).join(", ") }]
          : []),
        ...(typeof d.timezone === "string" ? [{ Metric: exportMetric("Timezone"), Value: d.timezone }] : []),
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
        { Field: exportMetric("Date"), Value: String(d.date ?? "") },
        ...(typeof (d as ReportRow).timezone === "string"
          ? [{ Field: exportMetric("Timezone"), Value: (d as ReportRow).timezone }]
          : []),
        ...(typeof (d as ReportRow).reportBasis === "string" && String((d as ReportRow).reportBasis).trim()
          ? [{ Field: exportMetric("Basis"), Value: (d as ReportRow).reportBasis }]
          : []),
        { Field: exportMetric("Booking count"), Value: d.bookingCount },
        { Field: exportMetric("Total"), Value: fm((d.total as number) || 0, currencyCode) },
        { Field: exportMetric("Booking payments total"), Value: fm((d.bookingPaymentsTotal as number) || 0, currencyCode) },
        { Field: exportMetric("Wallet total (split-safe)"), Value: fm((d.walletTotal as number) || 0, currencyCode) },
        { Field: exportMetric("Sales total"), Value: fm((d.salesTotal as number) || 0, currencyCode) },
        { Field: exportMetric("Tips total"), Value: fm((d.tipsTotal as number) || 0, currencyCode) },
        {
          Field: exportMetric("Cashback total (till cash-out, not in recorded total)"),
          Value: fm((d.cashbackTotal as number) || 0, currencyCode),
        },
        { Field: exportMetric("Cancellation fees"), Value: fm((d.cancellationFeesTotal as number) || 0, currencyCode) },
        { Field: exportMetric("Note"), Value: String(d.note ?? "") },
        ...Object.keys(byM).map((k) => ({
          Field: exportMetric(`Payment: ${k}`),
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
