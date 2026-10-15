import {
  isValidSupportTicketCategory,
  normalizeSupportTicketCategory,
} from "@/lib/support/ticket-categories";

const KEYWORD_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /refund|chargeback|billing|invoice|payment|paystack|wallet/i, category: "payment_refund" },
  { pattern: /booking|appointment|reschedule|cancel|no[- ]?show/i, category: "booking_issue" },
  { pattern: /payout|provider.*pay|commission/i, category: "provider_payouts" },
  { pattern: /fraud|scam|harass|unsafe|abuse/i, category: "safety_fraud" },
  { pattern: /gift card/i, category: "payment_gift_card" },
  { pattern: /order|shipping|delivery|product/i, category: "order_status_shipping" },
  { pattern: /sign.?in|password|login|verify/i, category: "account_sign_in" },
  { pattern: /bug|crash|error|app/i, category: "tech_bug_error" },
];

export function resolveEmailTicketCategory(params: {
  defaultCategory: string | null | undefined;
  subject: string;
  body: string;
}): string {
  const def = params.defaultCategory?.trim();
  if (def && isValidSupportTicketCategory(def)) {
    return def;
  }
  const text = `${params.subject}\n${params.body}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text) && isValidSupportTicketCategory(rule.category)) {
      return rule.category;
    }
  }
  return normalizeSupportTicketCategory(null);
}
