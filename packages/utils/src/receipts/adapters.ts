import { formatPaymentMethodLabel } from "./format-payment-method-label";
import { formatPostalAddress } from "./format-share-text";
import type {
  ReceiptLineItem,
  ReceiptMoneyLine,
  ReceiptParty,
  ReceiptShareModel,
} from "./share-model";

type LooseRecord = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function pushMoney(lines: ReceiptMoneyLine[], label: string, amount: unknown, tone?: ReceiptMoneyLine["tone"]) {
  const n = num(amount);
  if (Math.abs(n) < 0.0001) return;
  lines.push({ label, amount: tone === "discount" ? Math.abs(n) : n, tone });
}

function mapBookingPayments(
  transactions: unknown,
  currency: string,
): ReceiptShareModel["payments"] {
  if (!Array.isArray(transactions)) return [];
  return transactions
    .filter((t) => {
      const row = t as LooseRecord;
      const status = String(row.status ?? "").toLowerCase();
      return status === "completed" || status === "paid" || status === "success";
    })
    .map((t) => {
      const row = t as LooseRecord;
      const method = formatPaymentMethodLabel(
        str(row.payment_method),
        str(row.payment_provider),
      );
      return {
        label: method,
        amount: num(row.amount),
        detail: str(row.created_at)
          ? new Date(String(row.created_at)).toLocaleDateString()
          : null,
      };
    });
}

function bookingLineItemsFromCustomerReceipt(receipt: LooseRecord): ReceiptLineItem[] {
  const items: ReceiptLineItem[] = [];
  const pushRows = (rows: unknown, defaultLabel: string) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const r = row as LooseRecord;
      const qty = num(r.quantity, 1);
      const unit = num(r.price ?? r.unit_price);
      const total = num(r.total ?? r.total_price, unit * qty);
      const metaParts: string[] = [];
      if (str(r.staff)) metaParts.push(`Staff: ${r.staff}`);
      if (r.duration != null) metaParts.push(`${r.duration} min`);
      items.push({
        description: str(r.name ?? r.description) ?? defaultLabel,
        quantity: qty,
        unitPrice: unit,
        lineTotal: total,
        meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
      });
    }
  };
  pushRows(receipt.services, "Service");
  pushRows(receipt.addons, "Add-on");
  pushRows(receipt.products, "Product");
  return items;
}

function bookingLineItemsFromProviderReceipt(receipt: LooseRecord): ReceiptLineItem[] {
  if (!Array.isArray(receipt.items)) return [];
  return (receipt.items as LooseRecord[]).map((r) => {
    const qty = num(r.quantity, 1);
    const unit = num(r.unit_price ?? r.price);
    const total = num(r.total, unit * qty);
    const metaParts: string[] = [];
    if (str(r.staff)) metaParts.push(`Staff: ${r.staff}`);
    if (r.duration != null) metaParts.push(`${r.duration} min`);
    return {
      description: str(r.description ?? r.name) ?? "Item",
      quantity: qty,
      unitPrice: unit,
      lineTotal: total,
      meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
    };
  });
}

function bookingMoneyLines(receipt: LooseRecord, useProviderNames: boolean): ReceiptMoneyLine[] {
  const lines: ReceiptMoneyLine[] = [];
  pushMoney(lines, "Subtotal", receipt.subtotal);
  pushMoney(lines, "Tax", useProviderNames ? receipt.tax_amount : receipt.tax);
  pushMoney(
    lines,
    "Platform fee",
    useProviderNames ? receipt.platform_fee_amount : receipt.platform_fee_amount ?? receipt.fees,
  );
  pushMoney(lines, "Travel fee", receipt.travel_fee);
  pushMoney(lines, "Tip", receipt.tip_amount);
  pushMoney(lines, "Cancellation fee", receipt.cancellation_fee);
  pushMoney(
    lines,
    "Discount",
    useProviderNames ? receipt.discount_amount : receipt.discount,
    "discount",
  );
  pushMoney(lines, "Promotion discount", receipt.promotion_discount_amount, "discount");
  pushMoney(lines, "Membership discount", receipt.membership_discount_amount, "discount");
  pushMoney(lines, "Loyalty discount", receipt.loyalty_discount_amount, "discount");
  pushMoney(lines, "Package discount", receipt.package_discount_amount, "discount");
  if (num(receipt.wallet_amount) > 0) {
    pushMoney(lines, "Wallet credit", receipt.wallet_amount, "discount");
  }
  if (num(receipt.gift_card_amount) > 0) {
    pushMoney(lines, "Gift card", receipt.gift_card_amount, "discount");
  }
  return lines;
}

function visitTypeFromLocation(locationType: unknown): string | null {
  const t = String(locationType ?? "").toLowerCase();
  if (t === "at_home" || t === "house_call" || t === "at-home") return "House call";
  if (t === "at_salon" || t === "in_salon") return "In-salon";
  return locationType ? String(locationType) : null;
}

export function bookingShareModelFromCustomerReceipt(
  receipt: LooseRecord,
  opts?: { deepLink?: string | null },
): ReceiptShareModel {
  const currency = str(receipt.currency) ?? "ZAR";
  const provider = (receipt.provider ?? {}) as LooseRecord;
  const customer = (receipt.customer ?? {}) as LooseRecord;
  const parties: ReceiptParty[] = [];
  if (str(provider.business_name)) {
    parties.push({ label: "Provider", name: str(provider.business_name) });
  }
  if (str(customer.full_name)) {
    parties.push({ label: "Customer", name: str(customer.full_name) });
  }

  const serviceAddress = receipt.service_address as LooseRecord | null | undefined;
  const location =
    formatPostalAddress(serviceAddress) ??
    formatPostalAddress(provider.address as LooseRecord | null | undefined);

  const total = num(receipt.total);
  const balanceDue = num(receipt.balance_due);
  const totalRefunded = num(receipt.total_refunded);

  return {
    kind: "booking",
    audience: "customer",
    reference: str(receipt.booking_number) ?? "—",
    title: "Beautonomi Booking",
    status: str(receipt.status),
    paymentStatus: str(receipt.payment_status),
    when: str(receipt.service_date ?? receipt.booking_date),
    whenLabel: "Appointment",
    parties,
    location,
    visitType: visitTypeFromLocation(receipt.location_type),
    lineItems: bookingLineItemsFromCustomerReceipt(receipt),
    moneyLines: bookingMoneyLines(receipt, false),
    payments: mapBookingPayments(receipt.transactions, currency),
    balanceDue: balanceDue > 0.01 ? balanceDue : null,
    total,
    currency,
    refund:
      totalRefunded > 0
        ? { amount: totalRefunded }
        : null,
    deepLink: opts?.deepLink ?? null,
    groupBookingRef: str(receipt.group_booking_ref),
    deposit: receipt.deposit_required
      ? {
          required: true,
          amount: num(receipt.deposit_amount) || null,
          percentage: num(receipt.deposit_percentage) || null,
          option: str(receipt.payment_option),
        }
      : null,
  };
}

export function bookingShareModelFromProviderReceipt(
  receipt: LooseRecord,
  opts?: { deepLink?: string | null },
): ReceiptShareModel {
  const currency = str(receipt.currency) ?? "ZAR";
  const provider = (receipt.provider ?? {}) as LooseRecord;
  const customer = (receipt.customer ?? {}) as LooseRecord;
  const parties: ReceiptParty[] = [];
  if (str(provider.name ?? provider.business_name)) {
    parties.push({
      label: "Provider",
      name: str(provider.name ?? provider.business_name),
      email: str(provider.email),
      phone: str(provider.phone),
      address: formatPostalAddress(provider.address as LooseRecord | null | undefined),
    });
  }
  if (str(customer.name ?? customer.full_name)) {
    parties.push({
      label: "Customer",
      name: str(customer.name ?? customer.full_name),
      email: str(customer.email),
      phone: str(customer.phone),
    });
  }

  const total = num(receipt.total_amount ?? receipt.total);
  const balanceDue = num(receipt.balance_due);
  const totalRefunded = num(receipt.total_refunded);

  const participants = Array.isArray(receipt.group_participants)
    ? (receipt.group_participants as unknown[])
        .map((p) => {
          if (typeof p === "string") return p;
          const row = p as LooseRecord;
          return str(row.participant_name ?? row.name);
        })
        .filter(Boolean) as string[]
    : null;

  return {
    kind: "booking",
    audience: "provider",
    reference: str(receipt.invoice_number ?? receipt.booking_number) ?? "—",
    title: "Beautonomi Booking",
    status: str(receipt.status),
    paymentStatus: str(receipt.payment_status),
    when: str(receipt.booking_date ?? receipt.service_date),
    whenLabel: "Appointment",
    parties,
    location:
      formatPostalAddress(receipt.service_address as LooseRecord | null | undefined) ??
      formatPostalAddress(provider.address as LooseRecord | null | undefined),
    visitType: visitTypeFromLocation(receipt.location_type),
    lineItems: bookingLineItemsFromProviderReceipt(receipt),
    moneyLines: bookingMoneyLines(receipt, true),
    payments: mapBookingPayments(receipt.transactions, currency),
    balanceDue: balanceDue > 0.01 ? balanceDue : null,
    total,
    currency,
    refund: totalRefunded > 0 ? { amount: totalRefunded } : null,
    deepLink: opts?.deepLink ?? null,
    referralSource: str(receipt.referral_source_name),
    bookingSource: str(receipt.booking_source),
    groupBookingRef: str(receipt.group_booking_ref),
    groupParticipants: participants,
    notes: str(receipt.notes),
    deposit: receipt.deposit_required
      ? {
          required: true,
          amount: num(receipt.deposit_amount) || null,
          percentage: num(receipt.deposit_percentage) || null,
          option: str(receipt.payment_option),
        }
      : null,
  };
}

function orderLineItems(receipt: LooseRecord): ReceiptLineItem[] {
  if (!Array.isArray(receipt.items)) return [];
  return (receipt.items as LooseRecord[]).map((it) => {
    const qty = num(it.quantity, 1);
    const unit = num(it.price ?? it.unit_price);
    const total = num(it.line_total ?? it.total ?? it.total_price, unit * qty);
    const variant = str(it.variant_label ?? it.variant);
    return {
      description: str(it.name ?? it.product_name) ?? "Product",
      quantity: qty,
      unitPrice: unit,
      lineTotal: total,
      meta: variant ? `Variant: ${variant}` : null,
    };
  });
}

function orderMoneyLines(receipt: LooseRecord): ReceiptMoneyLine[] {
  const lines: ReceiptMoneyLine[] = [];
  pushMoney(lines, "Subtotal", receipt.subtotal);
  pushMoney(lines, "Tax", receipt.tax ?? receipt.tax_amount);
  pushMoney(lines, "Delivery", receipt.delivery_fee);
  pushMoney(lines, "Discount", receipt.discount ?? receipt.discount_amount, "discount");
  pushMoney(lines, "Platform fee", receipt.platform_fee);
  pushMoney(lines, "Wallet credit", receipt.wallet_amount, "discount");
  return lines;
}

function orderFulfillment(receipt: LooseRecord): ReceiptShareModel["fulfillment"] {
  const type = str(receipt.fulfillment_type);
  const deliveryAddr = formatPostalAddress(receipt.delivery_address as LooseRecord | null | undefined);
  const collectionLoc = formatPostalAddress(receipt.collection_location as LooseRecord | null | undefined);
  return {
    type: type === "delivery" ? "Delivery" : type === "collection" ? "Collection" : type,
    address: deliveryAddr ?? collectionLoc,
    trackingNumber: str(receipt.tracking_number),
    carrier: str(receipt.carrier),
    trackingUrl: str(receipt.tracking_url),
    estimatedDelivery: str(receipt.estimated_delivery_date),
    instructions: str(receipt.delivery_instructions),
  };
}

export function orderShareModelFromReceipt(
  receipt: LooseRecord,
  opts: { audience: "customer" | "provider"; deepLink?: string | null },
): ReceiptShareModel {
  const currency = str(receipt.currency) ?? "ZAR";
  const provider = (receipt.provider ?? {}) as LooseRecord;
  const customer = (receipt.customer ?? {}) as LooseRecord;
  const parties: ReceiptParty[] = [];

  if (str(provider.business_name)) {
    parties.push({
      label: "Seller",
      name: str(provider.business_name),
      email: str(provider.email ?? provider.owner_email),
      phone: str(provider.phone),
    });
  }

  const walkInName = str(receipt.customer_name);
  const walkInPhone = str(receipt.customer_phone);
  if (str(customer.full_name)) {
    parties.push({
      label: "Customer",
      name: str(customer.full_name),
      email: str(customer.email),
      phone: str(customer.phone),
    });
  } else if (walkInName || walkInPhone) {
    parties.push({
      label: "Customer",
      name: walkInName,
      phone: walkInPhone,
    });
  }

  const total = num(receipt.total ?? receipt.total_amount);
  const amountPaid = num(receipt.amount_paid);
  const balanceDue = num(receipt.balance_due);
  const refunded = num(receipt.refunded_amount ?? receipt.total_refunded);
  const walletAmt = num(receipt.wallet_amount);

  const payments: ReceiptShareModel["payments"] = [];
  if (walletAmt > 0.01) {
    payments.push({ label: "Wallet", amount: walletAmt });
  }
  const method = str(receipt.payment_method);
  const nonWalletPaid = Math.max(0, amountPaid - walletAmt);
  if (method && nonWalletPaid > 0.01) {
    payments.push({
      label: formatPaymentMethodLabel(method, str(receipt.payment_provider)),
      amount: nonWalletPaid,
      detail: str(receipt.payment_reference),
    });
  } else if (method && amountPaid > 0.01 && walletAmt <= 0.01) {
    payments.push({
      label: formatPaymentMethodLabel(method, str(receipt.payment_provider)),
      amount: amountPaid,
      detail: str(receipt.payment_reference),
    });
  } else if (Array.isArray(receipt.payments)) {
    for (const p of receipt.payments as LooseRecord[]) {
      payments.push({
        label: formatPaymentMethodLabel(str(p.payment_method), str(p.payment_provider)),
        amount: num(p.amount),
        detail: str(p.payment_reference),
      });
    }
  }

  return {
    kind: "order",
    audience: opts.audience,
    reference: str(receipt.order_number) ?? "—",
    title: "Beautonomi Order",
    status: str(receipt.status),
    paymentStatus: str(receipt.payment_status),
    when: str(receipt.order_date ?? receipt.created_at),
    whenLabel: "Placed",
    parties,
    lineItems: orderLineItems(receipt),
    moneyLines: orderMoneyLines(receipt),
    payments,
    balanceDue: balanceDue > 0.01 ? balanceDue : null,
    total,
    currency,
    fulfillment: orderFulfillment(receipt),
    refund:
      refunded > 0
        ? {
            amount: refunded,
            reason: str(receipt.refund_reason),
            method: str(receipt.refund_method),
            date: str(receipt.refunded_at),
          }
        : null,
    deepLink: opts.deepLink ?? null,
    notes: opts.audience === "provider" ? str(receipt.notes) : null,
  };
}

export function saleShareModelFromReceipt(
  receipt: LooseRecord,
  opts?: { deepLink?: string | null },
): ReceiptShareModel {
  const currency = str(receipt.currency) ?? "ZAR";
  const provider = (receipt.provider ?? {}) as LooseRecord;
  const customer = (receipt.customer ?? {}) as LooseRecord;
  const parties: ReceiptParty[] = [];

  if (str(provider.name ?? provider.business_name)) {
    parties.push({
      label: "Provider",
      name: str(provider.name ?? provider.business_name),
    });
  }
  if (str(customer.name ?? customer.full_name)) {
    parties.push({ label: "Customer", name: str(customer.name ?? customer.full_name) });
  } else if (receipt.is_walk_in) {
    parties.push({ label: "Customer", name: "Walk-in" });
  }

  const lines: ReceiptMoneyLine[] = [];
  pushMoney(lines, "Subtotal", receipt.subtotal);
  pushMoney(lines, "Tax", receipt.tax_amount ?? receipt.tax);
  pushMoney(lines, "Discount", receipt.discount_amount, "discount");
  pushMoney(lines, "Tip", receipt.tip_amount);

  const method = str(receipt.payment_method);
  const total = num(receipt.total_amount ?? receipt.total);
  const amountPaid = num(receipt.amount_paid, total);
  const balanceDue = num(receipt.balance_due);

  const payments: ReceiptShareModel["payments"] = [];
  if (method) {
    payments.push({
      label: formatPaymentMethodLabel(method, str(receipt.payment_provider)),
      amount: amountPaid,
    });
  }

  const staffName = str(receipt.staff);
  if (staffName) {
    parties.push({ label: "Staff", name: staffName });
  }
  if (str(customer.email)) {
    const existing = parties.find((p) => p.label === "Customer");
    if (existing) existing.email = str(customer.email);
  }
  if (str(customer.phone)) {
    const existing = parties.find((p) => p.label === "Customer");
    if (existing) existing.phone = str(customer.phone);
  }

  return {
    kind: "sale",
    audience: "provider",
    reference: str(receipt.sale_number ?? receipt.ref_number ?? receipt.invoice_number) ?? "—",
    title: "Beautonomi Sale Receipt",
    status: str(receipt.payment_status ?? receipt.status),
    when: str(receipt.sale_date ?? receipt.created_at),
    whenLabel: "Sale date",
    parties,
    lineItems: Array.isArray(receipt.items)
      ? (receipt.items as LooseRecord[]).map((it) => {
          const qty = num(it.quantity, 1);
          const unit = num(it.unit_price ?? it.price);
          return {
            description: str(it.item_name ?? it.name ?? it.description) ?? "Item",
            quantity: qty,
            unitPrice: unit,
            lineTotal: num(it.total_price ?? it.total, unit * qty),
            meta: str(it.item_type) ? `Type: ${it.item_type}` : null,
          };
        })
      : [],
    moneyLines: lines,
    payments,
    balanceDue: balanceDue > 0.01 ? balanceDue : null,
    total,
    currency,
    deepLink: opts?.deepLink ?? null,
    notes: str(receipt.notes),
  };
}
