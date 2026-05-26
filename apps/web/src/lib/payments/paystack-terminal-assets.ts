export type PaystackTerminalAssetStatus = "missing_assets" | "link_ready" | "poster_ready" | "ready";
export type PaystackTerminalDestinationStatus =
  | "not_configured"
  | "configured"
  | "sync_error"
  | "disabled";
export type PaystackTerminalIdentityStatus = "needs_review" | "verified" | "manual_override";

export type TerminalAssetInput = {
  payment_link?: string | null;
  terminal_url?: string | null;
  qr_url?: string | null;
  poster_url?: string | null;
};

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function computePaystackTerminalAssetStatus(input: TerminalAssetInput): PaystackTerminalAssetStatus {
  const hasLink = Boolean(cleanText(input.payment_link) ?? cleanText(input.terminal_url));
  const hasPosterOrQr = Boolean(cleanText(input.poster_url) ?? cleanText(input.qr_url));
  if (hasLink && hasPosterOrQr) return "ready";
  if (hasLink) return "link_ready";
  if (hasPosterOrQr) return "poster_ready";
  return "missing_assets";
}

export function buildPaystackTerminalPaymentUrl(code: string): string {
  return `https://paystack.shop/pay/${encodeURIComponent(code.toLowerCase())}`;
}

export function isTrustedPaystackTerminalAssetUrl(value: string | null | undefined): boolean {
  const raw = cleanText(value);
  if (!raw) return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "paystack.com" ||
      host.endsWith(".paystack.com") ||
      host === "paystack.shop" ||
      host.endsWith(".paystack.shop") ||
      host.includes("supabase.co") ||
      host.includes("supabase.in")
    );
  } catch {
    return false;
  }
}

export function normalizePaystackTerminalName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, "-")
    .slice(0, 120);
}

export function buildPaystackTerminalName(params: {
  providerBusinessName?: string | null;
  providerDisplayName?: string | null;
  locationName?: string | null;
  requestedName?: string | null;
  uniqueSuffix?: string | null;
  portable?: boolean;
}): string {
  const business =
    cleanText(params.providerBusinessName) ??
    cleanText(params.providerDisplayName) ??
    "Beautonomi Provider";
  const location = cleanText(params.locationName);
  const requested = cleanText(params.requestedName);
  const requestedAlreadyIdentified = requested
    ? requested.toLowerCase().includes(business.toLowerCase())
    : false;
  const suffix = cleanText(params.uniqueSuffix)?.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() ?? null;
  if (requested && requestedAlreadyIdentified) {
    return normalizePaystackTerminalName(`${requested}${suffix ? ` - ${suffix}` : ""}`);
  }
  const label = location ?? requested ?? (params.portable ? "Mobile terminal" : "Front desk");
  const suffixPart = suffix ? ` - ${suffix}` : "";
  if (location) {
    return normalizePaystackTerminalName(`${business} - ${location}${requested ? ` - ${requested}` : ""}${suffixPart}`);
  }
  return normalizePaystackTerminalName(`${business} - ${label}${suffixPart}`);
}

export function normalizeWhatsAppTarget(value: string | null | undefined): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${plus}${digits}`;
}

export function maskPhone(value: string | null | undefined): string | null {
  const normalized = normalizeWhatsAppTarget(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return `ending ${digits.slice(-4)}`;
}

export function buildTerminalBusinessSnapshot(params: {
  provider?: Record<string, unknown> | null;
  owner?: Record<string, unknown> | null;
  location?: Record<string, unknown> | null;
  notificationWhatsapp?: string | null;
  terminalName: string;
}) {
  return {
    provider_id: params.provider?.id ?? null,
    provider_business_name: params.provider?.business_name ?? null,
    provider_phone: params.provider?.phone ?? params.provider?.billing_phone ?? null,
    provider_email: params.provider?.email ?? params.provider?.billing_email ?? null,
    owner_name: params.owner?.full_name ?? null,
    owner_email: params.owner?.email ?? null,
    owner_phone: params.owner?.phone ?? null,
    location_id: params.location?.id ?? null,
    location_name: params.location?.name ?? null,
    location_city: params.location?.city ?? null,
    notification_whatsapp: normalizeWhatsAppTarget(params.notificationWhatsapp),
    terminal_name: params.terminalName,
    captured_at: new Date().toISOString(),
  };
}

export function scorePaystackTerminalProviderMatch(params: {
  terminalName?: string | null;
  terminalCode?: string | null;
  metadata?: Record<string, unknown> | null;
  destinations?: Array<{ target?: string | null }> | null;
  provider?: Record<string, unknown> | null;
  location?: Record<string, unknown> | null;
  localTerminalCode?: string | null;
}) {
  let confidence = 0;
  const reasons: string[] = [];
  const terminalName = cleanText(params.terminalName)?.toLowerCase() ?? "";
  const businessName = cleanText(params.provider?.business_name)?.toLowerCase();
  const locationName = cleanText(params.location?.name)?.toLowerCase();
  if (params.localTerminalCode && params.terminalCode && params.localTerminalCode === params.terminalCode) {
    confidence += 100;
    reasons.push("terminal_code_match");
  }
  if (params.metadata?.provider_id && params.provider?.id && params.metadata.provider_id === params.provider.id) {
    confidence += 95;
    reasons.push("metadata_provider_id_match");
  }
  if (businessName && terminalName.includes(businessName)) {
    confidence += 45;
    reasons.push("business_name_in_terminal_name");
  }
  if (locationName && terminalName.includes(locationName)) {
    confidence += 20;
    reasons.push("location_name_in_terminal_name");
  }
  const providerPhones = [
    params.provider?.phone,
    params.provider?.billing_phone,
    params.provider?.business_phone,
  ].map((v) => normalizeWhatsAppTarget(typeof v === "string" ? v : null)).filter(Boolean);
  const destinationTargets = (params.destinations ?? [])
    .map((d) => normalizeWhatsAppTarget(d.target))
    .filter(Boolean);
  if (providerPhones.some((phone) => destinationTargets.includes(phone))) {
    confidence += 35;
    reasons.push("whatsapp_destination_matches_provider");
  }
  return { confidence: Math.min(100, confidence), reasons };
}
