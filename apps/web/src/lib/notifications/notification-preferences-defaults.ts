/**
 * Single source of truth for notification preference defaults (API, materialize, send merge).
 */

export type SectionChannelPrefs = {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
  whatsapp?: boolean;
};

/** Customer defaults aligned with GET/PATCH and mobile UI (transactional push opt-in). */
export function getCustomerNotificationDefaults(options?: {
  /** When false, marketing sections start off and unsubscribe_marketing is set. */
  marketingConsented?: boolean;
}): Record<string, unknown> {
  const marketing = options?.marketingConsented === true;
  return {
    inspiration_and_offers: {
      email: marketing,
      sms: marketing,
      push: false,
      whatsapp: false,
    },
    news_and_programs: {
      email: marketing,
      sms: marketing,
      push: false,
      whatsapp: false,
    },
    feedback: { email: true, sms: false, push: false, whatsapp: false },
    travel_regulations: { email: true, sms: true, push: false, whatsapp: false },
    account_activity: { email: true, sms: true, push: false, whatsapp: true },
    client_policies: { email: true, sms: false, push: false, whatsapp: false },
    reminders: { email: true, sms: true, push: false, whatsapp: true },
    subscription_renewal: { email: true, sms: false, push: false, whatsapp: false },
    messages: { email: true, sms: true, push: true, whatsapp: true },
    unsubscribe_marketing: !marketing,
    email_notifications: true,
    sms_notifications: false,
    booking_reminders: true,
  };
}

export const CUSTOMER_SECTION_DEFAULTS: Record<string, SectionChannelPrefs> =
  getCustomerNotificationDefaults({ marketingConsented: false }) as Record<string, SectionChannelPrefs>;

/** Provider personal notification_preferences defaults. */
export function getProviderNotificationDefaults(): Record<string, unknown> {
  return {
    booking_updates: { email: true, sms: true, push: true, whatsapp: false },
    booking_cancellations: { email: true, sms: true, push: true, whatsapp: false },
    booking_reminders: { email: true, sms: true, push: true, whatsapp: false },
    new_reviews: { email: true, sms: false, push: true, whatsapp: false },
    review_responses: { email: true, sms: false, push: true, whatsapp: false },
    client_messages: { email: true, sms: true, push: true, whatsapp: false },
    payment_received: { email: true, sms: false, push: true, whatsapp: false },
    payout_updates: { email: true, sms: true, push: true, whatsapp: false },
    waitlist_notifications: { email: true, sms: false, push: true, whatsapp: false },
    system_updates: { email: true, sms: false, push: false, whatsapp: false },
    marketing: { email: true, sms: false, push: false, whatsapp: false },
    booking_alert_sound: true,
    order_alert_sound: true,
    message_alert_sound: true,
    unsubscribe_marketing: false,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    digest_mode: "none",
  };
}

export const PROVIDER_SECTION_DEFAULTS: Record<string, SectionChannelPrefs> = {
  booking_updates: { email: true, sms: true, push: true, whatsapp: false },
  booking_cancellations: { email: true, sms: true, push: true, whatsapp: false },
  booking_reminders: { email: true, sms: true, push: true, whatsapp: false },
  new_reviews: { email: true, sms: false, push: true, whatsapp: false },
  review_responses: { email: true, sms: false, push: true, whatsapp: false },
  client_messages: { email: true, sms: true, push: true, whatsapp: false },
  payment_received: { email: true, sms: false, push: true, whatsapp: false },
  payout_updates: { email: true, sms: true, push: true, whatsapp: false },
  waitlist_notifications: { email: true, sms: false, push: true, whatsapp: false },
  system_updates: { email: true, sms: false, push: false, whatsapp: false },
  marketing: { email: true, sms: false, push: false, whatsapp: false },
};

/** Stored on provider_staff.notification_settings at create time. */
export function getStaffNotificationSettingsDefaults(): Record<string, unknown> {
  return {
    email_enabled: true,
    sms_enabled: false,
    desktop_enabled: false,
    appointment_reminders: true,
    appointment_cancellations: true,
    appointment_reschedules: true,
    new_bookings: true,
    daily_schedule: true,
    weekly_schedule: false,
    reminder_time: "24h",
  };
}

export function withCustomerFlatKeys(preferences: Record<string, unknown>): Record<string, unknown> {
  const reminders = preferences.reminders as { email?: boolean } | undefined;
  const anySectionSmsOn = [
    "account_activity",
    "reminders",
    "messages",
    "inspiration_and_offers",
    "news_and_programs",
    "travel_regulations",
  ].some((s) => {
    const sec = preferences[s] as { sms?: boolean } | undefined;
    return sec?.sms === true;
  });

  return {
    ...preferences,
    email_notifications:
      typeof preferences.email_notifications === "boolean"
        ? preferences.email_notifications
        : preferences.email_notifications !== false,
    sms_notifications:
      typeof preferences.sms_notifications === "boolean"
        ? preferences.sms_notifications
        : anySectionSmsOn,
    booking_reminders:
      typeof preferences.booking_reminders === "boolean"
        ? preferences.booking_reminders
        : reminders?.email !== false,
  };
}
