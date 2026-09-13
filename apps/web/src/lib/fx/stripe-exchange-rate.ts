/** Stripe balance_transaction.exchange_rate when present (PSP metadata only — not HQ ingest). */

export function extractStripeExchangeRateForTest(intent: Record<string, unknown>): number | null {
  return extractStripeExchangeRate(intent);
}

export function extractStripeExchangeRate(intent: Record<string, unknown>): number | null {
  const latestCharge = intent.latest_charge;
  if (latestCharge && typeof latestCharge === "object") {
    const bt = (latestCharge as { balance_transaction?: unknown }).balance_transaction;
    if (bt && typeof bt === "object") {
      const rate = (bt as { exchange_rate?: unknown }).exchange_rate;
      if (typeof rate === "number" && rate > 0) return rate;
    }
  }
  const charges = intent.charges;
  if (charges && typeof charges === "object") {
    const data = (charges as { data?: unknown[] }).data;
    if (Array.isArray(data)) {
      for (const ch of data) {
        if (!ch || typeof ch !== "object") continue;
        const bt = (ch as { balance_transaction?: unknown }).balance_transaction;
        if (bt && typeof bt === "object") {
          const rate = (bt as { exchange_rate?: unknown }).exchange_rate;
          if (typeof rate === "number" && rate > 0) return rate;
        }
      }
    }
  }
  return null;
}
