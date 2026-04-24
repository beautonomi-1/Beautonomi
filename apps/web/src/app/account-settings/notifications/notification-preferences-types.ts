export type NotificationPreferences = {
  inspiration_and_offers?: { email: boolean; sms: boolean; push: boolean };
  news_and_programs?: { email: boolean; sms: boolean; push: boolean };
  feedback?: { email: boolean; sms: boolean; push: boolean };
  travel_regulations?: { email: boolean; sms: boolean; push: boolean };
  account_activity?: { email: boolean; sms: boolean; push: boolean };
  client_policies?: { email: boolean; sms: boolean; push: boolean };
  reminders?: { email: boolean; sms: boolean; push: boolean };
  subscription_renewal?: { email: boolean; sms: boolean; push: boolean };
  messages?: { email: boolean; sms: boolean; push: boolean };
  unsubscribe_marketing?: boolean;
  /** API may include flat keys for mobile compatibility */
  email_notifications?: boolean;
  sms_notifications?: boolean;
  booking_reminders?: boolean;
};
