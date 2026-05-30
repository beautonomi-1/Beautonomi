/**
 * Subscription feature access — interprets `subscription_plans.features` JSON per provider.
 *
 * **Does not** apply tenant `feature_flags` (use `entitlements.ts` + `isFeatureEnabledServer` for payment killswitches).
 * **Precedence** across the stack: see `entitlements.ts`.
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MarketingFeatureAccess {
  enabled: boolean;
  channels: string[]; // ["email", "sms", "whatsapp"]
  maxCampaignsPerMonth?: number;
  maxRecipientsPerCampaign?: number;
  advancedSegmentation: boolean;
  customIntegrations: boolean; // Can use own SendGrid/Twilio
}

export interface ChatFeatureAccess {
  enabled: boolean;
  maxMessagesPerMonth?: number;
  fileAttachments: boolean;
  groupChats: boolean;
}

export interface YocoFeatureAccess {
  enabled: boolean;
  maxDevices?: number;
  advancedFeatures: boolean; // Webhooks, reporting, etc.
}

export interface PaystackVirtualTerminalFeatureAccess {
  enabled: boolean;
  maxTerminals?: number;
  perLocationTerminals: boolean;
  advancedReconciliation: boolean;
  splitSettlement: boolean;
}

export interface StaffManagementFeatureAccess {
  enabled: boolean;
  maxStaffMembers?: number;
}

export interface LocationFeatureAccess {
  enabled: boolean;
  maxLocations?: number;
}

export interface BookingLimitsFeatureAccess {
  enabled: boolean;
  maxBookingsPerMonth?: number;
}

export interface AnalyticsFeatureAccess {
  enabled: boolean;
  basicReports: boolean;
  advancedReports: boolean;
  dataExport: boolean;
  apiAccess: boolean;
  reportTypes?: string[]; // ["sales", "bookings", "staff", "clients", "products", "payments"]
}

export interface AutomationFeatureAccess {
  enabled: boolean;
  maxAutomations?: number;
}

export interface RecurringAppointmentFeatureAccess {
  enabled: boolean;
  advancedPatterns: boolean;
}

export interface ExpressBookingFeatureAccess {
  enabled: boolean;
  maxLinks?: number;
}

export interface CalendarSyncFeatureAccess {
  enabled: boolean;
  providers?: string[]; // ["google", "outlook", "ical"]
  apiAccess: boolean;
}

export interface ProviderFeatureAccess {
  marketing: MarketingFeatureAccess;
  chat: ChatFeatureAccess;
  yoco: YocoFeatureAccess;
  paystackVirtualTerminal: PaystackVirtualTerminalFeatureAccess;
  staffManagement: StaffManagementFeatureAccess;
  locations: LocationFeatureAccess;
  bookingLimits: BookingLimitsFeatureAccess;
  analytics: AnalyticsFeatureAccess;
  automations: AutomationFeatureAccess;
  recurringAppointments: RecurringAppointmentFeatureAccess;
  expressBooking: ExpressBookingFeatureAccess;
  calendarSync: CalendarSyncFeatureAccess;
  planName?: string;
  planId?: string;
  isFree: boolean;
}

/**
 * Get provider's subscription tier and features
 */
async function getProviderSubscriptionTier(
  supabase: SupabaseClient<any>,
  providerId: string
): Promise<{
  planId?: string;
  planName?: string;
  features: any;
  isFree: boolean;
} | null> {
  // Try to get active subscription (include rows with null expires_at for lifetime/free plans).
  // Also include past_due subscriptions within a 3-day grace period so providers don't
  // immediately lose access on a single failed charge retry.
  const nowIso = new Date().toISOString();
  const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: subscription, error: subscriptionError } = await supabase
    .from("provider_subscriptions")
    .select(`
      plan_id,
      status,
      updated_at,
      plan:subscription_plans(
        id,
        name,
        features,
        is_free
      )
    `)
    .eq("provider_id", providerId)
    .in("status", ["active", "past_due"])
    // Null expires_at = never expires (lifetime / free rows); do not use expires_at.gte alone.
    .or(`expires_at.gte.${nowIso},expires_at.is.null`)
    .order("status", { ascending: true })
    .maybeSingle();

  if (subscriptionError) {
    console.error("getProviderSubscriptionTier: provider_subscriptions query failed", subscriptionError);
    return null;
  }

  // For past_due: only allow if within 3-day grace period from when status changed
  if (subscription?.status === "past_due") {
    const updatedAt = (subscription as any).updated_at;
    const pastGrace = updatedAt && updatedAt < graceCutoff;
    if (!pastGrace && subscription?.plan) {
      const plan = subscription.plan as any;
      return {
        planId: plan.id,
        planName: plan.name,
        features: plan.features || {},
        isFree: plan.is_free || false,
      };
    }
  } else if (subscription?.plan) {
    const plan = subscription.plan as any;
    return {
      planId: plan.id,
      planName: plan.name,
      features: plan.features || {},
      isFree: plan.is_free || false,
    };
  }

  // If no active subscription, check badge free_subscription (get_provider_subscription_status)
  const { data: badgeStatus } = await supabase.rpc("get_provider_subscription_status", {
    p_provider_id: providerId,
  });
  if (badgeStatus === "active") {
    const { data: freePlan } = await supabase
      .from("subscription_plans")
      .select("id, name, features, is_free")
      .eq("is_free", true)
      .eq("is_active", true)
      .order("display_order")
      .limit(1)
      .maybeSingle();
    if (freePlan) {
      return {
        planId: freePlan.id,
        planName: freePlan.name,
        features: freePlan.features || {},
        isFree: true,
      };
    }
    // No free plan in DB: return minimal tier so feature checks pass
    return {
      planId: undefined,
      planName: "Badge benefit",
      features: {
        booking_online: true,
        reviews_ratings: true,
        basic_analytics: true,
        paystack_virtual_terminal: {
          enabled: true,
          max_terminals: null,
          per_location_terminals: true,
          advanced_reconciliation: true,
          split_settlement: true,
        },
      },
      isFree: true,
    };
  }

  // Check for free tier from subscription_plans (existing behavior)
  const { data: freePlan } = await supabase
    .from("subscription_plans")
    .select("id, name, features, is_free")
    .eq("is_free", true)
    .eq("is_active", true)
    .order("display_order")
    .limit(1)
    .maybeSingle();

  if (freePlan) {
    return {
      planId: freePlan.id,
      planName: freePlan.name,
      features: freePlan.features || {},
      isFree: true,
    };
  }

  return null;
}

/** Feature keys under subscription_plans.features used for gating (see migration defaults on free tier). */
export const SUBSCRIPTION_FEATURE_KEYS = {
  intakeForms: "intake_forms",
  serviceResources: "service_resources",
} as const;

/**
 * Staff operational SMS (team notification prefs) — opt-in per plan via `features.staff_sms_notifications`.
 * When the key is missing, SMS is not allowed (unlike most product flags that default to true for legacy rows).
 */
export function resolveStaffSmsNotificationsFromPlanFeatures(
  features: Record<string, unknown> | null | undefined
): boolean {
  if (!features || typeof features !== "object") return false;
  const raw = (features as Record<string, unknown>).staff_sms_notifications;
  if (raw === undefined || raw === null) return false;
  if (typeof raw === "object" && raw !== null) {
    return (raw as { enabled?: boolean }).enabled === true;
  }
  return false;
}

/**
 * Whether the provider's current plan allows enabling SMS in team (staff) notification settings.
 */
export async function checkStaffSmsNotificationsFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);
  if (!tier) return false;
  return resolveStaffSmsNotificationsFromPlanFeatures(tier.features as Record<string, unknown>);
}

/**
 * Resolves a boolean flag from plan features (fail-closed: deny unless explicitly allowed).
 */
export function resolvePlanFeatureEnabled(
  features: Record<string, unknown> | null | undefined,
  key: string
): boolean {
  if (!features || typeof features !== "object") return false;
  const node = features[key];
  if (node === undefined || node === null) return false;
  if (typeof node === "boolean") return node;
  if (typeof node === "object" && node !== null) {
    const o = node as { enabled?: boolean };
    if (o.enabled === undefined) return false;
    return o.enabled === true;
  }
  return false;
}

/**
 * Server-side check for subscription-gated product features (forms builder, equipment resources, etc.).
 */
export async function isProviderSubscriptionFeatureEnabled(
  providerId: string,
  featureKey: string
): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const tier = await getProviderSubscriptionTier(supabase, providerId);
  if (!tier) return false;
  return resolvePlanFeatureEnabled(tier.features as Record<string, unknown>, featureKey);
}

/**
 * Check if provider has access to marketing features
 */
export async function checkMarketingFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<MarketingFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      channels: [],
      advancedSegmentation: false,
      customIntegrations: false,
    };
  }

  const marketing = tier.features?.marketing_campaigns || {};
  
  return {
    enabled: marketing.enabled === true,
    channels: marketing.channels || [],
    maxCampaignsPerMonth: marketing.max_campaigns_per_month,
    maxRecipientsPerCampaign: marketing.max_recipients_per_campaign,
    advancedSegmentation: marketing.advanced_segmentation === true,
    customIntegrations: marketing.custom_integrations === true,
  };
}

/**
 * Check if provider has access to chat features
 */
export async function checkChatFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<ChatFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      fileAttachments: false,
      groupChats: false,
    };
  }

  const chat = tier.features?.chat_messages || {};
  
  return {
    enabled: chat.enabled === true,
    maxMessagesPerMonth: chat.max_messages_per_month,
    fileAttachments: chat.file_attachments === true,
    groupChats: chat.group_chats === true,
  };
}

/**
 * Check if provider has access to Yoco features.
 *
 * @param supabaseClient - Use the same client as the API route (`getSupabaseServer(request)`).
 *   If omitted, uses cookie-only `getSupabaseServer()`, which can break Bearer-token / mobile calls
 *   and yield false "subscription required" responses.
 */
export async function checkYocoFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<YocoFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      advancedFeatures: false,
    };
  }

  const yoco = tier.features?.yoco_integration || {};
  
  return {
    enabled: yoco.enabled === true,
    maxDevices: yoco.max_devices,
    advancedFeatures: yoco.advanced_features === true,
  };
}

/**
 * Check if provider has access to Paystack Virtual Terminal features.
 *
 * The platform/tenant killswitch is enforced separately by
 * `paystack-virtual-terminal-feature-gate.ts`; this function only reads the
 * provider's subscription plan entitlements.
 */
export async function checkPaystackVirtualTerminalFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<PaystackVirtualTerminalFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      perLocationTerminals: false,
      advancedReconciliation: false,
      splitSettlement: false,
    };
  }

  const terminal = tier.features?.paystack_virtual_terminal || {};

  return {
    enabled: terminal.enabled === true,
    maxTerminals: terminal.max_terminals,
    perLocationTerminals: terminal.per_location_terminals === true,
    advancedReconciliation: terminal.advanced_reconciliation === true,
    splitSettlement: terminal.split_settlement === true,
  };
}

/**
 * Check if provider can use a specific marketing channel
 */
export async function canUseMarketingChannel(
  providerId: string,
  channel: "email" | "sms" | "whatsapp",
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const access = await checkMarketingFeatureAccess(providerId, supabaseClient);
  return access.enabled && access.channels.includes(channel);
}

/**
 * Check if provider can send chat messages
 */
export async function canSendChatMessages(providerId: string): Promise<boolean> {
  const access = await checkChatFeatureAccess(providerId);
  return access.enabled;
}

/**
 * Check if provider can use Yoco integration
 */
export async function canUseYocoIntegration(providerId: string): Promise<boolean> {
  const access = await checkYocoFeatureAccess(providerId);
  return access.enabled;
}

/**
 * Check if provider can use Paystack Virtual Terminal.
 */
export async function canUsePaystackVirtualTerminal(providerId: string): Promise<boolean> {
  const access = await checkPaystackVirtualTerminalFeatureAccess(providerId);
  return access.enabled;
}

/**
 * Check if provider has access to staff management features
 */
export async function checkStaffManagementFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<StaffManagementFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
    };
  }

  const staff = tier.features?.staff_management || {};
  
  return {
    enabled: staff.enabled === true,
    maxStaffMembers: staff.max_staff_members,
  };
}

/**
 * Check if provider has access to multi-location features
 *
 * @param supabaseClient — Use the same client as the API route (`getSupabaseServer(request)`).
 *   If omitted, uses cookie-only `getSupabaseServer()`, which breaks Bearer-token / mobile calls
 *   and yields false "subscription required" 403s.
 */
export async function checkLocationFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<LocationFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
    };
  }

  const locations = tier.features?.multi_location || {};
  
  return {
    enabled: locations.enabled === true,
    maxLocations: locations.max_locations,
  };
}

/**
 * Check if provider has access to booking limits
 */
export async function checkBookingLimitsFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<BookingLimitsFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
    };
  }

  const bookings = tier.features?.booking_limits || {};
  
  return {
    enabled: bookings.enabled === true,
    maxBookingsPerMonth: bookings.max_bookings_per_month,
  };
}

/**
 * Check if provider has access to analytics features
 */
export async function checkAnalyticsFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<AnalyticsFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      basicReports: false,
      advancedReports: false,
      dataExport: false,
      apiAccess: false,
    };
  }

  const analytics = tier.features?.advanced_analytics || {};
  
  return {
    enabled: analytics.enabled === true,
    basicReports: analytics.basic_reports === true,
    advancedReports: analytics.advanced_reports === true,
    dataExport: analytics.data_export === true,
    apiAccess: analytics.api_access === true,
    reportTypes: analytics.report_types || [],
  };
}

/**
 * Check if provider has access to marketing automations
 */
export async function checkAutomationFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<AutomationFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
    };
  }

  const automations = tier.features?.marketing_automations || {};
  
  return {
    enabled: automations.enabled === true,
    maxAutomations: automations.max_automations,
  };
}

/**
 * Check if provider has access to recurring appointments
 *
 * @param supabaseClient — Use the same client as the API route (`getSupabaseServer(request)`).
 *   If omitted, uses cookie-only `getSupabaseServer()`, which breaks Bearer-token / mobile calls
 *   and yields false "subscription required" 403s.
 */
export async function checkRecurringAppointmentFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<RecurringAppointmentFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      advancedPatterns: false,
    };
  }

  const recurring = tier.features?.recurring_appointments || {};
  
  return {
    enabled: recurring.enabled === true,
    advancedPatterns: recurring.advanced_patterns === true,
  };
}

/**
 * Check if provider has access to express booking links
 */
export async function checkExpressBookingFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<ExpressBookingFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: true,
    };
  }

  const express = tier.features?.express_booking || {};
  
  return {
    enabled: true,
    maxLinks: express.max_links,
  };
}

/**
 * Check if provider has access to calendar sync
 */
export async function checkCalendarSyncFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<CalendarSyncFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
      apiAccess: false,
    };
  }

  const calendar = tier.features?.calendar_sync || {};
  
  return {
    enabled: calendar.enabled === true,
    providers: calendar.providers || [],
    apiAccess: calendar.api_access === true,
  };
}

/**
 * Get all feature access for a provider (extended)
 */
export async function getProviderFeatureAccess(
  providerId: string,
  supabaseClient?: SupabaseClient
): Promise<ProviderFeatureAccess> {
  const supabase = supabaseClient ?? (await getSupabaseServer());
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      marketing: {
        enabled: false,
        channels: [],
        advancedSegmentation: false,
        customIntegrations: false,
      },
      chat: {
        enabled: false,
        fileAttachments: false,
        groupChats: false,
      },
      yoco: {
        enabled: false,
        advancedFeatures: false,
      },
      paystackVirtualTerminal: {
        enabled: false,
        perLocationTerminals: false,
        advancedReconciliation: false,
        splitSettlement: false,
      },
      staffManagement: {
        enabled: false,
      },
      locations: {
        enabled: false,
      },
      bookingLimits: {
        enabled: false,
      },
      analytics: {
        enabled: false,
        basicReports: false,
        advancedReports: false,
        dataExport: false,
        apiAccess: false,
      },
      automations: {
        enabled: false,
      },
      recurringAppointments: {
        enabled: false,
        advancedPatterns: false,
      },
      expressBooking: {
        enabled: true,
      },
      calendarSync: {
        enabled: false,
        apiAccess: false,
      },
      isFree: false,
    };
  }

  const marketing = tier.features?.marketing_campaigns || {};
  const chat = tier.features?.chat_messages || {};
  const yoco = tier.features?.yoco_integration || {};
  const paystackVirtualTerminal = tier.features?.paystack_virtual_terminal || {};
  const staff = tier.features?.staff_management || {};
  const locations = tier.features?.multi_location || {};
  const bookings = tier.features?.booking_limits || {};
  const analytics = tier.features?.advanced_analytics || {};
  const automations = tier.features?.marketing_automations || {};
  const recurring = tier.features?.recurring_appointments || {};
  const express = tier.features?.express_booking || {};
  const calendar = tier.features?.calendar_sync || {};

  return {
    marketing: {
      enabled: marketing.enabled === true,
      channels: marketing.channels || [],
      maxCampaignsPerMonth: marketing.max_campaigns_per_month,
      maxRecipientsPerCampaign: marketing.max_recipients_per_campaign,
      advancedSegmentation: marketing.advanced_segmentation === true,
      customIntegrations: marketing.custom_integrations === true,
    },
    chat: {
      enabled: chat.enabled === true,
      maxMessagesPerMonth: chat.max_messages_per_month,
      fileAttachments: chat.file_attachments === true,
      groupChats: chat.group_chats === true,
    },
    yoco: {
      enabled: yoco.enabled === true,
      maxDevices: yoco.max_devices,
      advancedFeatures: yoco.advanced_features === true,
    },
    paystackVirtualTerminal: {
      enabled: paystackVirtualTerminal.enabled === true,
      maxTerminals: paystackVirtualTerminal.max_terminals,
      perLocationTerminals: paystackVirtualTerminal.per_location_terminals === true,
      advancedReconciliation: paystackVirtualTerminal.advanced_reconciliation === true,
      splitSettlement: paystackVirtualTerminal.split_settlement === true,
    },
    staffManagement: {
      enabled: staff.enabled === true,
      maxStaffMembers: staff.max_staff_members,
    },
    locations: {
      enabled: locations.enabled === true,
      maxLocations: locations.max_locations,
    },
    bookingLimits: {
      enabled: bookings.enabled === true,
      maxBookingsPerMonth: bookings.max_bookings_per_month,
    },
    analytics: {
      enabled: analytics.enabled === true,
      basicReports: analytics.basic_reports === true,
      advancedReports: analytics.advanced_reports === true,
      dataExport: analytics.data_export === true,
      apiAccess: analytics.api_access === true,
      reportTypes: analytics.report_types || [],
    },
    automations: {
      enabled: automations.enabled === true,
      maxAutomations: automations.max_automations,
    },
    recurringAppointments: {
      enabled: recurring.enabled === true,
      advancedPatterns: recurring.advanced_patterns === true,
    },
    expressBooking: {
      enabled: true,
      maxLinks: express.max_links,
    },
    calendarSync: {
      enabled: calendar.enabled === true,
      providers: calendar.providers || [],
      apiAccess: calendar.api_access === true,
    },
    planName: tier.planName,
    planId: tier.planId,
    isFree: tier.isFree,
  };
}
