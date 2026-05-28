"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";

type SettingsItem = { title: string; description: string; href: string; isUpgrade?: boolean };

const settingsCategories: { id: string; title: string; description: string; items: SettingsItem[] }[] = [
  {
    id: "appointment-activity",
    title: "Appointment Activity",
    description: "Manage appointment settings and preferences",
    items: [
      { title: "Upgrade to Salon", description: "Unlock team management and advanced features", href: "/provider/settings/upgrade-to-salon", isUpgrade: true },
      { title: "Appointment Settings", description: "Configure default appointment status and confirmation behavior", href: "/provider/settings/appointments" },
      { title: "Business details", description: "Configure your business information", href: "/provider/settings/appointment-activity/business-details" },
      { title: "Business Description", description: "Edit your business description that customers see", href: "/provider/settings/business-description" },
      { title: "Gallery & Images", description: "Upload and manage your business photos", href: "/provider/settings/gallery" },
      { title: "Billing details and invoices", description: "Manage billing and view invoices", href: "/provider/settings/billing" },
      { title: "Locations", description: "Manage your business locations", href: "/provider/settings/locations" },
      { title: "Operating Hours", description: "Set opening and closing times for your locations", href: "/provider/settings/operating-hours" },
      { title: "House calls & travel", description: "Start with travel fees, then confirm radius and service zones", href: "/provider/settings/sales/travel-fees" },
      { title: "Distance Settings", description: "Configure service distance limits for house calls", href: "/provider/settings/distance" },
      { title: "Service Zones", description: "Service radius and at-home booking zones", href: "/provider/settings/service-zones" },
      { title: "Identity verification", description: "Verify your identity with Sumsub (KYC) for payouts", href: "/provider/settings/verification" },
      { title: "Online booking", description: "Configure online booking settings", href: "/provider/settings/appointment-activity/online-booking" },
      { title: "Group Appointments", description: "Enable and configure group booking for clients", href: "/provider/settings/appointment-activity/group-appointments" },
      { title: "Note Templates", description: "Create reusable note templates", href: "/provider/settings/note-templates" },
      { title: "Resources", description: "Manage resources and equipment", href: "/provider/settings/appointment-activity/resources" },
      { title: "Business closed periods", description: "Set holiday and closure dates", href: "/provider/settings/appointment-activity/closed-periods" },
      { title: "Blocked time types", description: "Configure blocked time options", href: "/provider/settings/appointment-activity/blocked-time" },
      { title: "Calendar Integration", description: "Sync with Google Calendar, Apple Calendar, and Outlook", href: "/provider/settings/calendar-integration" },
      { title: "Calendar display", description: "Display preferences for the calendar", href: "/provider/settings/calendar/display-preferences" },
      { title: "Calendar colors & icons", description: "Colors and icons for appointments", href: "/provider/settings/calendar/colors-icons" },
      { title: "Calendar links", description: "Booking and calendar links", href: "/provider/settings/calendar/links" },
      { title: "Waitlist settings", description: "Configure waitlist behavior", href: "/provider/settings/appointment-activity/waitlist" },
    ],
  },
  {
    id: "clients",
    title: "Clients",
    description: "Client management and preferences",
    items: [
      { title: "Client List", description: "View and manage your clients", href: "/provider/settings/clients/list" },
      { title: "Referral Sources", description: "Track where clients come from", href: "/provider/settings/clients/referrals" },
      { title: "Cancellation Reasons", description: "Manage cancellation reasons", href: "/provider/settings/clients/cancellation-reasons" },
      { title: "Cancellation Policies", description: "Configure cancellation and refund policies", href: "/provider/settings/cancellation-policies" },
      { title: "Customer Visibility", description: "Control how customer and salon lists are displayed", href: "/provider/settings/customer-visibility" },
    ],
  },
  {
    id: "services",
    title: "Services",
    description: "Service menu and membership settings",
    items: [
      { title: "Services Menu", description: "Manage your service offerings", href: "/provider/settings/services/menu" },
      { title: "Packages", description: "Service and product bundles", href: "/provider/packages" },
      { title: "Service Addons", description: "Manage addons, products, and upgrades", href: "/provider/settings/addons" },
      { title: "Memberships", description: "Set up membership plans", href: "/provider/settings/services/memberships" },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    description: "Sales and payment settings",
    items: [
      { title: "Payout center", description: "Balance, schedule, statements, and payout history", href: "/provider/payouts" },
      { title: "Payout Accounts", description: "Manage bank accounts for receiving payouts", href: "/provider/settings/payout-accounts" },
      { title: "Payment Methods", description: "Enable or disable cash, online, and gift card payment options", href: "/provider/settings/payments" },
      { title: "Subscription & plan", description: "Manage your Beautonomi plan, billing period, upgrades, renewals, and cancellations", href: "/provider/subscription" },
      { title: "Yoco Integration", description: "Connect and manage Yoco payment devices", href: "/provider/settings/sales/yoco-integration" },
      { title: "Paystack Terminal", description: "Create QR/link terminals for in-person payments that settle through payouts", href: "/provider/settings/sales/paystack-terminal" },
      { title: "Receipt Sequencing", description: "Configure receipt numbering", href: "/provider/settings/sales/receipt-sequencing" },
      { title: "Receipt Template", description: "Customize receipt design", href: "/provider/settings/sales/receipt-template" },
      { title: "Taxes", description: "Set up tax rates", href: "/provider/settings/sales/taxes" },
      { title: "Travel Fees", description: "House-call travel fee rules and live fee preview", href: "/provider/settings/sales/travel-fees" },
      { title: "Tips", description: "Tips are enabled by default; manage checkout tips and presets", href: "/provider/settings/sales/tips" },
      { title: "Tips Distribution", description: "Choose how tips are distributed between you and staff", href: "/provider/settings/tips/distribution" },
      { title: "Gift Cards", description: "Gift card settings", href: "/provider/settings/sales/gift-cards" },
      { title: "Upselling", description: "Upselling preferences", href: "/provider/settings/sales/upselling" },
    ],
  },
  {
    id: "team",
    title: "Team",
    description: "Team management and permissions",
    items: [
      { title: "Team members", description: "Manage your team", href: "/provider/team/members" },
      { title: "Payroll", description: "Pay runs and staff pay", href: "/provider/team/payroll" },
      { title: "Scheduled shifts", description: "View and manage shifts", href: "/provider/team/shifts" },
      { title: "Roles", description: "Create and manage team roles with permissions", href: "/provider/settings/team/roles" },
      { title: "Permissions", description: "Manage team permissions", href: "/provider/settings/team/permissions" },
      { title: "Commissions", description: "Configure commission rates", href: "/provider/settings/team/commissions" },
      { title: "Time off types", description: "Manage time off categories", href: "/provider/settings/team/time-off-types" },
      { title: "Team Notifications", description: "Configure notification preferences for each team member", href: "/provider/settings/team/notifications" },
    ],
  },
  {
    id: "marketing-integrations",
    title: "Marketing Integrations",
    description: "Connect third-party services to run effective marketing campaigns",
    items: [
      { title: "Paid ads (boosted listings)", description: "Create campaigns, set budget and targeting, track impressions and sales", href: "/provider/settings/ads" },
      { title: "Email Integration", description: "Connect SendGrid or Mailchimp for email marketing campaigns", href: "/provider/settings/integrations/email" },
      { title: "Twilio Integration", description: "Connect Twilio for SMS and WhatsApp marketing campaigns", href: "/provider/settings/integrations/twilio" },
    ],
  },
  {
    id: "account",
    title: "Account",
    description: "Account settings, security, and privacy",
    // Account routes stay inside the provider shell, while reusing the
    // user-scoped account APIs behind the scenes.
    items: [
      { title: "Notification Preferences", description: "Manage how you receive notifications", href: "/provider/settings/notifications" },
      { title: "Login & Security", description: "Change password, enable two-factor authentication, and review active sessions", href: "/provider/account/login-and-security" },
      { title: "Personal Info", description: "Update your name, email, phone number, and profile photo", href: "/provider/account/profile" },
      { title: "Privacy & Sharing", description: "Control what you share, cookies, marketing consent, and targeted advertising", href: "/provider/account/privacy-and-sharing" },
      { title: "Data Rights & Export", description: "Request a copy of your data or delete your account (GDPR/POPIA)", href: "/provider/account/data-rights" },
      { title: "Preferences", description: "Language, region, currency, and accessibility preferences", href: "/provider/account/preferences" },
    ],
  },
];

export default function ProviderSettings() {
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");

  useEffect(() => {
    loadProviderInfo();
  }, []);

  const loadProviderInfo = async () => {
    try {
      // Try to get provider info from various possible endpoints
      try {
        const response = await fetcher.get<{ data: { business_type: string } }>(
          "/api/me/provider"
        );
        setBusinessType(response.data?.business_type || null);
      } catch {
        // Fallback: try to get from provider profile
        try {
          const response = await fetcher.get<{ data: { business_type: string } }>(
            "/api/provider/profile"
          );
          setBusinessType(response.data?.business_type || null);
        } catch (err) {
          console.error("Could not load provider info:", err);
        }
      }
    } catch (error) {
      console.error("Error loading provider info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Business Settings"
        subtitle="Configure your business preferences"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings" }
        ]}
      />

      {/* Upgrade Banner for Freelancers */}
      {!isLoading && businessType === "freelancer" && (
        <Alert className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary-hover/5">
          <Sparkles className="w-4 h-4 text-primary" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <span className="font-medium text-primary">
                Ready to grow your business?
              </span>
              <span className="text-gray-700 ml-2">
                Upgrade to salon to unlock team management, multiple locations,
                and advanced features.
              </span>
            </div>
            <Link href="/provider/settings/upgrade-to-salon">
              <button className="ml-4 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-md text-sm font-medium transition-colors">
                Upgrade Now
              </button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="appointment-activity" className="w-full max-w-full overflow-x-hidden">
        <div 
          className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="min-w-max sm:min-w-0">
            <TabsList className="inline-flex h-auto w-full sm:w-auto sm:grid sm:grid-cols-7 gap-1 sm:gap-2 bg-transparent p-0 sm:p-1 sm:bg-muted rounded-none sm:rounded-md border-b border-gray-200 sm:border-b-0">
              <TabsTrigger 
                value="appointment-activity"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Appointment Activity
              </TabsTrigger>
              <TabsTrigger 
                value="clients"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Clients
              </TabsTrigger>
              <TabsTrigger 
                value="services"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Services
              </TabsTrigger>
              <TabsTrigger 
                value="sales"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Sales
              </TabsTrigger>
              <TabsTrigger 
                value="team"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Team
              </TabsTrigger>
              <TabsTrigger 
                value="marketing-integrations"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Marketing
              </TabsTrigger>
              <TabsTrigger 
                value="account"
                className="flex-shrink-0 px-4 sm:px-3 py-3 sm:py-1.5 text-sm font-medium rounded-none sm:rounded-sm border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent sm:data-[state=active]:bg-primary data-[state=active]:text-primary sm:data-[state=active]:text-white transition-all duration-200 hover:text-primary sm:hover:text-white whitespace-nowrap"
              >
                Account
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {settingsCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-6">
            <SectionCard>
              <h3 className="text-lg font-semibold mb-2">{category.title}</h3>
              <p className="text-sm text-gray-600 mb-6">{category.description}</p>
              <div className="space-y-2">
                {category.items
                  .filter((item) => {
                    if (!yocoEnabled && item.href.includes("/yoco")) {
                      return false;
                    }
                    if (!paystackTerminalEnabled && item.href.includes("/paystack-terminal")) {
                      return false;
                    }
                    // Only show upgrade option for freelancers
                    if (item.isUpgrade) {
                      return businessType === "freelancer";
                    }
                    return true;
                  })
                  .map((item, index) => {
                    const isUpgrade = item.isUpgrade;
                    return (
                      <Link
                        key={index}
                        href={item.href}
                        className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                          isUpgrade
                            ? "border-primary bg-gradient-to-r from-primary/5 to-primary-hover/5 hover:from-primary/10 hover:to-primary-hover/10"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isUpgrade && (
                            <Sparkles className="w-5 h-5 text-primary" />
                          )}
                          <div>
                            <h4
                              className={`font-medium ${
                                isUpgrade ? "text-primary" : ""
                              }`}
                            >
                              {item.title}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </Link>
                    );
                  })}
              </div>
            </SectionCard>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
