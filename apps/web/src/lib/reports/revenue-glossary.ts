/**
 * Single source of truth for the short, human-readable definitions of the core
 * provider money metrics. Surfaces (dashboard, finance, reports hub, analytics,
 * business overview) should reuse these strings for metric subtitles, tooltips,
 * and "what this means" notes so the same word always means the same thing.
 *
 * The underlying accounting math lives in `provider-revenue-semantics.ts`; this
 * module only describes it in plain language.
 */
export const REVENUE_GLOSSARY = {
  recognizedRevenue: {
    label: "Recognized revenue",
    short: "What you earned in the period",
    definition:
      "Service earnings plus tips, travel fees, cancellation fees and walk-in add-ons recognised in the selected period (net of refunds). This is the headline 'what you earned' figure.",
  },
  ledgerNet: {
    label: "Ledger net",
    short: "Net of platform commission",
    definition:
      "The net amount posted to your ledger after platform commission and gateway fees, summed across booking-linked transactions in the period.",
  },
  serviceEarnings: {
    label: "Service earnings",
    short: "Your cut of services",
    definition:
      "Your share of service bookings only (provider_earnings) — excludes tips, travel fees and product orders. Used for per-booking splits and staff commission.",
  },
  payoutEarnings: {
    label: "Payout earnings",
    short: "Platform-held, payoutable",
    definition:
      "Recognised earnings the platform is holding on your behalf that are eligible to be withdrawn, before completed payouts and pending requests.",
  },
  availableBalance: {
    label: "Available to withdraw",
    short: "Ready to pay out now",
    definition:
      "Platform-held money you can withdraw right now: payoutable earnings minus already-paid-out and pending payout requests, and money still on hold. Direct cash, EFT, manual card and Yoco takings are excluded.",
  },
  retailSales: {
    label: "Retail sales",
    short: "In-person sales you collected",
    definition:
      "Sales you took in person (walk-in / point of sale) and collected directly, counted on the payment date.",
  },
  bookedGmv: {
    label: "Booked value (GMV)",
    short: "What was booked",
    definition:
      "Sum of booking.total_amount for appointments in the window (scheduled date basis). Not the same as recognized ledger earnings.",
  },
  channelMixAppointments: {
    label: "Appointments by channel",
    short: "Booking counts, not revenue",
    definition:
      "How many appointments were scheduled in the period by channel (online, walk-in, provider-created). Counts only — channel revenue lives in the bookings report.",
  },
  adminBookedGmv: {
    label: "Scheduled gross booked value",
    short: "Booking GMV in period",
    definition:
      "Sum of booking.total_amount for completed or confirmed bookings in the report window. Platform ledger net is shown separately in Finance.",
  },
  adminLedgerNet: {
    label: "Ledger recognized revenue",
    short: "Settled in finance_transactions",
    definition:
      "Provider or platform amounts posted to the ledger by settlement timestamp. Differs from booked GMV when services are unpaid, refunded, or settled outside the booking date.",
  },
} as const;

export type RevenueGlossaryKey = keyof typeof REVENUE_GLOSSARY;
