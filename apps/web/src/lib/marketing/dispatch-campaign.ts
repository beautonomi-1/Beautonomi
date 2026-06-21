/**
 * Shared campaign dispatch pipeline.
 *
 * Single source of truth for sending a marketing campaign so the manual send
 * route (`POST /api/provider/campaigns/[id]/send`) and the scheduled-campaign
 * cron both apply identical plan gating, recipient resolution, merge-tag
 * personalization, and the debit-before-send / refund-on-failure money
 * invariants. The campaign must already exist and belong to `providerId`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays, startOfDay, startOfMonth } from "date-fns";
import { fromBusinessTime, nowInTz, resolveTz } from "@/lib/dates/provider-tz";
import { checkMarketingFeatureAccess, canUseMarketingChannel } from "@/lib/subscriptions/feature-access";

export type DispatchableCampaign = {
  id: string;
  provider_id: string;
  type: "email" | "sms" | "whatsapp";
  name: string;
  subject?: string | null;
  content: string;
  recipient_type: "all_clients" | "segment" | "custom";
  recipient_ids?: string[] | null;
  segment_criteria?: Record<string, unknown> | null;
  status: string;
};

export type DispatchResult = {
  ok: boolean;
  sentCount?: number;
  failedCount?: number;
  errors?: string[];
  code?: string;
  status?: number;
  message?: string;
};

async function getSegmentRecipients(
  supabase: SupabaseClient<any>,
  providerId: string,
  tz: string,
  criteria: {
    min_bookings?: number;
    max_bookings?: number;
    min_spent?: number;
    max_spent?: number;
    last_booking_days?: number;
    tags?: string[];
    is_favorite?: boolean;
  },
): Promise<string[]> {
  let query = supabase
    .from("provider_clients")
    .select("customer_id")
    .eq("provider_id", providerId);

  if (criteria.min_bookings !== undefined) query = query.gte("total_bookings", criteria.min_bookings);
  if (criteria.max_bookings !== undefined) query = query.lte("total_bookings", criteria.max_bookings);
  if (criteria.min_spent !== undefined) query = query.gte("total_spent", criteria.min_spent);
  if (criteria.max_spent !== undefined) query = query.lte("total_spent", criteria.max_spent);
  if (criteria.is_favorite !== undefined) query = query.eq("is_favorite", criteria.is_favorite);
  if (criteria.tags && criteria.tags.length > 0) query = query.overlaps("tags", criteria.tags);
  if (criteria.last_booking_days !== undefined) {
    const cutoffUtc = fromBusinessTime(startOfDay(subDays(nowInTz(tz), criteria.last_booking_days)), tz);
    query = query.gte("last_service_date", cutoffUtc.toISOString());
  }

  const { data: clients, error } = await query;
  if (error) {
    console.error("Error getting segment recipients:", error);
    return [];
  }
  return (clients || []).map((c: any) => c.customer_id);
}

/**
 * Resolve recipients, enforce plan limits, personalize, bill, and send.
 * Marks the campaign `sending` → `sent`. Idempotent per recipient via the
 * debit idempotency key; safe to retry a stuck campaign.
 */
export async function dispatchCampaign(
  supabase: SupabaseClient<any>,
  campaign: DispatchableCampaign,
): Promise<DispatchResult> {
  const providerId = campaign.provider_id;
  const id = campaign.id;

  if (campaign.status === "sent") {
    return { ok: false, code: "ALREADY_SENT", status: 400, message: "Campaign has already been sent" };
  }

  const canUseChannel = await canUseMarketingChannel(providerId, campaign.type, supabase);
  if (!canUseChannel) {
    return {
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      status: 403,
      message: `${campaign.type} campaigns require a subscription upgrade.`,
    };
  }

  const { data: providerRow } = await supabase
    .from("providers")
    .select("tenant_id, business_name, timezone")
    .eq("id", providerId)
    .maybeSingle();
  const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  const businessName = (providerRow as { business_name?: string | null } | null)?.business_name ?? null;
  const providerTz = resolveTz((providerRow as { timezone?: string | null } | null)?.timezone);

  const marketingAccess = await checkMarketingFeatureAccess(providerId, supabase);
  if (marketingAccess.maxCampaignsPerMonth) {
    const monthStartUtc = fromBusinessTime(startOfDay(startOfMonth(nowInTz(providerTz))), providerTz);
    const { data: campaignsThisMonth } = await supabase
      .from("marketing_campaigns")
      .select("id")
      .eq("provider_id", providerId)
      .eq("status", "sent")
      .gte("sent_at", monthStartUtc.toISOString());
    if ((campaignsThisMonth?.length || 0) >= marketingAccess.maxCampaignsPerMonth) {
      return {
        ok: false,
        code: "LIMIT_REACHED",
        status: 403,
        message: `Monthly campaign limit reached (${marketingAccess.maxCampaignsPerMonth}).`,
      };
    }
  }

  let recipientIds: string[] = [];
  if (campaign.recipient_type === "all_clients") {
    const { data: clients } = await supabase
      .from("provider_clients")
      .select("customer_id")
      .eq("provider_id", providerId);
    recipientIds = (clients || []).map((c: any) => c.customer_id);
  } else if (campaign.recipient_type === "custom") {
    if (!Array.isArray(campaign.recipient_ids) || campaign.recipient_ids.length === 0) {
      return { ok: false, code: "VALIDATION_ERROR", status: 400, message: "Custom recipient list is empty" };
    }
    recipientIds = campaign.recipient_ids;
  } else if (campaign.recipient_type === "segment") {
    if (!campaign.segment_criteria) {
      return { ok: false, code: "VALIDATION_ERROR", status: 400, message: "Segment campaign requires criteria" };
    }
    recipientIds = await getSegmentRecipients(supabase, providerId, providerTz, campaign.segment_criteria as any);
  }

  if (recipientIds.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", status: 400, message: "No recipients found for this campaign" };
  }

  const selectFields =
    campaign.type === "email"
      ? "id, full_name, email"
      : campaign.type === "whatsapp" || campaign.type === "sms"
        ? "id, full_name, phone"
        : "id, full_name, email, phone";

  const { data: customers } = await supabase.from("users").select(selectFields).in("id", recipientIds);
  const validCustomers = (customers || []).filter((customer: any) =>
    campaign.type === "email" ? customer.email : customer.phone,
  );
  if (validCustomers.length === 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      status: 400,
      message: `No recipients have ${campaign.type === "email" ? "email addresses" : "phone numbers"}`,
    };
  }

  if (marketingAccess.maxRecipientsPerCampaign && validCustomers.length > marketingAccess.maxRecipientsPerCampaign) {
    return {
      ok: false,
      code: "LIMIT_REACHED",
      status: 403,
      message: `Campaign exceeds recipient limit (${marketingAccess.maxRecipientsPerCampaign}).`,
    };
  }

  await supabase
    .from("marketing_campaigns")
    .update({ status: "sending", sent_count: 0, updated_at: new Date().toISOString() })
    .eq("id", id);

  const { sendMessage } = await import("@/lib/marketing/unified-service");
  const { debitMarketingBalance, getMarketingBalance, priceFor, creditMarketingBalance } = await import(
    "@/lib/marketing/credits"
  );
  const { resolveMarketingSendingContext } = await import("@/lib/marketing/sending-path");
  const { substituteMergeTags } = await import("@/lib/marketing/merge-tags");

  const sendCtx = await resolveMarketingSendingContext(providerId, campaign.type, supabase);
  const debitsCredits = sendCtx.debitsCredits;
  const category = campaign.type === "whatsapp" ? "marketing" : "default";

  if (debitsCredits) {
    const unitCost = await priceFor(supabase, campaign.type, category);
    const estimated = validCustomers.length * unitCost;
    const balance = await getMarketingBalance(supabase, providerId);
    if (balance.total_zar < estimated) {
      // Revert to scheduled/draft so it isn't stuck in "sending".
      await supabase
        .from("marketing_campaigns")
        .update({ status: campaign.status === "scheduled" ? "scheduled" : "draft", updated_at: new Date().toISOString() })
        .eq("id", id);
      return {
        ok: false,
        code: "INSUFFICIENT_CREDIT",
        status: 402,
        message: `Insufficient marketing credit. Need ~R${estimated.toFixed(2)}, have R${balance.total_zar.toFixed(2)}.`,
      };
    }
  }

  // Recipients already delivered in a prior (possibly crashed) run. Skipping
  // them makes a requeue of a stuck campaign exactly-once instead of spammy.
  const { data: priorSends } = await supabase
    .from("marketing_campaign_sends")
    .select("customer_id")
    .eq("campaign_id", id)
    .eq("status", "sent");
  const alreadySentIds = new Set<string>(
    ((priorSends as { customer_id: string }[] | null) ?? []).map((r) => r.customer_id),
  );

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  type CustomerContact = { id: string; full_name?: string | null; email?: string | null; phone?: string | null };
  const newlySent: CustomerContact[] = [];
  const recordFailure = async (customerId: string, error: string | null) => {
    try {
      await supabase.from("marketing_campaign_sends").upsert(
        {
          campaign_id: id,
          customer_id: customerId,
          channel: campaign.type,
          status: "failed",
          error: error ?? null,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "campaign_id,customer_id" },
      );
    } catch {
      // Best-effort log; never let logging mask the send outcome.
    }
  };
  for (const customer of validCustomers as any as CustomerContact[]) {
    try {
      if (alreadySentIds.has(customer.id)) {
        // Delivered on a previous run — count it but don't re-send or re-bill.
        sentCount++;
        continue;
      }

      const contact = campaign.type === "email" ? customer.email : customer.phone;
      if (!contact) {
        failedCount++;
        await recordFailure(customer.id, "no_contact");
        continue;
      }

      const mergeValues = {
        customer_name: customer.full_name ?? null,
        first_name: customer.full_name ?? null,
        business_name: businessName,
      };
      const personalizedContent = substituteMergeTags(campaign.content ?? "", mergeValues);
      const personalizedSubject = substituteMergeTags(campaign.subject || campaign.name || "", mergeValues);

      const debitKey = `campaign:${id}:${customer.id}:${campaign.type}`;
      let debitedAmount = 0;
      if (debitsCredits) {
        const unitCost = await priceFor(supabase, campaign.type, category);
        const debit = await debitMarketingBalance({
          providerId,
          amountZar: unitCost,
          reason: "campaign_send",
          idempotencyKey: debitKey,
          channel: campaign.type,
          category,
          campaignId: id,
          supabase,
        });
        if (!debit.ok) {
          failedCount++;
          const debitErr = "reason" in debit ? debit.reason : "debit failed";
          errors.push(debitErr);
          await recordFailure(customer.id, debitErr);
          continue;
        }
        debitedAmount = unitCost;
      }

      const result = await sendMessage(providerId, campaign.type, {
        to: contact,
        subject: personalizedSubject,
        content: personalizedContent,
        fromName: campaign.name,
        campaignId: id,
        tenantId,
        supabase,
      });

      if (result.success) {
        sentCount++;
        newlySent.push(customer);
        // Record delivery so a future requeue skips this recipient.
        await supabase.from("marketing_campaign_sends").upsert(
          {
            campaign_id: id,
            customer_id: customer.id,
            channel: campaign.type,
            status: "sent",
            message_id: result.messageId ?? null,
            sent_at: new Date().toISOString(),
          },
          { onConflict: "campaign_id,customer_id" },
        );
      } else {
        failedCount++;
        if (result.error) errors.push(result.error);
        await recordFailure(customer.id, result.error ?? "send_failed");
        if (debitedAmount > 0) {
          await creditMarketingBalance({
            providerId,
            amountZar: debitedAmount,
            reason: "refund",
            idempotencyKey: `refund:${debitKey}`,
            channel: campaign.type,
            campaignId: id,
            metadata: { refund_reason: "send_failed", error: result.error ?? null },
            supabase,
          });
        }
      }
    } catch (error: any) {
      failedCount++;
      errors.push(error?.message || "Unknown error");
      await recordFailure(customer.id, error?.message || "unknown_error");
    }
  }

  await supabase
    .from("marketing_campaigns")
    .update({
      status: "sent",
      sent_count: sentCount,
      failed_count: failedCount,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const notificationTypeMap: Record<string, string> = {
    email: "marketing_email",
    sms: "marketing_sms",
    whatsapp: "marketing_whatsapp",
  };
  const notificationMessageMap: Record<string, string> = {
    email: `You received an email: ${campaign.subject || campaign.name}`,
    sms: `You received an SMS: ${campaign.name}`,
    whatsapp: `You received a WhatsApp message: ${campaign.name}`,
  };
  const notifInputs = newlySent.map((customer) => ({
    user_id: customer.id as string,
    type: notificationTypeMap[campaign.type] || "marketing_email",
    title: campaign.name,
    message: notificationMessageMap[campaign.type] || `You received a message: ${campaign.name}`,
    data: { campaign_id: id, type: campaign.type },
  }));
  if (notifInputs.length > 0) {
    const { insertNotifications } = await import("@/lib/notifications/insert-notification");
    for (let i = 0; i < notifInputs.length; i += 100) {
      await insertNotifications(notifInputs.slice(i, i + 100));
    }
  }

  return { ok: true, sentCount, failedCount, errors };
}
