import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { canUseMarketingChannel } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const bodySchema = z.object({
  type: z.enum(["email", "sms", "whatsapp"]),
  subject: z.string().max(998).optional(),
  content: z.string().min(1).max(20000),
  to: z.string().min(1).max(320),
});

/**
 * POST /api/provider/campaigns/test-send
 *
 * Send a one-off test of the campaign content to a single recipient (defaults
 * to the provider's own contact). Resolves merge tags against the recipient and
 * debits a single platform credit when the platform sending path is used, with
 * automatic refund on failure — same money invariants as a real send.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("Invalid test send payload", "VALIDATION_ERROR", 400);
    }
    const { type, subject, content, to } = parsed.data;

    const canUseChannel = await canUseMarketingChannel(providerId, type, supabase);
    if (!canUseChannel) {
      return errorResponse(
        `${type === "email" ? "Email" : type === "sms" ? "SMS" : "WhatsApp"} campaigns require a subscription upgrade.`,
        "SUBSCRIPTION_REQUIRED",
        403,
      );
    }

    const { data: providerRow } = await supabase
      .from("providers")
      .select("tenant_id, business_name")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const businessName =
      (providerRow as { business_name?: string | null } | null)?.business_name ?? null;

    const { substituteMergeTags } = await import("@/lib/marketing/merge-tags");
    const mergeValues = {
      customer_name: (user.user_metadata?.full_name as string) || "there",
      first_name: (user.user_metadata?.full_name as string) || "there",
      business_name: businessName,
    };
    const personalizedContent = substituteMergeTags(content, mergeValues);
    const personalizedSubject = substituteMergeTags(subject || "Test message", mergeValues);

    const { sendMessage } = await import("@/lib/marketing/unified-service");
    const { resolveMarketingSendingContext } = await import("@/lib/marketing/sending-path");
    const { debitMarketingBalance, getMarketingBalance, priceFor, creditMarketingBalance } =
      await import("@/lib/marketing/credits");

    const sendCtx = await resolveMarketingSendingContext(providerId, type, supabase);
    const debitsCredits = sendCtx.debitsCredits;

    const category = type === "whatsapp" ? "marketing" : "default";
    let debitedAmount = 0;
    const debitKey = `campaign_test:${providerId}:${type}:${Date.now()}`;

    if (debitsCredits) {
      const unitCost = await priceFor(supabase, type, category);
      const balance = await getMarketingBalance(supabase, providerId);
      if (balance.total_zar < unitCost) {
        return errorResponse(
          `Insufficient marketing credit for a test send. Need ~R${unitCost.toFixed(2)}, have R${balance.total_zar.toFixed(2)}.`,
          "INSUFFICIENT_CREDIT",
          402,
        );
      }
      const debit = await debitMarketingBalance({
        providerId,
        amountZar: unitCost,
        reason: "campaign_send",
        idempotencyKey: debitKey,
        channel: type,
        category,
        supabase,
      });
      if (!debit.ok) {
        return errorResponse(
          "reason" in debit ? debit.reason : "Could not reserve marketing credit",
          "DEBIT_FAILED",
          402,
        );
      }
      debitedAmount = unitCost;
    }

    const result = await sendMessage(providerId, type, {
      to,
      subject: personalizedSubject,
      content: personalizedContent,
      fromName: businessName || "Test",
      tenantId,
      supabase,
      metadata: { test_send: true },
    });

    if (!result.success) {
      if (debitedAmount > 0) {
        await creditMarketingBalance({
          providerId,
          amountZar: debitedAmount,
          reason: "refund",
          idempotencyKey: `refund:${debitKey}`,
          channel: type,
          metadata: { refund_reason: "test_send_failed", error: result.error ?? null },
          supabase,
        });
      }
      return errorResponse(result.error || "Test send failed", "SEND_FAILED", 502);
    }

    return successResponse({ message: `Test ${type} sent to ${to}`, sent: true });
  } catch (error) {
    console.error("Error sending test campaign:", error);
    return handleApiError(error, "Failed to send test message");
  }
}
