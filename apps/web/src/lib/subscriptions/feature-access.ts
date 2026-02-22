/**
 * Subscription Feature Access
 * 
 * Provides utilities to check if providers have access to features
 * based on their subscription tier.
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
  // Try to get active subscription
  const { data: subscription } = await supabase
    .from("provider_subscriptions")
    .select(`
      plan_id,
      plan:subscription_plans(
        id,
        name,
        features,
        is_free
      )
    `)
    .eq("provider_id", providerId)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (subscription?.plan) {
    const plan = subscription.plan as any;
    return {
      planId: plan.id,
      planName: plan.name,
      features: plan.features || {},
      isFree: plan.is_free || false,
    };
  }

  // If no active subscription, check for free tier
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

/**
 * Check if provider has access to marketing features
 */
export async function checkMarketingFeatureAccess(
  providerId: string
): Promise<MarketingFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<ChatFeatureAccess> {
  const supabase = await getSupabaseServer();
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
 * Check if provider has access to Yoco features
 */
export async function checkYocoFeatureAccess(
  providerId: string
): Promise<YocoFeatureAccess> {
  const supabase = await getSupabaseServer();
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
 * Check if provider can use a specific marketing channel
 */
export async function canUseMarketingChannel(
  providerId: string,
  channel: "email" | "sms" | "whatsapp"
): Promise<boolean> {
  const access = await checkMarketingFeatureAccess(providerId);
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
 * Check if provider has access to staff management features
 */
export async function checkStaffManagementFeatureAccess(
  providerId: string
): Promise<StaffManagementFeatureAccess> {
  const supabase = await getSupabaseServer();
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
 */
export async function checkLocationFeatureAccess(
  providerId: string
): Promise<LocationFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<BookingLimitsFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<AnalyticsFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<AutomationFeatureAccess> {
  const supabase = await getSupabaseServer();
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
 */
export async function checkRecurringAppointmentFeatureAccess(
  providerId: string
): Promise<RecurringAppointmentFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<ExpressBookingFeatureAccess> {
  const supabase = await getSupabaseServer();
  const tier = await getProviderSubscriptionTier(supabase, providerId);

  if (!tier) {
    return {
      enabled: false,
    };
  }

  const express = tier.features?.express_booking || {};
  
  return {
    enabled: express.enabled === true,
    maxLinks: express.max_links,
  };
}

/**
 * Check if provider has access to calendar sync
 */
export async function checkCalendarSyncFeatureAccess(
  providerId: string
): Promise<CalendarSyncFeatureAccess> {
  const supabase = await getSupabaseServer();
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
  providerId: string
): Promise<ProviderFeatureAccess> {
  const supabase = await getSupabaseServer();
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
        enabled: false,
      },
      calendarSync: {
        enabled: false,
        apiAccess: false,
      },
      isFree: true,
    };
  }

  const marketing = tier.features?.marketing_campaigns || {};
  const chat = tier.features?.chat_messages || {};
  const yoco = tier.features?.yoco_integration || {};
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
      enabled: express.enabled === true,
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
