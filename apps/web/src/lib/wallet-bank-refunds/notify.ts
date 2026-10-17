import { formatCurrency } from "@/lib/locale/currency";
import { slackNotifyWalletBankRefundRequested } from "@/lib/integrations/slack/ops-triggers";

export type WalletBankRefundEvent = "requested" | "approved" | "rejected" | "paid" | "cancelled";

type RequestLike = {
  id: string;
  user_id: string;
  tenant_id: string;
  request_number: string;
  amount: number | string;
  net_amount?: number | string | null;
  currency?: string | null;
  bank_name?: string | null;
  account_number_last4?: string | null;
  rejection_reason?: string | null;
  bank_transfer_reference?: string | null;
};

const TEMPLATE_BY_EVENT: Record<WalletBankRefundEvent, string> = {
  requested: "wallet_bank_refund_requested",
  approved: "wallet_bank_refund_approved",
  rejected: "wallet_bank_refund_rejected",
  paid: "wallet_bank_refund_paid",
  cancelled: "wallet_bank_refund_cancelled",
};

/** Customer email + push for each status change; Slack finance queue alert on submit. Never throws. */
export async function notifyWalletBankRefund(
  event: WalletBankRefundEvent,
  request: RequestLike,
): Promise<void> {
  const currency = request.currency || undefined;
  const amountLabel = formatCurrency(Number(request.amount), currency);
  const netLabel = formatCurrency(Number(request.net_amount ?? request.amount), currency);

  try {
    const { dispatchTemplateNotification, withTenantVariable } = await import(
      "@/lib/notifications/dispatch-template-notification"
    );
    await dispatchTemplateNotification(
      TEMPLATE_BY_EVENT[event],
      [request.user_id],
      withTenantVariable(request.tenant_id, {
        request_number: request.request_number,
        amount: amountLabel,
        net_amount: netLabel,
        bank_name: request.bank_name || "your bank",
        account_last4: request.account_number_last4 || "",
        reason: request.rejection_reason ? `Reason: ${request.rejection_reason}` : "",
        payout_reference: request.bank_transfer_reference || "",
      }),
      ["push", "email"],
      { appType: "customer" },
    );
  } catch (err) {
    console.error("[wallet-bank-refund] customer notification failed", { event, id: request.id, err });
  }

  if (event === "requested") {
    slackNotifyWalletBankRefundRequested({
      tenantId: request.tenant_id,
      requestId: request.id,
      requestNumber: request.request_number,
      amountLabel,
      netLabel,
    });
  }
}
