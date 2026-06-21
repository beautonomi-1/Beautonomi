export type NotificationPreferences = {
  inspiration_and_offers?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  news_and_programs?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  feedback?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  travel_regulations?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  account_activity?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  client_policies?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  reminders?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  subscription_renewal?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  messages?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  unsubscribe_marketing?: boolean;
  /** API may include flat keys for mobile compatibility */
  email_notifications?: boolean;
  sms_notifications?: boolean;
  whatsapp_notifications?: boolean;
  booking_reminders?: boolean;
};
