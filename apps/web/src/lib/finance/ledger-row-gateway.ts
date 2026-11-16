/** Gateways whose fees the platform absorbs. Card machines stay with the provider. */
export const PLATFORM_HELD_GATEWAYS = new Set([
  "paystack",
  "stripe",
  "flutterwave",
  "apple",
  "wallet",
  "gift_card",
]);

export const PROVIDER_COLLECTED_GATEWAYS = new Set(["yoco", "paycloud"]);

const ALIASES: Record<string, string> = {
  paystack: "paystack",
  stripe: "stripe",
  flutterwave: "flutterwave",
  flw: "flutterwave",
  apple: "apple",
  apple_iap: "apple",
  apple_commission: "apple",
  yoco: "yoco",
  paycloud: "paycloud",
  wallet: "wallet",
  gift_card: "gift_card",
  giftcard: "gift_card",
};

function rawGateway(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Gateway that recorded this ledger row, from fee_source / payment_provider / provider metadata. */
export function ledgerRowGateway(row: { metadata?: Record<string, unknown> | null }): string {
  const meta = row.metadata ?? {};
  const raw = [meta.fee_source, meta.payment_provider, meta.provider, meta.gateway]
    .map(rawGateway)
    .find((value) => value.length > 0 && value !== "estimated") ?? "";
  if (!raw) return "unknown";
  if (raw.startsWith("paystack")) return "paystack";
  if (raw.startsWith("apple")) return "apple";
  if (raw.startsWith("stripe")) return "stripe";
  if (raw.startsWith("flutterwave") || raw.startsWith("flw")) return "flutterwave";
  const normalized = raw.replace(/_fee_missing$/, "");
  return ALIASES[normalized] ?? normalized;
}

export function isPlatformHeldGateway(gateway: string): boolean {
  return PLATFORM_HELD_GATEWAYS.has(gateway);
}
