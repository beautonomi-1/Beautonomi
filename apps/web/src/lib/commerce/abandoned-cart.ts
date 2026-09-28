import { createHash } from "node:crypto";

export const ABANDONED_CART_IDLE_MIN_MS = 6 * 60 * 60 * 1000;
export const ABANDONED_CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ABANDONED_CART_MAX_SENDS = 2;
export const ABANDONED_CART_MIN_GAP_MS = 24 * 60 * 60 * 1000;

export type AbandonedCartLine = {
  user_id: string;
  provider_id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  updated_at: string;
  product_name: string;
  is_active: boolean | null;
  retail_sales_enabled: boolean | null;
  track_stock_quantity: boolean | null;
  product_quantity: number | null;
  variant_quantity: number | null;
};

export type PaidOrderCover = {
  customer_id: string;
  product_id: string;
  product_variant_id: string | null;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
};

export type AbandonedCartLedgerRow = {
  send_count: number;
  last_sent_at: string | null;
};

export function isCartLineInReminderWindow(updatedAtIso: string, nowMs: number): boolean {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return false;
  const ageMs = nowMs - updatedMs;
  return ageMs >= ABANDONED_CART_IDLE_MIN_MS && ageMs <= ABANDONED_CART_MAX_AGE_MS;
}

function variantKey(variantId: string | null | undefined): string {
  return variantId ?? "";
}

export function hasCoveringPaidOrder(line: AbandonedCartLine, covers: PaidOrderCover[]): boolean {
  const lineUpdatedMs = Date.parse(line.updated_at);
  if (Number.isNaN(lineUpdatedMs)) return false;

  for (const cover of covers) {
    if (cover.customer_id !== line.user_id) continue;
    if (cover.product_id !== line.product_id) continue;
    if (variantKey(cover.product_variant_id) !== variantKey(line.product_variant_id)) continue;
    if (cover.payment_status !== "paid" && cover.payment_status !== "partially_refunded") continue;

    const paidMs = Date.parse(cover.paid_at ?? cover.created_at);
    if (Number.isNaN(paidMs)) continue;
    if (paidMs >= lineUpdatedMs) return true;
  }
  return false;
}

export function isCartLineEligible(
  line: AbandonedCartLine,
  covers: PaidOrderCover[],
  nowMs: number,
): boolean {
  if (!isCartLineInReminderWindow(line.updated_at, nowMs)) return false;
  if (line.is_active === false) return false;
  if (line.retail_sales_enabled === false) return false;
  if (hasCoveringPaidOrder(line, covers)) return false;

  if (line.track_stock_quantity === true) {
    const stock =
      line.product_variant_id != null && line.variant_quantity != null
        ? Number(line.variant_quantity)
        : Number(line.product_quantity ?? 0);
    if (stock < Number(line.quantity ?? 1)) return false;
  }

  return true;
}

export function filterEligibleCartLines(
  lines: AbandonedCartLine[],
  covers: PaidOrderCover[],
  nowMs: number = Date.now(),
): AbandonedCartLine[] {
  return lines.filter((line) => isCartLineEligible(line, covers, nowMs));
}

export function computeCartFingerprint(lines: AbandonedCartLine[]): string {
  const tuples = lines
    .map(
      (l) =>
        `${l.product_id}:${variantKey(l.product_variant_id)}:${Math.max(1, Number(l.quantity ?? 1))}`,
    )
    .sort();
  return createHash("sha256").update(tuples.join("|")).digest("hex");
}

export function shouldSendAbandonedCartReminder(
  ledger: AbandonedCartLedgerRow | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const sendCount = ledger?.send_count ?? 0;
  if (sendCount >= ABANDONED_CART_MAX_SENDS) return false;
  if (sendCount === 0) return true;

  const lastSent = ledger?.last_sent_at;
  if (!lastSent) return true;
  const lastMs = Date.parse(lastSent);
  if (Number.isNaN(lastMs)) return true;
  return nowMs - lastMs >= ABANDONED_CART_MIN_GAP_MS;
}

export function buildItemSummary(firstProductName: string, totalItemCount: number): string {
  const name = firstProductName.trim() || "items";
  if (totalItemCount <= 1) return name;
  const more = totalItemCount - 1;
  return `${name} and ${more} more item${more === 1 ? "" : "s"}`;
}

export function totalCartQuantity(lines: AbandonedCartLine[]): number {
  return lines.reduce((sum, l) => sum + Math.max(1, Number(l.quantity ?? 1)), 0);
}

/** True when a channel actually proceeded (not fully suppressed or failed). */
export function countsAsAbandonedCartSend(result: {
  success?: boolean;
  notification_id?: string;
}): boolean {
  if (result.success !== true) return false;
  const id = result.notification_id ?? "";
  if (id === "suppressed-quiet-hours" || id === "suppressed-preferences") return false;
  return true;
}

export type AbandonedCartUserCandidate = {
  userId: string;
  providerId: string;
  fingerprint: string;
  lines: AbandonedCartLine[];
  itemSummary: string;
  itemCount: string;
};

export function groupAbandonedCartCandidates(
  lines: AbandonedCartLine[],
  covers: PaidOrderCover[],
  nowMs: number = Date.now(),
): AbandonedCartUserCandidate[] {
  const eligible = filterEligibleCartLines(lines, covers, nowMs);
  const byUser = new Map<string, AbandonedCartLine[]>();
  for (const line of eligible) {
    const list = byUser.get(line.user_id) ?? [];
    list.push(line);
    byUser.set(line.user_id, list);
  }

  const candidates: AbandonedCartUserCandidate[] = [];
  for (const [userId, userLines] of byUser) {
    const fingerprint = computeCartFingerprint(userLines);
    const count = totalCartQuantity(userLines);
    const firstName = userLines[0]?.product_name ?? "items";
    candidates.push({
      userId,
      providerId: userLines[0]?.provider_id ?? "",
      fingerprint,
      lines: userLines,
      itemSummary: buildItemSummary(firstName, count),
      itemCount: String(count),
    });
  }
  return candidates;
}
