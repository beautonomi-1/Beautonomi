import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import { normalizeBookingChannel } from "@/lib/reports/booking-channel-breakdown";
import {
  computeDashboardEarningsMix,
  recognizedRevenueInRange,
  type DashboardEarningsMixRow,
  type RecognizedRevenueInRangeRow,
} from "@/lib/reports/provider-revenue-semantics";

export type DashboardBookingRow = {
  status?: string | null;
  scheduled_at?: string | null;
  booking_source?: string | null;
};

export type DashboardParsedLedgerRow = {
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  created_at: string;
  booking_id?: string | null;
  product_order_id?: string | null;
  description?: string | null;
  refund_component?: string | null;
  createdDate: Date;
  netValue: number;
  amountValue: number;
  descriptionText: string;
};

export type PeriodWindow = {
  start: Date;
  end: Date;
};

export type DashboardPeriodChannelMix = {
  online: number;
  walk_in: number;
  provider: number;
};

export type DashboardPeriodEarningsMix = {
  service_earnings: number;
  product_order_earnings: number;
  membership_earnings: number;
  additional_charge_earnings: number;
  other_earnings: number;
  tips: number;
  travel_fees: number;
  gift_card_sales: number;
  membership_sales: number;
  refunds: number;
  recognized_total: number;
};

export type DashboardPeriodBookingStatus = {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  no_show: number;
  scheduled_total: number;
};

export type DashboardPeriodPerformance = {
  completion_rate: number;
  no_show_rate: number;
};

export type DashboardPeriodSlice = {
  revenue: number;
  appointments: number;
  retail_sales: number;
  retail_sales_count: number;
  earnings_mix: DashboardPeriodEarningsMix;
  channel_mix: DashboardPeriodChannelMix;
  booking_status: DashboardPeriodBookingStatus;
  performance: DashboardPeriodPerformance;
};

export type DashboardPeriodComparison = {
  revenue_growth_pct: number;
  appointments_growth_pct: number;
  prior_revenue: number;
  prior_appointments: number;
  prior_label: string;
};

export type DashboardPeriodBreakdown = {
  today: DashboardPeriodSlice;
  this_week: DashboardPeriodSlice;
  this_month: DashboardPeriodSlice;
};

export type DashboardPeriodComparisons = {
  today: DashboardPeriodComparison;
  this_week: DashboardPeriodComparison;
  this_month: DashboardPeriodComparison;
};

const PENDING_STATUSES = new Set(["pending", "pending_payment"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "waiting", "checked_in", "in_progress"]);
const SCHEDULE_COUNT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
  "completed",
]);

function inWindow(date: Date | null, window: PeriodWindow): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date >= window.start && date <= window.end;
}

function sumAmountInWindow(
  rows: DashboardParsedLedgerRow[],
  types: string[],
  window: PeriodWindow,
): number {
  let sum = 0;
  for (const r of rows) {
    if (!types.includes(r.transaction_type)) continue;
    if (!inWindow(r.createdDate, window)) continue;
    sum += r.amountValue;
  }
  return sum;
}

function sumRefundsInWindow(rows: DashboardParsedLedgerRow[], window: PeriodWindow): number {
  let sum = 0;
  for (const r of rows) {
    if (!inWindow(r.createdDate, window)) continue;
    if (r.transaction_type === "refund" && isProviderEarningsRefundComponent(r.refund_component)) {
      sum += Math.abs(r.netValue);
      continue;
    }
    if (r.transaction_type === "provider_earnings" && r.netValue < 0) {
      sum += Math.abs(r.netValue);
    }
  }
  return sum;
}

function ledgerRowsInWindow(
  rows: DashboardParsedLedgerRow[],
  window: PeriodWindow,
): DashboardEarningsMixRow[] {
  return rows
    .filter((r) => inWindow(r.createdDate, window))
    .map((r) => ({
      transaction_type: r.transaction_type,
      amount: r.amountValue,
      net: r.netValue,
      booking_id: r.booking_id,
      product_order_id: r.product_order_id,
      description: r.descriptionText,
    }));
}

function ledgerRowsForRevenueInWindow(
  rows: DashboardParsedLedgerRow[],
  window: PeriodWindow,
): RecognizedRevenueInRangeRow[] {
  return rows
    .filter((r) => inWindow(r.createdDate, window))
    .map((r) => ({
      transaction_type: r.transaction_type,
      amount: r.amountValue,
      net: r.netValue,
      created_at: r.created_at,
      refund_component: r.refund_component,
    }));
}

export function countBookingChannelInWindow(
  bookings: DashboardBookingRow[],
  window: PeriodWindow,
): DashboardPeriodChannelMix {
  let online = 0;
  let walkIn = 0;
  let provider = 0;

  for (const booking of bookings) {
    const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
    if (!inWindow(scheduledDate, window)) continue;

    const status = String(booking.status || "");
    if (!SCHEDULE_COUNT_STATUSES.has(status)) continue;

    const channel = normalizeBookingChannel(booking.booking_source);
    if (channel === "online") online++;
    else if (channel === "walk_in") walkIn++;
    else if (channel === "provider") provider++;
  }

  return { online, walk_in: walkIn, provider };
}

export function countBookingStatusInWindow(
  bookings: DashboardBookingRow[],
  window: PeriodWindow,
): DashboardPeriodBookingStatus {
  let pending = 0;
  let confirmed = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let scheduledTotal = 0;

  for (const booking of bookings) {
    const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
    if (!inWindow(scheduledDate, window)) continue;

    const status = String(booking.status || "");
    if (SCHEDULE_COUNT_STATUSES.has(status)) scheduledTotal++;

    if (CONFIRMED_STATUSES.has(status)) {
      confirmed++;
    } else if (PENDING_STATUSES.has(status)) {
      pending++;
    } else if (status === "completed") {
      completed++;
    } else if (status === "cancelled") {
      cancelled++;
    } else if (status === "no_show") {
      noShow++;
    }
  }

  return {
    pending,
    confirmed,
    completed,
    cancelled,
    no_show: noShow,
    scheduled_total: scheduledTotal,
  };
}

export function performanceInWindow(
  bookings: DashboardBookingRow[],
  window: PeriodWindow,
): DashboardPeriodPerformance {
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;

  for (const booking of bookings) {
    const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
    if (!inWindow(scheduledDate, window)) continue;
    const status = String(booking.status || "");
    if (status === "completed") completed++;
    else if (status === "cancelled") cancelled++;
    else if (status === "no_show") noShow++;
  }

  const terminal = completed + cancelled + noShow;
  return {
    completion_rate: terminal > 0 ? (completed / terminal) * 100 : 0,
    no_show_rate: terminal > 0 ? (noShow / terminal) * 100 : 0,
  };
}

export function buildPeriodSlice(params: {
  window: PeriodWindow;
  parsedRows: DashboardParsedLedgerRow[];
  bookings: DashboardBookingRow[];
  revenue: number;
  appointments: number;
  retail_sales: number;
  retail_sales_count: number;
}): DashboardPeriodSlice {
  const { window, parsedRows, bookings, revenue, appointments, retail_sales, retail_sales_count } =
    params;
  const mixRows = ledgerRowsInWindow(parsedRows, window);
  const mix = computeDashboardEarningsMix(mixRows);

  return {
    revenue,
    appointments,
    retail_sales,
    retail_sales_count,
    channel_mix: countBookingChannelInWindow(bookings, window),
    earnings_mix: {
      service_earnings: mix.serviceEarningsTotal,
      product_order_earnings: mix.productOrderEarningsTotal,
      membership_earnings: mix.membershipEarningsTotal,
      additional_charge_earnings: mix.additionalChargeEarningsTotal,
      other_earnings: mix.otherEarningsTotal,
      tips: sumAmountInWindow(parsedRows, ["tip"], window),
      travel_fees: sumAmountInWindow(parsedRows, ["travel_fee"], window),
      gift_card_sales: sumAmountInWindow(parsedRows, ["gift_card_sale"], window),
      membership_sales: sumAmountInWindow(parsedRows, ["membership_sale"], window),
      refunds: sumRefundsInWindow(parsedRows, window),
      recognized_total: recognizedRevenueInRange(ledgerRowsForRevenueInWindow(parsedRows, window), {
        start: window.start,
        end: window.end,
      }),
    },
    booking_status: countBookingStatusInWindow(bookings, window),
    performance: performanceInWindow(bookings, window),
  };
}

export function growthPct(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / Math.abs(prior)) * 100);
}

export function buildPeriodComparison(
  current: { revenue: number; appointments: number },
  prior: { revenue: number; appointments: number },
  priorLabel: string,
): DashboardPeriodComparison {
  return {
    revenue_growth_pct: growthPct(current.revenue, prior.revenue),
    appointments_growth_pct: growthPct(current.appointments, prior.appointments),
    prior_revenue: prior.revenue,
    prior_appointments: prior.appointments,
    prior_label: priorLabel,
  };
}

export function buildDashboardPeriodBreakdown(params: {
  parsedRows: DashboardParsedLedgerRow[];
  bookings: DashboardBookingRow[];
  windows: {
    today: PeriodWindow;
    this_week: PeriodWindow;
    this_month: PeriodWindow;
    yesterday: PeriodWindow;
    prior_week: PeriodWindow;
    prior_month: PeriodWindow;
  };
  revenue: {
    today: number;
    this_week: number;
    this_month: number;
    yesterday: number;
    prior_week: number;
    prior_month: number;
  };
  appointments: {
    today: number;
    this_week: number;
    this_month: number;
    yesterday: number;
    prior_week: number;
    prior_month: number;
  };
  retail: {
    today: { amount: number; count: number };
    this_week: { amount: number; count: number };
    this_month: { amount: number; count: number };
  };
}): { period_breakdown: DashboardPeriodBreakdown; period_comparison: DashboardPeriodComparisons } {
  const { parsedRows, bookings, windows, revenue, appointments, retail } = params;

  const today = buildPeriodSlice({
    window: windows.today,
    parsedRows,
    bookings,
    revenue: revenue.today,
    appointments: appointments.today,
    retail_sales: retail.today.amount,
    retail_sales_count: retail.today.count,
  });
  const this_week = buildPeriodSlice({
    window: windows.this_week,
    parsedRows,
    bookings,
    revenue: revenue.this_week,
    appointments: appointments.this_week,
    retail_sales: retail.this_week.amount,
    retail_sales_count: retail.this_week.count,
  });
  const this_month = buildPeriodSlice({
    window: windows.this_month,
    parsedRows,
    bookings,
    revenue: revenue.this_month,
    appointments: appointments.this_month,
    retail_sales: retail.this_month.amount,
    retail_sales_count: retail.this_month.count,
  });

  return {
    period_breakdown: { today, this_week, this_month },
    period_comparison: {
      today: buildPeriodComparison(
        { revenue: revenue.today, appointments: appointments.today },
        { revenue: revenue.yesterday, appointments: appointments.yesterday },
        "yesterday",
      ),
      this_week: buildPeriodComparison(
        { revenue: revenue.this_week, appointments: appointments.this_week },
        { revenue: revenue.prior_week, appointments: appointments.prior_week },
        "last week (same days)",
      ),
      this_month: buildPeriodComparison(
        { revenue: revenue.this_month, appointments: appointments.this_month },
        { revenue: revenue.prior_month, appointments: appointments.prior_month },
        "last month (to date)",
      ),
    },
  };
}
