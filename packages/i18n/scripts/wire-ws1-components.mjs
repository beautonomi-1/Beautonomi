#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content);
  console.log("Updated", rel);
}

function patch(rel, ...replacements) {
  let s = read(rel);
  for (const [from, to] of replacements) {
    if (typeof from === "string") {
      if (!s.includes(from)) {
        console.warn(`[${rel}] missing: ${from.slice(0, 60)}...`);
        continue;
      }
      s = s.replace(from, to);
    } else {
      s = s.replace(from, to);
    }
  }
  write(rel, s);
}

// BookingCancelDialog
patch(
  "apps/web/src/components/provider/booking/view/BookingCancelDialog.tsx",
  [
    'import { BookingActionButton } from "../ui";',
    'import { BookingActionButton } from "../ui";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "}: BookingCancelDialogProps) {",
    "}: BookingCancelDialogProps) {\n  const { t } = useTranslation();",
  ],
  ['toast.error("Booking cancelled but notification could not be sent");', 'toast.error(t("web.provider.bookings.cancelDialog.cancelledNotifyFailed"));'],
  ['toast.success("Booking cancelled");', 'toast.success(t("web.provider.bookings.cancelDialog.cancelled"));'],
  ['formatApiErrorMessage(error, "Failed to cancel booking")', 'formatApiErrorMessage(error, t("web.provider.bookings.cancelDialog.cancelFailed"))'],
  ["<DialogTitle>Cancel booking</DialogTitle>", '<DialogTitle>{t("web.provider.bookings.cancelDialog.title")}</DialogTitle>'],
  [
    `<DialogDescription>
            Select a cancellation reason. This is recorded for reporting and may affect fees.
          </DialogDescription>`,
    "<DialogDescription>{t(\"web.provider.bookings.cancelDialog.description\")}</DialogDescription>",
  ],
  [
    `This appointment time has already passed. Cancelling refunds the client in full.
                  If they didn&apos;t show up, mark it a no-show instead; if you did the work,
                  complete it.`,
    '{t("web.provider.bookings.cancelDialog.pastBookingWarning")}',
  ],
  ['<label className="text-xs font-medium text-gray-600 mb-1.5 block">Reason</label>', '<label className="text-xs font-medium text-gray-600 mb-1.5 block">{t("web.provider.bookings.cancelDialog.reasonLabel")}</label>'],
  ['<SelectItem value="normal">Normal cancellation</SelectItem>', '<SelectItem value="normal">{t("web.provider.bookings.cancelDialog.reasonNormal")}</SelectItem>'],
  ['<SelectItem value="late_cancel">Late cancellation</SelectItem>', '<SelectItem value="late_cancel">{t("web.provider.bookings.cancelDialog.reasonLateCancel")}</SelectItem>'],
  ['<SelectItem value="no_show">No show</SelectItem>', '<SelectItem value="no_show">{t("web.provider.bookings.cancelDialog.reasonNoShow")}</SelectItem>'],
  ['<p className="text-sm font-medium text-gray-900">Notify client</p>', '<p className="text-sm font-medium text-gray-900">{t("web.provider.bookings.cancelDialog.notifyClient")}</p>'],
  ['<p className="text-xs text-gray-500">Send cancellation notice</p>', '<p className="text-xs text-gray-500">{t("web.provider.bookings.cancelDialog.notifyClientHint")}</p>'],
  ['Cancelling…', '{t("web.provider.bookings.cancelDialog.cancelling")}'],
  ['"Cancel booking"', 't("web.provider.bookings.cancelDialog.cancelBooking")'],
  ['Keep booking', '{t("web.provider.bookings.cancelDialog.keepBooking")}'],
);

// BookingStatusActions
patch(
  "apps/web/src/components/provider/booking/view/BookingStatusActions.tsx",
  [
    'import { shouldSuppressNoShowAfterRunningLate } from "@/lib/bookings/lifecycle-running-late";',
    'import { shouldSuppressNoShowAfterRunningLate } from "@/lib/bookings/lifecycle-running-late";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "}: BookingStatusActionsProps) {",
    "}: BookingStatusActionsProps) {\n  const { t } = useTranslation();",
  ],
  ['toast.success("Service completed");', 'toast.success(t("web.provider.bookings.statusActions.serviceCompleted"));'],
  [
    'err instanceof Error ? err.message : "Failed to complete service"',
    'err instanceof Error ? err.message : t("web.provider.bookings.statusActions.completeFailed")',
  ],
  [
    '"This booking was fully refunded. Cancel it instead of marking completed."',
    't("web.provider.bookings.statusActions.refundedCompleteHint")',
  ],
  [
    '`${completionChecklist.blockingLabels.join(" · ")}\\n\\nFinish these steps or choose Complete anyway.`',
    't("web.provider.bookings.statusActions.checklistCompleteHint", { labels: completionChecklist.blockingLabels.join(" · ") })',
  ],
  [
    '"Capture payment before completing, or choose Complete anyway to settle later."',
    't("web.provider.bookings.statusActions.outstandingCompleteHint")',
  ],
  ['toast.error("You do not have permission for this action");', 'toast.error(t("web.provider.bookings.statusActions.noPermission"));'],
  ['toast.success("Journey started");', 'toast.success(t("web.provider.bookings.statusActions.journeyStarted"));'],
  ['toast.success("Arrival marked");', 'toast.success(t("web.provider.bookings.statusActions.arrivalMarked"));'],
  ['toast.success("Service started");', 'toast.success(t("web.provider.bookings.statusActions.serviceStarted"));'],
  ['toast.success("Booking status updated");', 'toast.success(t("web.provider.bookings.statusActions.statusUpdated"));'],
  [
    'err instanceof Error ? err.message : "Failed to update status"',
    'err instanceof Error ? err.message : t("web.provider.bookings.statusActions.statusUpdateFailed")',
  ],
  ['toast.success("ETA updated");', 'toast.success(t("web.provider.bookings.statusActions.etaUpdated"));'],
  [
    'err instanceof Error ? err.message : "Failed to update ETA"',
    'err instanceof Error ? err.message : t("web.provider.bookings.statusActions.etaUpdateFailed")',
  ],
  [
    'message="You do not have permission to update booking status."',
    'message={t("web.provider.bookings.statusActions.noStatusPermission")}',
  ],
  ['Customer running late', '{t("web.provider.bookings.statusActions.customerRunningLate")}'],
  [
    '? ` (${appointment.customer_running_late_minutes ?? raw.customer_running_late_minutes} min)`',
    '? t("web.provider.bookings.statusActions.customerRunningLateMinutes", { minutes: appointment.customer_running_late_minutes ?? raw.customer_running_late_minutes })',
  ],
  ["<p>You told them you&apos;ll wait.</p>", '<p>{t("web.provider.bookings.statusActions.willWaitAcknowledged")}</p>'],
  ['toast.success("Customer notified — you\\u2019ll wait");', 'toast.success(t("web.provider.bookings.statusActions.notifyWillWait"));'],
  [
    'err instanceof FetchError ? err.message : "Could not acknowledge"',
    'err instanceof FetchError ? err.message : t("web.provider.bookings.statusActions.acknowledgeFailed")',
  ],
  ['{ackBusy ? "Sending\\u2026" : "OK, we\\u2019ll wait"}', '{ackBusy ? t("web.provider.bookings.statusActions.sending") : t("web.provider.bookings.statusActions.okWeWillWait")}'],
  ['Reschedule', '{t("web.provider.bookings.statusActions.reschedule")}'],
  [
    `You&apos;re past the estimated arrival. Update your ETA so the client knows you&apos;re
                running a little late.`,
    '{t("web.provider.bookings.statusActions.pastEtaWarning")}',
  ],
  ['{isUpdatingEta ? "Updating ETA…" : "Update ETA"}', '{isUpdatingEta ? t("web.provider.bookings.statusActions.updatingEta") : t("web.provider.bookings.statusActions.updateEta")}'],
  ['Updating…', '{t("web.provider.bookings.statusActions.updating")}'],
  ['Open full booking page', '{t("web.provider.bookings.statusActions.openFullPage")}'],
);

// ProviderTopbar
patch(
  "apps/web/src/components/provider/ProviderTopbar.tsx",
  [
    'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function ProviderTopbar() {",
    "export function ProviderTopbar() {\n  const { t } = useTranslation();",
  ],
  [
    `const segments: [string, string][] = [
      ["/provider/calendar", "Calendar"],
      ["/provider/dashboard", "Dashboard"],
      ["/provider/clients", "Clients"],
      ["/provider/bookings", "Bookings"],
      ["/provider/appointments", "Bookings"],
      ["/provider/sales", "Sales"],
      ["/provider/finance", "Finance"],
      ["/provider/analytics", "Analytics"],
      ["/provider/reports", "Reports"],
      ["/provider/messaging", "Messages"],
      ["/provider/settings", "Settings"],
      ["/provider/team", "Team"],
      ["/provider/catalogue", "Catalogue"],
      ["/provider/ecommerce", "E-Commerce"],
      ["/provider/notifications", "Notifications"],
      ["/provider/waitlist", "Waitlist"],
      ["/provider/waiting-room", "Waiting Room"],
      ["/provider/explore", "Explore"],
      ["/provider/packages", "Packages"],
      ["/provider/payouts", "Payouts"],
      ["/provider/reviews", "Reviews"],
      ["/provider/schedule", "Schedule"],
      ["/provider/forms", "Forms"],
      ["/provider/resources", "Resources"],
      ["/provider/subscription", "Subscription"],
      ["/provider/orders", "Orders"],
      ["/provider/recurring-appointments", "Recurring"],
      ["/provider/express-booking", "Booking links"],
      ["/provider/front-desk", "Front desk"],
      ["/provider/more", "More"],
      ["/provider/gamification", "Rewards"],
    ];`,
    `const segments: [string, string][] = [
      ["/provider/calendar", t("web.provider.topbar.mobileTitles.calendar")],
      ["/provider/dashboard", t("web.provider.topbar.mobileTitles.dashboard")],
      ["/provider/clients", t("web.provider.topbar.mobileTitles.clients")],
      ["/provider/bookings", t("web.provider.topbar.mobileTitles.bookings")],
      ["/provider/appointments", t("web.provider.topbar.mobileTitles.bookings")],
      ["/provider/sales", t("web.provider.topbar.mobileTitles.sales")],
      ["/provider/finance", t("web.provider.topbar.mobileTitles.finance")],
      ["/provider/analytics", t("web.provider.topbar.mobileTitles.analytics")],
      ["/provider/reports", t("web.provider.topbar.mobileTitles.reports")],
      ["/provider/messaging", t("web.provider.topbar.mobileTitles.messages")],
      ["/provider/settings", t("web.provider.topbar.mobileTitles.settings")],
      ["/provider/team", t("web.provider.topbar.mobileTitles.team")],
      ["/provider/catalogue", t("web.provider.topbar.mobileTitles.catalogue")],
      ["/provider/ecommerce", t("web.provider.topbar.mobileTitles.ecommerce")],
      ["/provider/notifications", t("web.provider.topbar.mobileTitles.notifications")],
      ["/provider/waitlist", t("web.provider.topbar.mobileTitles.waitlist")],
      ["/provider/waiting-room", t("web.provider.topbar.mobileTitles.waitingRoom")],
      ["/provider/explore", t("web.provider.topbar.mobileTitles.explore")],
      ["/provider/packages", t("web.provider.topbar.mobileTitles.packages")],
      ["/provider/payouts", t("web.provider.topbar.mobileTitles.payouts")],
      ["/provider/reviews", t("web.provider.topbar.mobileTitles.reviews")],
      ["/provider/schedule", t("web.provider.topbar.mobileTitles.schedule")],
      ["/provider/forms", t("web.provider.topbar.mobileTitles.forms")],
      ["/provider/resources", t("web.provider.topbar.mobileTitles.resources")],
      ["/provider/subscription", t("web.provider.topbar.mobileTitles.subscription")],
      ["/provider/orders", t("web.provider.topbar.mobileTitles.orders")],
      ["/provider/recurring-appointments", t("web.provider.topbar.mobileTitles.recurring")],
      ["/provider/express-booking", t("web.provider.topbar.mobileTitles.bookingLinks")],
      ["/provider/front-desk", t("web.provider.topbar.mobileTitles.frontDesk")],
      ["/provider/more", t("web.provider.topbar.mobileTitles.more")],
      ["/provider/gamification", t("web.provider.topbar.mobileTitles.rewards")],
    ];`,
  ],
  ['placeholder="Search clients, appointments, services..."', 'placeholder={t("web.provider.topbar.searchPlaceholder")}'],
  ['placeholder="Search..."', 'placeholder={t("web.provider.topbar.searchPlaceholderMobile")}'],
  ['{setupCompletion}% Complete', '{t("web.provider.topbar.setupComplete", { percent: setupCompletion })}'],
  [
    'alt={branding?.site_name ? `${branding.site_name} logo` : "Beautonomi logo"}',
    'alt={branding?.site_name ? t("web.provider.topbar.logoAlt", { name: branding.site_name }) : t("web.provider.topbar.logoAlt", { name: "Beautonomi" })}',
  ],
  ['alt={user?.full_name || "User"}', 'alt={user?.full_name || t("web.provider.topbar.userFallback")}'],
  ['{user?.full_name || provider?.owner_name || "User"}', '{user?.full_name || provider?.owner_name || t("web.provider.topbar.userFallback")}'],
  ['{provider?.business_name || "Business"}', '{provider?.business_name || t("web.provider.topbar.businessFallback")}'],
  ['My Profile', '{t("web.provider.topbar.menu.myProfile")}'],
  ['Business Settings', '{t("web.provider.topbar.menu.businessSettings")}'],
  ['Subscription', '{t("web.provider.topbar.menu.subscription")}'],
  ['Login & Security', '{t("web.provider.topbar.menu.loginSecurity")}'],
  ['Privacy & Sharing', '{t("web.provider.topbar.menu.privacySharing")}'],
  ['Data Rights & Export', '{t("web.provider.topbar.menu.dataRights")}'],
  ['Help Centre', '{t("web.provider.topbar.menu.helpCentre")}'],
  ['Learning Center', '{t("web.provider.topbar.menu.learningCenter")}'],
  ['Contact support', '{t("web.provider.topbar.menu.contactSupport")}'],
  ['Resources', '{t("web.provider.topbar.menu.resources")}'],
  ['Sign Out', '{t("web.provider.topbar.menu.signOut")}'],
);

// ProviderSidebar - switch to labelKey/titleKey
let sidebar = read("apps/web/src/components/provider/ProviderSidebar.tsx");
if (!sidebar.includes("useTranslation")) {
  sidebar = sidebar.replace(
    'import type { StaffPermissions } from "@/lib/auth/permissions";',
    'import type { StaffPermissions } from "@/lib/auth/permissions";\nimport { useTranslation } from "@beautonomi/i18n";',
  );
}
sidebar = sidebar.replace(
  "type NavItemConfig = {\n  icon: React.ElementType;\n  label: string;",
  "type NavItemConfig = {\n  icon: React.ElementType;\n  labelKey: string;",
);
sidebar = sidebar.replace(
  "const navigationSections: { title: string; items: NavItemConfig[] }[] = [",
  "const navigationSections: { titleKey: string; items: NavItemConfig[] }[] = [",
);
sidebar = sidebar.replace(
  /label: "([^"]+)",/g,
  (match, _label, offset) => {
    const slice = sidebar.slice(Math.max(0, offset - 200), offset);
    const hrefMatch = slice.match(/href: "([^"]+)"/);
    if (!hrefMatch) return match;
    const href = hrefMatch[1];
    const keyMap = {
      "/provider/dashboard": "web.provider.sidebar.items.dashboard",
      "/provider/calendar": "web.provider.sidebar.items.calendar",
      "/provider/bookings": "web.provider.sidebar.items.bookings",
      "/provider/waitlist": "web.provider.sidebar.items.waitlist",
      "/provider/recurring-appointments": "web.provider.sidebar.items.recurring",
      "/provider/group-bookings": "web.provider.sidebar.items.groupBookings",
      "/provider/front-desk": "web.provider.sidebar.items.frontDesk",
      "/provider/waiting-room": "web.provider.sidebar.items.waitingRoom",
      "/provider/clients": "web.provider.sidebar.items.clients",
      "/provider/schedule": "web.provider.sidebar.items.schedule",
      "/provider/settings/operating-hours": "web.provider.sidebar.items.operatingHours",
      "/provider/team/shifts": "web.provider.sidebar.items.shifts",
      "/provider/time-blocks": "web.provider.sidebar.items.timeBlocks",
      "/provider/team/days-off": "web.provider.sidebar.items.daysOff",
      "/provider/settings/appointment-activity/closed-periods": "web.provider.sidebar.items.closedPeriods",
      "/provider/resources-forms": "web.provider.sidebar.items.resourcesForms",
      "/provider/resources": "web.provider.sidebar.items.resources",
      "/provider/forms": "web.provider.sidebar.items.forms",
      "/provider/ecommerce/orders": "web.provider.sidebar.items.orders",
      "/provider/ecommerce/returns": "web.provider.sidebar.items.returns",
      "/provider/ecommerce": "web.provider.sidebar.items.ecommerce",
      "/provider/ecommerce/products": "web.provider.sidebar.items.products",
      "/provider/ecommerce/shipping": "web.provider.sidebar.items.shippingCollection",
      "/provider/sales": "web.provider.sidebar.items.sales",
      "/provider/finance": "web.provider.sidebar.items.finance",
      "/provider/settings/payout-accounts": "web.provider.sidebar.items.bankAccounts",
      "/provider/settings/sales/card-machines": "web.provider.sidebar.items.cardMachines",
      "/provider/settings/sales/yoco-integration": "web.provider.sidebar.items.yoco",
      "/provider/settings/sales/paystack-terminal": "web.provider.sidebar.items.paystackTerminal",
      "/provider/subscription": "web.provider.sidebar.items.subscription",
      "/provider/analytics": "web.provider.sidebar.items.analytics",
      "/provider/reports": "web.provider.sidebar.items.reports",
      "/provider/gamification": "web.provider.sidebar.items.rewardsBadges",
      "/provider/catalogue": "web.provider.sidebar.items.catalogue",
      "/provider/packages": "web.provider.sidebar.items.packages",
      "/provider/settings/services/memberships": "web.provider.sidebar.items.memberships",
      "/provider/explore": "web.provider.sidebar.items.exploreContent",
      "/provider/team": "web.provider.sidebar.items.team",
      "/provider/team/members": "web.provider.sidebar.items.teamMembers",
      "/provider/team/payroll": "web.provider.sidebar.items.payroll",
      "/provider/team/my-earnings": "web.provider.sidebar.items.myEarnings",
      "/provider/reviews": "web.provider.sidebar.items.reviews",
      "/provider/messaging": "web.provider.sidebar.items.messages",
      "/provider/marketing/automations": "web.provider.sidebar.items.marketing",
      "/provider/settings/ads": "web.provider.sidebar.items.paidAds",
      "/provider/express-booking": "web.provider.sidebar.items.bookingLinks",
    };
    const key = keyMap[href];
    return key ? `labelKey: "${key}",` : match.replace("label:", "labelKey:");
  },
);
sidebar = sidebar
  .replace('title: "Main"', 'titleKey: "web.provider.sidebar.sections.main"')
  .replace('title: "Operations"', 'titleKey: "web.provider.sidebar.sections.operations"')
  .replace('title: "Schedule"', 'titleKey: "web.provider.sidebar.sections.schedule"')
  .replace('title: "Resources & Forms"', 'titleKey: "web.provider.sidebar.sections.resourcesForms"')
  .replace('title: "Orders"', 'titleKey: "web.provider.sidebar.sections.orders"')
  .replace('title: "E-Commerce"', 'titleKey: "web.provider.sidebar.sections.ecommerce"')
  .replace('title: "Business"', 'titleKey: "web.provider.sidebar.sections.business"')
  .replace('title: "Team & Marketing"', 'titleKey: "web.provider.sidebar.sections.teamMarketing"');

sidebar = sidebar.replace(
  `const bottomItems = [
  { icon: HelpCircle, label: "Help & Support", href: "/help" },
  { icon: Ticket, label: "My tickets", href: "/help/my-tickets" },
  { icon: Settings, label: "Settings", href: "/provider/settings" },
];`,
  `const bottomItems = [
  { icon: HelpCircle, labelKey: "web.provider.sidebar.items.helpSupport", href: "/help" },
  { icon: Ticket, labelKey: "web.provider.sidebar.items.myTickets", href: "/help/my-tickets" },
  { icon: Settings, labelKey: "web.provider.sidebar.items.settings", href: "/provider/settings" },
];`,
);

if (!sidebar.includes("const { t } = useTranslation()")) {
  sidebar = sidebar.replace(
    "export function ProviderSidebar() {",
    "export function ProviderSidebar() {\n  const { t } = useTranslation();",
  );
}

sidebar = sidebar.replace(
  'if (section.title === "E-Commerce"',
  'if (section.titleKey === "web.provider.sidebar.sections.ecommerce"',
);
sidebar = sidebar.replace(
  '{ icon: Store, label: "E-Commerce", href: "/provider/ecommerce/orders", permission: undefined }',
  '{ icon: Store, labelKey: "web.provider.sidebar.items.ecommerce", href: "/provider/ecommerce/orders", permission: undefined }',
);
sidebar = sidebar.replace(/key={section\.title}/g, "key={section.titleKey}");
sidebar = sidebar.replace("{section.title}", "{t(section.titleKey)}");
sidebar = sidebar.replace("{item.label}", "{t(item.labelKey)}");
sidebar = sidebar.replace(
  'aria-label="Collapse sidebar"',
  'aria-label={t("web.provider.sidebar.items.collapseSidebar")}',
);
sidebar = sidebar.replace(
  'aria-label="Expand sidebar"',
  'aria-label={t("web.provider.sidebar.items.expandSidebar")}',
);
sidebar = sidebar.replace(
  '<span className="text-sm font-medium pointer-events-none">Sign Out</span>',
  '<span className="text-sm font-medium pointer-events-none">{t("web.provider.sidebar.items.signOut")}</span>',
);
sidebar = sidebar.replace(
  `Sign Out
              </TooltipContent>`,
  `{t("web.provider.sidebar.items.signOut")}
              </TooltipContent>`,
);
sidebar = sidebar.replace(
  '{item.badge && (',
  `{item.badge && (
                            `,
);
sidebar = sidebar.replace(
  '{item.badge}',
  '{t("web.provider.sidebar.items.badgeHot")}',
);

write("apps/web/src/components/provider/ProviderSidebar.tsx", sidebar);

// Booking detail page - import + hook + common strings
const detailPath = "apps/web/src/app/provider/bookings/[id]/page.tsx";
let detail = read(detailPath);
if (!detail.includes("useTranslation")) {
  detail = detail.replace(
    'import { usePermissions } from "@/hooks/usePermissions";',
    'import { usePermissions } from "@/hooks/usePermissions";\nimport { useTranslation } from "@beautonomi/i18n";',
  );
  detail = detail.replace(
    "export default function ProviderBookingDetail() {",
    "export default function ProviderBookingDetail() {\n  const { t } = useTranslation();",
  );
}

const detailReplacements = [
  ['? "Request timed out. Please try again."', '? t("web.provider.common.requestTimeout")'],
  [': "Failed to load booking";', ': t("web.provider.bookings.detail.loadFailed");'],
  ['loadingMessage="Loading booking details..."', 'loadingMessage={t("web.provider.bookings.detail.loading")}'],
  ['title="Booking not found"', 'title={t("web.provider.bookings.detail.notFoundTitle")}'],
  ['description={error || "The booking you\'re looking for doesn\'t exist"}', 'description={error || t("web.provider.bookings.detail.notFoundDescription")}'],
  ['label: "Go Back"', 'label: t("web.provider.bookings.detail.goBack")'],
  ['toast.success("Service started");', 'toast.success(t("web.provider.bookings.detail.toast.serviceStarted"));'],
  ['toast.success("Service completed");', 'toast.success(t("web.provider.bookings.detail.toast.serviceCompleted"));'],
  ['setConflictError("This booking changed, reload");', 'setConflictError(t("web.provider.bookings.detail.toast.bookingChanged"));'],
  ['toast.error("This booking changed, reload");', 'toast.error(t("web.provider.bookings.detail.toast.bookingChanged"));'],
  ['toast.success("Booking status updated");', 'toast.success(t("web.provider.bookings.detail.toast.statusUpdated"));'],
  [': "Failed to update booking status";', ': t("web.provider.bookings.detail.toast.statusUpdateFailed");'],
  ['toast.success("Booking marked as no-show");', 'toast.success(t("web.provider.bookings.detail.toast.markedNoShow"));'],
  [': "Failed to mark no-show";', ': t("web.provider.bookings.detail.toast.noShowFailed");'],
  ['cancellation_reason: cancellationReason || "No reason provided"', 'cancellation_reason: cancellationReason || t("web.provider.bookings.detail.toast.noReasonProvided")'],
  ['toast.success("Booking cancelled");', 'toast.success(t("web.provider.bookings.detail.toast.cancelled"));'],
  [': "Failed to cancel booking";', ': t("web.provider.bookings.detail.toast.cancelFailed");'],
  ['toast.error("Please enter a description");', 'toast.error(t("web.provider.bookings.detail.toast.enterDescription"));'],
  ['toast.error("Please enter a valid amount");', 'toast.error(t("web.provider.bookings.detail.toast.enterValidAmount"));'],
  ['toast.success("Additional charge sent — customer notified");', 'toast.success(t("web.provider.bookings.detail.toast.chargeSent"));'],
  [': "Failed to send additional charge");', ': t("web.provider.bookings.detail.toast.chargeSendFailed"));'],
  ['toast.success("Payment reminder sent to customer");', 'toast.success(t("web.provider.bookings.detail.toast.reminderSent"));'],
  [': "Failed to send reminder");', ': t("web.provider.bookings.detail.toast.reminderFailed"));'],
  ['toast.error("Please select both date and time");', 'toast.error(t("web.provider.bookings.detail.toast.selectDateTime"));'],
  ['toast.success("Booking rescheduled");', 'toast.success(t("web.provider.bookings.detail.toast.rescheduled"));'],
  ['toast.error("Failed to reschedule");', 'toast.error(t("web.provider.bookings.detail.toast.rescheduleFailed"));'],
  [
    '? "This booking has no remaining balance to collect (it may be overpaid). Refresh if you just recorded a payment elsewhere."',
    '? t("web.provider.bookings.detail.toast.noBalanceOverpaid")',
  ],
  [
    ': "There is no remaining balance on this booking."',
    ': t("web.provider.bookings.detail.toast.noBalance")',
  ],
  ['toast.success("Booking marked as paid");', 'toast.success(t("web.provider.bookings.detail.toast.markedPaid"));'],
  [': "Failed to mark as paid");', ': t("web.provider.bookings.detail.toast.markPaidFailed"));'],
  ['toast.error("Customer email is required for email delivery");', 'toast.error(t("web.provider.bookings.detail.toast.emailRequired"));'],
  ['toast.error("Customer phone number is required for SMS delivery");', 'toast.error(t("web.provider.bookings.detail.toast.phoneRequired"));'],
  ['? "Payment link sent via email and SMS"', '? t("web.provider.bookings.detail.sendLink.sentBoth")'],
  [': "Failed to send payment link");', ': t("web.provider.bookings.detail.toast.chargeSendFailed"));'],
  ['toast.success("Charge marked as paid");', 'toast.success(t("web.provider.bookings.detail.toast.chargeMarkedPaid"));'],
  ['toast.error("Please enter a valid refund amount");', 'toast.error(t("web.provider.bookings.detail.toast.enterValidAmount"));'],
  ['toast.error("Please enter a refund reason");', 'toast.error(t("web.provider.bookings.detail.toast.enterRefundReason"));'],
  ['refundMethod === "cash" ? "Refund recorded (returned in person)" : "Refund added to wallet"', 'refundMethod === "cash" ? t("web.provider.bookings.detail.toast.refundCash") : t("web.provider.bookings.detail.toast.refundWallet")'],
  [': "Failed to process refund");', ': t("web.provider.bookings.detail.toast.refundFailed");'],
  ['toast.error("Start or complete the booking before recording a card payment.");', 'toast.error(t("web.provider.bookings.detail.toast.startBeforeCard"));'],
  ['toast.error("Could not build sale lines for this booking.");', 'toast.error(t("web.provider.bookings.detail.toast.cannotCharge"));'],
  ['name: "Booking balance due"', 'name: t("web.provider.bookings.detail.paymentMethods.bookingBalanceDue")'],
  ['toast.error("Could not prepare card payment.");', 'toast.error(t("web.provider.bookings.detail.toast.cardPaymentFailed"));'],
  ['toast.error("There is no remaining balance to collect.");', 'toast.error(t("web.provider.bookings.detail.toast.noBalanceCollect"));'],
  ['toast.error("No Paystack Terminal is ready for this booking.");', 'toast.error(t("web.provider.bookings.detail.toast.noPaystackTerminal"));'],
  [': "Failed to prepare Paystack Terminal payment.");', ': t("web.provider.bookings.detail.toast.paystackPrepareFailed"));'],
  ['toast.error("Missing payment reference");', 'toast.error(t("web.provider.bookings.detail.toast.missingReference"));'],
  ['toast.error("Missing sale record. Try again.");', 'toast.error(t("web.provider.bookings.detail.toast.missingSaleRecord"));'],
  ['toast.success("Booking payment recorded");', 'toast.success(t("web.provider.bookings.detail.toast.paymentRecorded"));'],
  ['toast.success("Notes saved");', 'toast.success(t("web.provider.bookings.detail.toast.notesSaved"));'],
  ['toast.error("Failed to save notes");', 'toast.error(t("web.provider.bookings.detail.toast.notesSaveFailed"));'],
  [': "Journey started."', ': t("web.provider.bookings.detail.toast.journeyStarted")'],
  [': "Failed to start journey");', ': t("web.provider.bookings.detail.toast.journeyFailed"));'],
  ['toast.error("Choose an ETA between 1 and 240 minutes");', 'toast.error(t("web.provider.bookings.detail.toast.etaRange"));'],
  ['toast.success("Marked as arrived.");', 'toast.success(t("web.provider.bookings.detail.toast.markedArrived"));'],
  [': "Failed to mark arrived");', ': t("web.provider.bookings.detail.toast.markArrivedFailed"));'],
  ['toast.success("Verified. You can start the service.");', 'toast.success(t("web.provider.bookings.detail.toast.verifiedCanStart"));'],
  [': "Failed to verify");', ': t("web.provider.bookings.detail.toast.verifyFailed"));'],
  ['toast.success("New code sent to customer.");', 'toast.success(t("web.provider.bookings.detail.toast.codeSent"));'],
  [': "Failed to resend");', ': t("web.provider.bookings.detail.toast.resendFailed"));'],
  ['toast.error("You do not have permission for this action");', 'toast.error(t("web.provider.bookings.detail.toast.noPermission"));'],
  ['← Back to Bookings', '{t("web.provider.bookings.detail.backToBookings")}'],
  ['? `Booking #${booking.booking_number}` : "Booking"', '? t("web.provider.bookings.detail.bookingNumber", { number: booking.booking_number }) : t("web.provider.bookings.detail.bookingTitle")'],
  ['View Receipt PDF', '{t("web.provider.bookings.detail.viewReceiptPdf")}'],
  ['<h2 className="text-xl font-semibold mb-4">Customer Information</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.customer.title")}</h2>'],
  ['<p className="text-sm text-gray-600">Name</p>', '<p className="text-sm text-gray-600">{t("web.provider.bookings.detail.customer.name")}</p>'],
  ['|| "Guest"', '|| t("web.provider.bookings.detail.customer.guest")'],
  ['? "review" : "reviews"', '? t("web.provider.bookings.detail.customer.review") : t("web.provider.bookings.detail.customer.reviews")'],
  ['<h2 className="text-xl font-semibold mb-4">Booking Details</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.bookingInfo.title")}</h2>'],
  ['<p className="text-sm text-gray-600">Date</p>', '<p className="text-sm text-gray-600">{t("web.provider.bookings.detail.bookingInfo.date")}</p>'],
  ['<p className="text-sm text-gray-600">Time</p>', '<p className="text-sm text-gray-600">{t("web.provider.bookings.detail.bookingInfo.time")}</p>'],
  ['<p className="text-sm text-gray-600">Location</p>', '<p className="text-sm text-gray-600">{t("web.provider.bookings.detail.bookingInfo.location")}</p>'],
  ['{booking.location_name || "At Salon"}', '{booking.location_name || t("web.provider.bookings.detail.bookingInfo.atSalon")}'],
  ['<p className="font-medium">At customer location</p>', '<p className="font-medium">{t("web.provider.bookings.detail.bookingInfo.atCustomerLocation")}</p>'],
  ['<p className="text-sm text-gray-600">Assigned Staff</p>', '<p className="text-sm text-gray-600">{t("web.provider.bookings.detail.bookingInfo.assignedStaff")}</p>'],
  ['<h2 className="text-xl font-semibold mb-4">At-home visit</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.atHome.title")}</h2>'],
  ['<h2 className="text-xl font-semibold mb-4">Services</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.services.title")}</h2>'],
  ['<p className="text-sm text-gray-500">No services</p>', '<p className="text-sm text-gray-500">{t("web.provider.bookings.detail.services.empty")}</p>'],
  ['<h2 className="text-xl font-semibold mb-4">Products</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.products.title")}</h2>'],
  ['<h2 className="text-xl font-semibold mb-4">Special Instructions</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.specialInstructions.title")}</h2>'],
  ['<h2 className="text-xl font-semibold mb-4">Form responses</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.forms.title")}</h2>'],
  ['<h2 className="text-xl font-semibold mb-4">Additional details</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.additionalDetails.title")}</h2>'],
  ['<h2 className="text-xl font-semibold mb-4">Payment Summary</h2>', '<h2 className="text-xl font-semibold mb-4">{t("web.provider.bookings.detail.paymentSummary.title")}</h2>'],
  ['<h2 className="text-xl font-semibold">Additional Charges</h2>', '<h2 className="text-xl font-semibold">{t("web.provider.bookings.detail.charges.title")}</h2>'],
  ['<h3 className="text-sm font-semibold text-gray-900">Payment Details</h3>', '<h3 className="text-sm font-semibold text-gray-900">{t("web.provider.bookings.detail.paymentDetails.title")}</h3>'],
  ['Next booking step', '{t("web.provider.bookings.detail.statusFlow.nextStep")}'],
  ['Mark as Paid', '{t("web.provider.bookings.detail.paymentActions.markAsPaid")}'],
  ['Issue Refund', '{t("web.provider.bookings.detail.paymentActions.issueRefund")}'],
  ['Customer Notifications', '{t("web.provider.bookings.detail.notifications.title")}'],
  ['Notes / Special Requests', '{t("web.provider.bookings.detail.notes.title")}'],
];

for (const [from, to] of detailReplacements) {
  if (detail.includes(from)) {
    detail = detail.replaceAll(from, to);
  } else {
    console.warn("[detail] missing:", from.slice(0, 50));
  }
}

write(detailPath, detail);

console.log("WS1 component wiring complete");
