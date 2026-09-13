export type SettingsItemConfig = {
  itemKey: string;
  href: string;
  isUpgrade?: boolean;
  featureFlag?: string;
  staffOnly?: boolean;
};

export type SettingsCategoryConfig = {
  id: string;
  categoryKey: string;
  items: SettingsItemConfig[];
};

export const settingsCategories: SettingsCategoryConfig[] = [
  {
    id: "appointment-activity",
    categoryKey: "appointmentActivity",
    items: [
      { itemKey: "upgradeToSalon", href: "/provider/settings/upgrade-to-salon", isUpgrade: true },
      { itemKey: "appointmentSettings", href: "/provider/settings/appointments" },
      { itemKey: "businessDetails", href: "/provider/settings/appointment-activity/business-details" },
      { itemKey: "businessDescription", href: "/provider/settings/business-description" },
      { itemKey: "gallery", href: "/provider/settings/gallery" },
      { itemKey: "billing", href: "/provider/settings/billing" },
      { itemKey: "locations", href: "/provider/settings/locations" },
      { itemKey: "operatingHours", href: "/provider/settings/operating-hours" },
      { itemKey: "houseCallsTravel", href: "/provider/settings/sales/travel-fees" },
      { itemKey: "distance", href: "/provider/settings/distance" },
      { itemKey: "serviceZones", href: "/provider/settings/service-zones" },
      { itemKey: "verification", href: "/provider/settings/verification" },
      { itemKey: "onlineBooking", href: "/provider/settings/appointment-activity/online-booking" },
      { itemKey: "groupAppointments", href: "/provider/settings/appointment-activity/group-appointments" },
      { itemKey: "noteTemplates", href: "/provider/settings/note-templates" },
      { itemKey: "resources", href: "/provider/settings/appointment-activity/resources" },
      { itemKey: "closedPeriods", href: "/provider/settings/appointment-activity/closed-periods" },
      { itemKey: "blockedTime", href: "/provider/settings/appointment-activity/blocked-time" },
      { itemKey: "calendarIntegration", href: "/provider/settings/calendar-integration" },
      { itemKey: "calendarDisplay", href: "/provider/settings/calendar/display-preferences" },
      { itemKey: "calendarColors", href: "/provider/settings/calendar/colors-icons" },
      { itemKey: "calendarLinks", href: "/provider/settings/calendar/links" },
      { itemKey: "waitlist", href: "/provider/settings/appointment-activity/waitlist" },
    ],
  },
  {
    id: "clients",
    categoryKey: "clients",
    items: [
      { itemKey: "clientList", href: "/provider/settings/clients/list" },
      { itemKey: "referrals", href: "/provider/settings/clients/referrals" },
      { itemKey: "cancellationReasons", href: "/provider/settings/clients/cancellation-reasons" },
      { itemKey: "cancellationPolicies", href: "/provider/settings/cancellation-policies" },
      { itemKey: "customerVisibility", href: "/provider/settings/customer-visibility" },
    ],
  },
  {
    id: "services",
    categoryKey: "services",
    items: [
      { itemKey: "servicesMenu", href: "/provider/settings/services/menu" },
      { itemKey: "packages", href: "/provider/packages" },
      { itemKey: "addons", href: "/provider/settings/addons" },
      { itemKey: "memberships", href: "/provider/settings/services/memberships" },
    ],
  },
  {
    id: "sales",
    categoryKey: "sales",
    items: [
      { itemKey: "payoutCenter", href: "/provider/payouts" },
      { itemKey: "payoutAccounts", href: "/provider/settings/payout-accounts" },
      { itemKey: "paymentMethods", href: "/provider/settings/payments" },
      { itemKey: "subscription", href: "/provider/subscription" },
      { itemKey: "cardMachines", href: "/provider/settings/sales/card-machines", featureFlag: "payment_paycloud" },
      { itemKey: "yocoIntegration", href: "/provider/settings/sales/yoco-integration", featureFlag: "payment_yoco" },
      { itemKey: "terminalIntegrations", href: "/provider/settings/sales/terminal-integrations" },
      { itemKey: "terminalShop", href: "/provider/settings/sales/terminal-shop" },
      { itemKey: "paystackTerminal", href: "/provider/settings/sales/paystack-terminal" },
      { itemKey: "receiptSequencing", href: "/provider/settings/sales/receipt-sequencing" },
      { itemKey: "receiptTemplate", href: "/provider/settings/sales/receipt-template" },
      { itemKey: "taxes", href: "/provider/settings/sales/taxes" },
      { itemKey: "travelFees", href: "/provider/settings/sales/travel-fees" },
      { itemKey: "tips", href: "/provider/settings/sales/tips" },
      { itemKey: "tipsDistribution", href: "/provider/settings/tips/distribution" },
      { itemKey: "giftCards", href: "/provider/settings/sales/gift-cards" },
      { itemKey: "upselling", href: "/provider/settings/sales/upselling" },
    ],
  },
  {
    id: "team",
    categoryKey: "team",
    items: [
      { itemKey: "teamMembers", href: "/provider/team/members" },
      { itemKey: "payroll", href: "/provider/team/payroll" },
      { itemKey: "shifts", href: "/provider/team/shifts" },
      { itemKey: "roles", href: "/provider/settings/team/roles" },
      { itemKey: "permissions", href: "/provider/settings/team/permissions" },
      { itemKey: "commissions", href: "/provider/settings/team/commissions" },
      { itemKey: "timeOffTypes", href: "/provider/settings/team/time-off-types" },
      { itemKey: "teamNotifications", href: "/provider/settings/team/notifications" },
    ],
  },
  {
    id: "marketing-integrations",
    categoryKey: "marketingIntegrations",
    items: [
      { itemKey: "aiStudio", href: "/provider/settings/ai" },
      { itemKey: "paidAds", href: "/provider/settings/ads" },
      { itemKey: "emailIntegration", href: "/provider/settings/integrations/email" },
      { itemKey: "twilioIntegration", href: "/provider/settings/integrations/twilio" },
    ],
  },
  {
    id: "account",
    categoryKey: "account",
    items: [
      { itemKey: "notifications", href: "/provider/settings/notifications" },
      { itemKey: "loginSecurity", href: "/provider/account/login-and-security" },
      { itemKey: "personalInfo", href: "/provider/account/profile" },
      { itemKey: "privacySharing", href: "/provider/account/privacy-and-sharing" },
      { itemKey: "dataRights", href: "/provider/account/data-rights" },
      { itemKey: "preferences", href: "/provider/account/preferences" },
      { itemKey: "startOwnBusiness", href: "/provider/onboarding", staffOnly: true },
    ],
  },
];
