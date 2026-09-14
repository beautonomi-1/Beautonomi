"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

const SEGMENT_KEYS: Record<string, string> = {
  dashboard: "web.provider.sidebar.items.dashboard",
  calendar: "web.provider.sidebar.items.calendar",
  appointments: "web.provider.breadcrumb.appointments",
  bookings: "web.provider.sidebar.items.bookings",
  catalogue: "web.provider.sidebar.items.catalogue",
  products: "web.provider.sidebar.items.products",
  services: "web.provider.sidebar.items.services",
  clients: "web.provider.sidebar.items.clients",
  customers: "web.provider.breadcrumb.customers",
  "custom-requests": "web.provider.breadcrumb.customRequests",
  ecommerce: "web.provider.sidebar.items.ecommerce",
  orders: "web.provider.sidebar.items.orders",
  returns: "web.provider.sidebar.items.returns",
  shipping: "web.provider.sidebar.items.shipping",
  "walk-in": "web.provider.breadcrumb.walkIn",
  embed: "web.provider.breadcrumb.embed",
  engagement: "web.provider.breadcrumb.engagement",
  eula: "web.provider.pages.eula.breadcrumb",
  explore: "web.provider.topbar.mobileTitles.explore",
  new: "web.provider.breadcrumb.new",
  edit: "web.provider.common.edit",
  "express-booking": "web.provider.sidebar.items.bookingLinks",
  finance: "web.provider.sidebar.items.finance",
  "vat-reports": "web.provider.breadcrumb.vatReports",
  forms: "web.provider.sidebar.items.forms",
  "front-desk": "web.provider.sidebar.items.frontDesk",
  gamification: "web.provider.sidebar.items.rewardsBadges",
  "get-started": "web.provider.breadcrumb.getStarted",
  "group-bookings": "web.provider.sidebar.items.groupBookings",
  join: "web.provider.breadcrumb.join",
  locations: "web.provider.sidebar.items.locations",
  marketing: "web.provider.sidebar.items.marketing",
  automations: "provider.mobile.screens.settingsIndex.automations",
  "blast-campaigns": "web.provider.breadcrumb.blastCampaigns",
  campaigns: "web.provider.sidebar.items.campaigns",
  messaging: "web.provider.sidebar.items.messages",
  more: "web.provider.topbar.mobileTitles.more",
  "finance-hub": "web.provider.breadcrumb.financeHub",
  notifications: "web.provider.topbar.mobileTitles.notifications",
  onboarding: "web.provider.breadcrumb.onboarding",
  packages: "web.provider.sidebar.items.packages",
  payments: "web.provider.breadcrumb.payments",
  "payment-setup": "web.provider.breadcrumb.paymentSetup",
  payouts: "web.provider.sidebar.items.payouts",
  statements: "web.provider.breadcrumb.statements",
  promotions: "web.provider.breadcrumb.promotions",
  "recurring-appointments": "web.provider.sidebar.items.recurring",
  referrals: "web.provider.breadcrumb.referrals",
  reports: "web.provider.sidebar.items.reports",
  resources: "web.provider.sidebar.items.resources",
  "resources-forms": "web.provider.sidebar.items.resourcesForms",
  reviews: "web.provider.sidebar.items.reviews",
  routes: "web.provider.breadcrumb.routes",
  sales: "web.provider.sidebar.items.sales",
  schedule: "web.provider.sidebar.items.schedule",
  settings: "web.provider.settings.pageTitle",
  signup: "web.provider.breadcrumb.signup",
  staff: "web.provider.breadcrumb.staff",
  subscription: "web.provider.sidebar.items.subscription",
  "subscription-checkout": "web.provider.breadcrumb.subscriptionCheckout",
  "support-tickets": "web.provider.sidebar.items.supportTickets",
  team: "web.provider.sidebar.items.team",
  "days-off": "web.provider.sidebar.items.daysOff",
  members: "web.provider.sidebar.items.teamMembers",
  "my-earnings": "web.provider.sidebar.items.myEarnings",
  payroll: "web.provider.sidebar.items.payroll",
  shifts: "web.provider.breadcrumb.scheduledShifts",
  "time-clock": "web.provider.breadcrumb.timeClock",
  totals: "web.provider.breadcrumb.totals",
  "team-pay": "web.provider.breadcrumb.teamPay",
  "time-blocks": "web.provider.sidebar.items.timeBlocks",
  "waiting-room": "web.provider.sidebar.items.waitingRoom",
  waitlist: "web.provider.sidebar.items.waitlist",
  account: "web.provider.settings.tabs.account",
  "login-and-security": "web.provider.topbar.menu.loginSecurity",
  preferences: "web.provider.breadcrumb.preferences",
  "privacy-and-sharing": "web.provider.topbar.menu.privacySharing",
  "data-rights": "web.provider.topbar.menu.dataRights",
  "personal-profile": "web.provider.breadcrumb.personalProfile",
  profile: "web.provider.breadcrumb.profile",
  analytics: "web.provider.sidebar.items.analytics",
  addons: "web.provider.breadcrumb.addons",
  ads: "web.provider.sidebar.items.paidAds",
  ai: "web.provider.breadcrumb.ai",
  "appointment-activity": "web.provider.settings.tabs.appointmentActivity",
  billing: "provider.mobile.screens.settingsIndex.billingInvoices",
  "business-description": "web.provider.breadcrumb.businessDescription",
  "calendar-integration": "web.provider.breadcrumb.calendarIntegration",
  "cancellation-policies": "web.provider.breadcrumb.cancellationPolicies",
  "customer-visibility": "web.provider.breadcrumb.customerVisibility",
  distance: "web.provider.breadcrumb.distance",
  gallery: "web.provider.breadcrumb.gallery",
  integrations: "web.provider.breadcrumb.integrations",
  "marketing-integrations": "web.provider.breadcrumb.marketingIntegrations",
  "note-templates": "web.provider.breadcrumb.noteTemplates",
  "operating-hours": "web.provider.sidebar.items.operatingHours",
  "payout-accounts": "web.provider.sidebar.items.bankAccounts",
  "service-area": "web.provider.breadcrumb.serviceArea",
  "service-zones": "web.provider.breadcrumb.serviceZones",
  tips: "web.provider.breadcrumb.tips",
  "upgrade-to-salon": "web.provider.breadcrumb.upgradeToSalon",
  verification: "web.provider.breadcrumb.verification",
  "yoco-terminals": "web.provider.breadcrumb.yocoTerminals",
  "blocked-time": "web.provider.breadcrumb.blockedTime",
  "business-details": "web.provider.breadcrumb.businessDetails",
  "closed-periods": "web.provider.sidebar.items.closedPeriods",
  "group-appointments": "web.provider.breadcrumb.groupAppointments",
  "online-booking": "web.provider.breadcrumb.onlineBooking",
  invoices: "web.provider.breadcrumb.invoices",
  email: "web.provider.breadcrumb.email",
  twilio: "web.provider.breadcrumb.twilio",
  memberships: "web.provider.sidebar.items.memberships",
  menu: "web.provider.breadcrumb.serviceMenu",
  "card-machines": "web.provider.sidebar.items.cardMachines",
  "gift-cards": "web.provider.breadcrumb.giftCards",
  "paystack-terminal": "web.provider.sidebar.items.paystackTerminal",
  "receipt-sequencing": "web.provider.breadcrumb.receiptSequencing",
  "receipt-template": "web.provider.breadcrumb.receiptTemplate",
  taxes: "web.provider.breadcrumb.taxes",
  "terminal-integrations": "web.provider.breadcrumb.terminalIntegrations",
  "terminal-merchant-application": "web.provider.breadcrumb.terminalMerchantApplication",
  "terminal-payment-return": "web.provider.breadcrumb.terminalPaymentReturn",
  "terminal-shop": "web.provider.breadcrumb.terminalShop",
  "travel-fees": "web.provider.breadcrumb.travelFees",
  upselling: "web.provider.breadcrumb.upselling",
  "yoco-devices": "web.provider.breadcrumb.yocoDevices",
  "yoco-integration": "web.provider.sidebar.items.yoco",
  commissions: "web.provider.breadcrumb.commissions",
  permissions: "web.provider.breadcrumb.permissions",
  roles: "web.provider.breadcrumb.roles",
  "time-off-types": "web.provider.breadcrumb.timeOffTypes",
  distribution: "web.provider.breadcrumb.tipDistribution",
  cancellations: "web.provider.breadcrumb.cancellations",
  "no-shows": "web.provider.breadcrumb.noShows",
  status: "web.provider.common.statusLabel",
  summary: "web.provider.breadcrumb.summary",
  business: "web.provider.breadcrumb.business",
  comparison: "web.provider.breadcrumb.comparison",
  overview: "web.provider.breadcrumb.overview",
  "lifetime-value": "web.provider.breadcrumb.lifetimeValue",
  retention: "web.provider.breadcrumb.retention",
  "end-of-day": "web.provider.breadcrumb.endOfDay",
  redemptions: "web.provider.breadcrumb.redemptions",
  occupancy: "web.provider.breadcrumb.occupancy",
  usage: "web.provider.common.usage",
  methods: "web.provider.breadcrumb.methods",
  refunds: "web.provider.breadcrumb.refunds",
  inventory: "web.provider.breadcrumb.inventory",
  commission: "web.provider.breadcrumb.commission",
  hours: "web.provider.breadcrumb.hours",
  performance: "web.provider.breadcrumb.performance",
  "paystack-terminal-reconciliation": "web.provider.breadcrumb.paystackTerminalReconciliation",
  "yoco-reconciliation": "web.provider.breadcrumb.yocoReconciliation",
  "payment-return": "web.provider.breadcrumb.paymentReturn",
  "colors-icons": "web.provider.breadcrumb.colorsIcons",
  "display-preferences": "web.provider.breadcrumb.displayPreferences",
  links: "web.provider.breadcrumb.links",
  "cancellation-reasons": "web.provider.breadcrumb.cancellationReasons",
  list: "web.provider.breadcrumb.list",
  vendor: "web.provider.breadcrumb.vendor",
};

function isDynamicSegment(segment: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(segment) || /^\d+$/.test(segment);
}

export function ProviderBreadcrumb() {
  const { t } = useTranslation();
  const pathname = usePathname();

  const paths = useMemo(() => {
    return pathname
      .split("/")
      .filter((p) => p && p !== "provider")
      .map((segment) => {
        const key = SEGMENT_KEYS[segment];
        const label = key
          ? t(key)
          : isDynamicSegment(segment)
            ? t("web.provider.breadcrumb.details")
            : t("web.provider.breadcrumb.unknownSegment", { segment });
        return { path: segment, label };
      });
  }, [pathname, t]);

  if (paths.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 overflow-hidden">
      <Link
        href="/provider/dashboard"
        className="flex items-center gap-1 hover:text-primary transition-colors flex-shrink-0"
      >
        <Home className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{t("web.provider.sidebar.items.dashboard")}</span>
      </Link>
      {paths.map((item, index) => {
        const isLast = index === paths.length - 1;
        const href = `/provider/${paths.slice(0, index + 1).map((p) => p.path).join("/")}`;

        return (
          <React.Fragment key={`${item.path}-${index}`}>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 rtl:rotate-180" />
            {isLast ? (
              <span className="text-gray-900 font-medium truncate">{item.label}</span>
            ) : (
              <Link
                href={href}
                className="hover:text-primary transition-colors truncate"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
