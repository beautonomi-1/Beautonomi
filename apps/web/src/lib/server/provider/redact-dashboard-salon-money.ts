import { redactBookingCustomerContacts } from "@/lib/provider/redact-booking-customer-contact";

const ZERO_NUMBER_KEYS = [
  "revenue_today",
  "revenue_this_week",
  "revenue_this_month",
  "revenue_growth",
  "lifetime_revenue",
  "available_balance",
  "pending_payout_queue",
  "pending_payments_amount",
  "service_earnings_total",
  "booking_earnings_total",
  "product_order_earnings_total",
  "product_order_earnings_platform_total",
  "product_order_retail_total",
  "retail_sales_today",
  "retail_sales_this_week",
  "retail_sales_this_month",
  "additional_charge_earnings_total",
  "other_earnings_total",
  "recognized_earnings_total",
  "tips_total",
  "tips_this_month",
  "gift_card_sales_total",
  "membership_sales_total",
  "refunds_total",
  "unrecognized_payments_today",
  "raw_payout_balance",
  "balance_owed_to_platform",
  "platform_fees_deducted",
  "platform_commission_paid",
  "platform_fees_paid",
  "expenses_total",
  "expenses_this_month",
  "travel_fees_total",
  "travel_fees_today",
  "travel_fees_this_month",
  "travel_fees_last_month",
] as const;

function zeroRecordNumbers(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = typeof entry === "number" ? 0 : entry;
  }
  return next;
}

function redactPeriodSlice(slice: unknown): unknown {
  if (!slice || typeof slice !== "object") return slice;
  const row = slice as Record<string, unknown>;
  return {
    ...row,
    revenue: 0,
    retail_sales: 0,
    earnings_mix:
      row.earnings_mix && typeof row.earnings_mix === "object"
        ? zeroRecordNumbers(row.earnings_mix as Record<string, unknown>)
        : row.earnings_mix,
  };
}

function redactPeriodComparison(slice: unknown): unknown {
  if (!slice || typeof slice !== "object") return slice;
  const row = slice as Record<string, unknown>;
  return { ...row, revenue_growth_pct: 0, prior_revenue: 0 };
}

/** Names stay. Customer phones on today's and upcoming appointments do not. */
export function redactDashboardCustomerContact<T extends Record<string, unknown>>(payload: T): T {
  const insights = payload.insights;
  if (!insights || typeof insights !== "object") return payload;
  const row = insights as Record<string, unknown>;
  return {
    ...payload,
    insights: {
      ...row,
      today_bookings: Array.isArray(row.today_bookings)
        ? redactBookingCustomerContacts(row.today_bookings, false)
        : row.today_bookings,
      upcoming_bookings: Array.isArray(row.upcoming_bookings)
        ? redactBookingCustomerContacts(row.upcoming_bookings, false)
        : row.upcoming_bookings,
    },
  } as T;
}

/** Appointment counts stay. Salon takings, payouts, and earnings do not. */
export function redactDashboardSalonMoney<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload } as Record<string, unknown>;
  for (const key of ZERO_NUMBER_KEYS) {
    if (key in next) next[key] = 0;
  }
  next.has_negative_payout_balance = false;

  if (next.period_breakdown && typeof next.period_breakdown === "object") {
    const periods = next.period_breakdown as Record<string, unknown>;
    next.period_breakdown = {
      ...periods,
      today: redactPeriodSlice(periods.today),
      this_week: redactPeriodSlice(periods.this_week),
      this_month: redactPeriodSlice(periods.this_month),
    };
  }
  if (next.period_comparison && typeof next.period_comparison === "object") {
    const periods = next.period_comparison as Record<string, unknown>;
    next.period_comparison = {
      ...periods,
      today: redactPeriodComparison(periods.today),
      this_week: redactPeriodComparison(periods.this_week),
      this_month: redactPeriodComparison(periods.this_month),
    };
  }
  if (next.insights && typeof next.insights === "object") {
    const insights = next.insights as Record<string, unknown>;
    next.insights = {
      ...insights,
      weekly_revenue: Array.isArray(insights.weekly_revenue)
        ? insights.weekly_revenue.map((row) =>
            row && typeof row === "object" ? { ...row, revenue: 0 } : row,
          )
        : insights.weekly_revenue,
      top_services: Array.isArray(insights.top_services)
        ? insights.top_services.map((row) =>
            row && typeof row === "object" ? { ...row, total_revenue: 0 } : row,
          )
        : insights.top_services,
    };
  }
  return next as T;
}
