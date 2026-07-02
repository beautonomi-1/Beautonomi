/**
 * Plain-language definitions for provider money metrics (mirrors web
 * `apps/web/src/lib/reports/revenue-glossary.ts`).
 */
export const REVENUE_GLOSSARY = {
  recognizedRevenue: {
    label: "Recognized revenue",
    short: "What you earned in the period",
    definition:
      "Service earnings plus tips, travel fees, cancellation fees and walk-in add-ons recognised in the selected period (net of refunds).",
  },
  ledgerNet: {
    label: "Ledger net",
    short: "Net of platform commission",
    definition:
      "The net amount posted to your ledger after platform commission deduction in the period.",
  },
  payoutEarnings: {
    label: "Payout earnings",
    short: "Platform-held, payoutable",
    definition:
      "Recognised earnings the platform is holding that are eligible to be withdrawn, before completed payouts and pending requests.",
  },
  availableBalance: {
    label: "Available to withdraw",
    short: "Ready to pay out now",
    definition:
      "Platform-held money you can withdraw now: payoutable earnings minus paid-out and pending requests, and money still on hold.",
  },
  serviceEarnings: {
    label: "Service earnings",
    short: "Your cut of services",
    definition:
      "Your share of service bookings only (provider_earnings) — excludes tips, travel fees and walk-in add-ons.",
  },
  bookedGmv: {
    label: "Booked value",
    short: "What was booked",
    definition:
      "Sum of booking.total_amount on the scheduled date. Not the same as recognized ledger earnings.",
  },
  channelMixAppointments: {
    label: "Appointments by channel",
    short: "Counts, not revenue",
    definition:
      "How many appointments were scheduled in the period by channel. For channel revenue, see the bookings report.",
  },
} as const;
