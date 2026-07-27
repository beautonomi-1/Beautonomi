import { formatMoney } from "../money";
import type {
  ReceiptAudience,
  ReceiptLineItem,
  ReceiptMoneyLine,
  ReceiptParty,
  ReceiptShareModel,
} from "./share-model";

function fmt(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const line = parts.filter(Boolean).join(", ");
  return line || null;
}

function partyLines(parties: ReceiptParty[]): string[] {
  const lines: string[] = [];
  for (const p of parties) {
    if (p.name) lines.push(`${p.label}: ${p.name}`);
    if (p.email) lines.push(`${p.label} email: ${p.email}`);
    if (p.phone) lines.push(`${p.label} phone: ${p.phone}`);
    if (p.address) lines.push(`${p.label} address: ${p.address}`);
  }
  return lines;
}

function lineItemText(item: ReceiptLineItem, currency: string): string[] {
  const qty = item.quantity > 1 ? `${item.quantity} × ` : "";
  const lines = [
    `• ${item.description} — ${qty}${fmt(item.unitPrice, currency)} = ${fmt(item.lineTotal, currency)}`,
  ];
  if (item.meta) lines.push(`  ${item.meta}`);
  return lines;
}

function moneyLineText(line: ReceiptMoneyLine, currency: string): string {
  const prefix = line.tone === "discount" && line.amount > 0 ? "-" : "";
  return `${line.label}: ${prefix}${fmt(Math.abs(line.amount), currency)}`;
}

function isProviderAudience(audience: ReceiptAudience): boolean {
  return audience === "provider";
}

/**
 * Render a multi-line share/receipt summary from a canonical model.
 * Provider-internal fields are suppressed for customer audience.
 */
export function formatReceiptShareText(model: ReceiptShareModel): string {
  const { currency, audience } = model;
  const lines: string[] = [model.title, `${model.kind === "order" ? "Order" : model.kind === "sale" ? "Sale" : "Booking"} #${model.reference}`, ""];

  if (model.status) lines.push(`Status: ${model.status}`);
  if (model.paymentStatus) lines.push(`Payment: ${model.paymentStatus}`);

  const when = formatWhen(model.when);
  if (when) lines.push(`${model.whenLabel ?? "When"}: ${when}`);

  if (model.visitType) lines.push(`Visit: ${model.visitType}`);
  if (model.location) lines.push(`Location: ${model.location}`);

  if (model.groupBookingRef) lines.push(`Group reference: ${model.groupBookingRef}`);

  if (isProviderAudience(audience) && model.referralSource) {
    lines.push(`Client source: ${model.referralSource}`);
  }
  if (isProviderAudience(audience) && model.bookingSource) {
    lines.push(`Booking channel: ${model.bookingSource}`);
  }

  const partyBlock = partyLines(model.parties);
  if (partyBlock.length > 0) {
    lines.push("", ...partyBlock);
  }

  if (
    isProviderAudience(audience) &&
    model.groupParticipants &&
    model.groupParticipants.length > 0
  ) {
    lines.push("", "Participants:");
    for (const p of model.groupParticipants) lines.push(`• ${p}`);
  }

  if (model.lineItems.length > 0) {
    lines.push("", "Items:");
    for (const item of model.lineItems) {
      lines.push(...lineItemText(item, currency));
    }
  }

  const visibleMoney = model.moneyLines.filter((m) => Math.abs(m.amount) > 0.0001);
  if (visibleMoney.length > 0) {
    lines.push("");
    for (const m of visibleMoney) lines.push(moneyLineText(m, currency));
  }

  lines.push("", `Total: ${fmt(model.total, currency)}`);

  if (model.deposit?.required) {
    const depParts: string[] = [];
    if (model.deposit.amount != null) depParts.push(fmt(model.deposit.amount, currency));
    if (model.deposit.percentage != null) depParts.push(`${model.deposit.percentage}%`);
    if (depParts.length > 0) lines.push(`Deposit${model.deposit.option === "deposit" ? "" : ""}: ${depParts.join(" · ")}`);
  }

  if (model.payments.length > 0) {
    lines.push("", "Paid via:");
    for (const p of model.payments) {
      const detail = p.detail ? ` (${p.detail})` : "";
      lines.push(`• ${p.label}${detail}: ${fmt(p.amount, currency)}`);
    }
  }

  if (model.refund && model.refund.amount > 0) {
    lines.push(`Refunded: ${fmt(model.refund.amount, currency)}`);
    if (model.refund.reason) lines.push(`Refund reason: ${model.refund.reason}`);
    if (model.refund.method) lines.push(`Refund method: ${model.refund.method}`);
  }

  if (model.balanceDue != null && model.balanceDue > 0.01) {
    lines.push(`Balance due: ${fmt(model.balanceDue, currency)}`);
  }

  if (model.fulfillment) {
    const f = model.fulfillment;
    if (f.type) lines.push("", `Fulfillment: ${f.type}`);
    if (f.address) lines.push(`Address: ${f.address}`);
    if (f.trackingNumber) {
      const carrier = f.carrier ? `${f.carrier} · ` : "";
      lines.push(`Tracking: ${carrier}${f.trackingNumber}`);
    }
    if (f.trackingUrl) lines.push(`Track: ${f.trackingUrl}`);
    if (f.estimatedDelivery) lines.push(`Estimated delivery: ${formatWhen(f.estimatedDelivery) ?? f.estimatedDelivery}`);
    if (f.instructions) lines.push(`Instructions: ${f.instructions}`);
  }

  if (isProviderAudience(audience) && model.notes) {
    lines.push("", `Notes: ${model.notes}`);
  }

  if (model.deepLink) {
    lines.push("", `View online: ${model.deepLink}`);
  }

  return lines.join("\n");
}

/** Format a postal address object into a single line. */
export function formatPostalAddress(addr: {
  line1?: string | null;
  line2?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  name?: string | null;
} | null | undefined): string | null {
  if (!addr) return null;
  const line1 = addr.line1 ?? addr.address_line1;
  const line2 = addr.line2 ?? addr.address_line2;
  const cityLine = formatAddress([addr.city, addr.state, addr.postal_code]);
  const parts = [addr.name, line1, line2, cityLine, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
