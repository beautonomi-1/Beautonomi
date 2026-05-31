/**
 * Gift-card recipient delivery.
 *
 * When a buyer sets a `recipient_email` on a gift card order, we deliver the
 * code(s) directly to that person after payment succeeds — regardless of whether
 * they already have a Beautonomi account:
 *
 *   • Email — always sent (queued via Resend), so a non-user recipient still
 *     receives the code + clear redemption instructions.
 *   • Push + in-app — additionally sent when the recipient is a registered user,
 *     so the gift also surfaces inside the app. (The card already appears in a
 *     registered recipient's wallet list because GET /api/me/gift-cards matches
 *     on metadata.recipient_email.)
 *
 * Everything here is best-effort: a delivery failure must never block card
 * issuance, so callers should wrap this in try/catch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueNotification } from "@/lib/notifications/enqueue";

const BRAND_NAME = "Beautonomi";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function deliverGiftCardToRecipient(params: {
  supabase: SupabaseClient;
  orderId: string;
  recipientEmail: string;
  recipientName?: string | null;
  message?: string | null;
  purchaserUserId?: string | null;
  codes: string[];
  perCardAmount: number;
  currency: string;
  tenantId: string | null;
}): Promise<void> {
  const recipientEmail = (params.recipientEmail || "").trim().toLowerCase();
  const codes = params.codes.filter((c) => typeof c === "string" && c.trim().length > 0);
  if (!recipientEmail || codes.length === 0) return;

  const supabase = params.supabase;

  // Resolve the recipient and purchaser accounts (best-effort).
  const [{ data: recipientUser }, { data: purchaserUser }] = await Promise.all([
    supabase.from("users").select("id, email").eq("email", recipientEmail).maybeSingle(),
    params.purchaserUserId
      ? supabase.from("users").select("full_name, email").eq("id", params.purchaserUserId).maybeSingle()
      : Promise.resolve({ data: null as { full_name?: string | null; email?: string | null } | null }),
  ]);

  // Don't send a "you received a gift" email to the buyer themselves when they
  // bought it for their own account — they already get the purchaser receipt.
  const purchaserEmail = (purchaserUser as { email?: string | null } | null)?.email?.trim().toLowerCase();
  if (purchaserEmail && purchaserEmail === recipientEmail) return;

  const recipientUserId = (recipientUser as { id?: string } | null)?.id ?? null;
  const senderName =
    ((purchaserUser as { full_name?: string | null } | null)?.full_name || "").trim() || "Someone";
  const recipientName = (params.recipientName || "").trim();

  const moneyLabel = `${params.currency} ${Number(params.perCardAmount).toFixed(2)}`;
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const singleCode = codes.length === 1 ? codes[0] : null;
  const redeemUrl = appBase
    ? singleCode
      ? `${appBase}/account-settings/wallet?giftCode=${encodeURIComponent(singleCode)}`
      : `${appBase}/account-settings/wallet`
    : "";

  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const valuePlural = codes.length > 1 ? `${codes.length} gift cards` : "a gift card";
  const subject =
    codes.length > 1
      ? `${senderName} sent you ${codes.length} ${BRAND_NAME} gift cards`
      : `${senderName} sent you a ${BRAND_NAME} gift card`;

  const codesHtml = codes
    .map(
      (code) =>
        `<div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:1px;background:#FDF2F8;border:1px solid #F5D0E5;border-radius:10px;padding:14px 16px;margin:8px 0;color:#111827;">${escapeHtml(
          code,
        )}</div>`,
    )
    .join("");

  const messageHtml = params.message?.trim()
    ? `<p style="margin:16px 0;padding:12px 16px;background:#F9FAFB;border-left:3px solid #DB2777;border-radius:6px;color:#374151;font-style:italic;">“${escapeHtml(
        params.message.trim(),
      )}”</p>`
    : "";

  const ctaHtml = redeemUrl
    ? `<p style="margin:24px 0;"><a href="${redeemUrl}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">Add to my wallet</a></p>`
    : "";

  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      <h2 style="font-size:22px;margin:0 0 8px;">🎁 ${escapeHtml(senderName)} sent you ${valuePlural}!</h2>
      <p style="color:#6B7280;margin:0 0 16px;">${greeting}</p>
      ${messageHtml}
      <p style="margin:0 0 6px;color:#6B7280;font-size:14px;">Gift card value: <strong style="color:#111827;">${moneyLabel}</strong>${
        codes.length > 1 ? ` each (${codes.length} cards)` : ""
      }</p>
      <p style="margin:16px 0 6px;color:#6B7280;font-size:14px;">Your code${codes.length > 1 ? "s" : ""}:</p>
      ${codesHtml}
      ${ctaHtml}
      <p style="color:#6B7280;font-size:13px;line-height:1.5;margin-top:20px;">
        How to redeem: open the ${BRAND_NAME} app or website, go to
        <strong>Wallet → Gift Card</strong>, and enter the code above to add the balance to your wallet —
        or apply it at checkout. No ${BRAND_NAME} account yet? Create one with this email address and your
        gift will be waiting for you.
      </p>
    </div>`;

  const textLines = [
    `${senderName} sent you ${valuePlural}!`,
    "",
    params.message?.trim() ? `"${params.message.trim()}"` : null,
    `Value: ${moneyLabel}${codes.length > 1 ? " each" : ""}`,
    "",
    `Code${codes.length > 1 ? "s" : ""}: ${codes.join(", ")}`,
    "",
    `How to redeem: open ${BRAND_NAME}, go to Wallet → Gift Card, and enter the code to add it to your wallet — or use it at checkout.`,
    redeemUrl ? `Redeem: ${redeemUrl}` : null,
  ].filter((l): l is string => l !== null);

  // 1) Email — guaranteed delivery to any address (registered or not).
  await enqueueNotification(
    {
      channel: "email",
      templateKey: "gift_card_received",
      recipientUserId,
      payload: {
        to: recipientEmail,
        subject,
        html,
        body: textLines.join("\n"),
      },
      dedupeKey: `gift_card:received:email:${params.orderId}`,
      tenantId: params.tenantId,
    },
    supabase,
  );

  // 2) Registered recipient → also nudge in-app via push (best-effort).
  if (recipientUserId) {
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        recipientUserId,
        {
          title: codes.length > 1 ? `You received ${codes.length} gift cards!` : "You received a gift card!",
          message:
            codes.length > 1
              ? `${senderName} sent you ${codes.length} gift cards worth ${moneyLabel} each. Tap to redeem.`
              : `${senderName} sent you a gift card worth ${moneyLabel}. Tap to redeem.`,
          data: { type: "gift_card_received", codes },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" },
      );
    } catch {
      // push is best-effort; email already covers delivery.
    }
  }
}
