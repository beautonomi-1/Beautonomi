"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Save, Globe, CreditCard, Bell, Palette, MessageSquare, BarChart3, Smartphone, MapPin, Car, QrCode, Search, Calendar, Building2, Plug, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import RoleGuard from "@/components/auth/RoleGuard";

interface PlatformSettings {
  branding: {
    site_name: string;
    logo_url: string;
    favicon_url: string;
    primary_color: string;
    secondary_color: string;
  };
  localization: {
    default_language: string;
    supported_languages: string[];
    default_currency: string;
    supported_currencies: string[];
    timezone: string;
  };
  payouts: {
    provider_payout_percentage: number;
    payout_schedule: "daily" | "weekly" | "monthly";
    minimum_payout_amount: number;
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    commission_enabled: boolean; // Enable/disable commission on providers
    platform_commission_percentage: number;
    show_service_fee_to_customer: boolean;
  };
  notifications: {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
  };
  paystack: {
    secret_key: string;
    public_key: string;
    use_transaction_splits: boolean;
    default_split_code?: string;
    transfer_otp_required: boolean;
    skip_payout_account_verification?: boolean;
    webhook_secret?: string;
  };
  verification: {
    otp_enabled: boolean;
    qr_code_enabled: boolean;
    require_verification: boolean;
  };
  onesignal: {
    app_id: string;
    rest_api_key: string;
    safari_web_id?: string;
    enabled: boolean;
  };
  mapbox: {
    access_token: string;
    public_token: string;
    enabled: boolean;
  };
  amplitude: {
    api_key: string;
    secret_key?: string;
    enabled: boolean;
  };
  google: {
    maps_api_key: string;
    places_api_key?: string;
    analytics_id?: string;
    enabled: boolean;
  };
  apps: {
    customer: {
      android: {
        package_name: string;
        version: string;
        min_version: string;
        download_url: string;
        enabled: boolean;
      };
      ios: {
        bundle_id: string;
        version: string;
        min_version: string;
        app_store_url: string;
        enabled: boolean;
      };
      huawei: {
        package_name: string;
        version: string;
        min_version: string;
        app_gallery_url: string;
        enabled: boolean;
      };
    };
    provider: {
      android: {
        package_name: string;
        version: string;
        min_version: string;
        download_url: string;
        enabled: boolean;
      };
      ios: {
        bundle_id: string;
        version: string;
        min_version: string;
        app_store_url: string;
        enabled: boolean;
      };
      huawei: {
        package_name: string;
        version: string;
        min_version: string;
        app_gallery_url: string;
        enabled: boolean;
      };
    };
  };
  travel_fees: {
    default_rate_per_km: number;
    default_minimum_fee: number;
    default_maximum_fee: number | null;
    default_currency: string;
    allow_provider_customization: boolean;
    provider_min_rate_per_km: number;
    provider_max_rate_per_km: number;
    provider_min_minimum_fee: number;
    provider_max_minimum_fee: number;
  };
  seo: {
    site_url: string;
    default_meta_description: string;
    default_keywords: string[];
    og_image_url: string;
    twitter_image_url: string;
    google_verification_code: string;
    facebook_url: string;
    instagram_url: string;
    twitter_url: string;
    linkedin_url: string;
    youtube_url: string;
  };
  payment_types: {
    cash: boolean;
    card: boolean;
    mobile: boolean;
    gift_card: boolean;
  };
  features: {
    auto_approve_providers: boolean;
  };
  calendar_integrations: {
    google: {
      client_id: string;
      client_secret: string;
      enabled: boolean;
    };
    outlook: {
      client_id: string;
      client_secret: string;
      enabled: boolean;
    };
    apple: {
      enabled: boolean;
    };
  };
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("branding");
  const { user, role } = useAuth();

  useEffect(() => {
    if (user?.id && role === "superadmin") {
      loadSettings();
    } else if (role != null && role !== "superadmin") {
      setIsLoading(false);
    }
  }, [user?.id, role]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load main settings
      const response = await fetcher.get<{ data: PlatformSettings }>(
        "/api/admin/settings"
      );
      const loadedSettings = response.data;

      // Load travel fees separately
      try {
        const travelFeesResponse = await fetcher.get<{ data: PlatformSettings["travel_fees"] }>(
          "/api/admin/travel-fees"
        );
        loadedSettings.travel_fees = travelFeesResponse.data;
      } catch (err) {
        // If travel fees endpoint fails, use defaults
        console.warn("Failed to load travel fees, using defaults:", err);
        loadedSettings.travel_fees = {
          default_rate_per_km: 8.00,
          default_minimum_fee: 20.00,
          default_maximum_fee: null,
          default_currency: 'ZAR',
          allow_provider_customization: true,
          provider_min_rate_per_km: 0.00,
          provider_max_rate_per_km: 50.00,
          provider_min_minimum_fee: 0.00,
          provider_max_minimum_fee: 100.00,
        };
      }

      setSettings(loadedSettings);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load settings";
      setError(errorMessage);
      console.error("Error loading settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      
      // Save main settings (including seo; travel_fees has its own endpoint)
      const { travel_fees, ...mainSettings } = settings;
      await fetcher.patch("/api/admin/settings", mainSettings);
      
      // Save travel fees separately
      if (travel_fees) {
        await fetcher.patch("/api/admin/travel-fees", travel_fees);
      }
      
      toast.success("Settings saved successfully");
      
      // Clear locale cache on client side
      if (typeof window !== "undefined") {
        // Trigger a page reload or clear cache
        // The cache will be cleared on next fetch
        window.dispatchEvent(new Event("platform-settings-updated"));
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Failed to save settings";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (section: keyof PlatformSettings, updates: any) => {
    setSettings((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [section]: { ...prev[section], ...updates },
      };
    });
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading settings..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !settings) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load settings"
            description={error || "Unable to load platform settings"}
            action={{
              label: "Retry",
              onClick: loadSettings,
            }}
          />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="container mx-auto px-4 py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Platform Settings</h1>
          <p className="text-sm sm:text-base text-gray-600">Configure platform-wide settings</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 sm:mb-6 flex-wrap">
            <TabsTrigger value="branding" className="text-xs sm:text-sm">
              <Palette className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="localization" className="text-xs sm:text-sm">
              <Globe className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Localization</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="text-xs sm:text-sm">
              <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Payouts</span>
            </TabsTrigger>
            <TabsTrigger value="payment-types" className="text-xs sm:text-sm">
              <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Payment Types</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs sm:text-sm">
              <Bell className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs sm:text-sm">
              <Plug className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="apps" className="text-xs sm:text-sm">
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Apps</span>
            </TabsTrigger>
            <TabsTrigger value="travel-fees" className="text-xs sm:text-sm">
              <Car className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Travel Fees</span>
            </TabsTrigger>
            <TabsTrigger value="verification" className="text-xs sm:text-sm">
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Verification</span>
            </TabsTrigger>
            <TabsTrigger value="seo" className="text-xs sm:text-sm">
              <Search className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">SEO</span>
            </TabsTrigger>
            <TabsTrigger value="calendar-integrations" className="text-xs sm:text-sm">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="providers" className="text-xs sm:text-sm">
              <Building2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Providers</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branding">
            <BrandingSettings
              settings={settings?.branding}
              onChange={(updates) => updateSettings("branding", updates)}
            />
          </TabsContent>

          <TabsContent value="localization">
            <LocalizationSettings
              settings={settings?.localization}
              onChange={(updates) => updateSettings("localization", updates)}
            />
          </TabsContent>

          <TabsContent value="payouts">
            <PayoutSettings
              settings={settings?.payouts}
              onChange={(updates) => updateSettings("payouts", updates)}
            />
          </TabsContent>

          <TabsContent value="payment-types">
            <PaymentTypesSettings
              settings={settings?.payment_types}
              onChange={(updates) => updateSettings("payment_types", updates)}
            />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationSettings
              settings={settings?.notifications}
              onChange={(updates) => updateSettings("notifications", updates)}
            />
          </TabsContent>
          <TabsContent value="integrations" className="space-y-8">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Payment</h3>
              <PaystackSettings
                settings={settings?.paystack}
                onChange={(updates) => updateSettings("paystack", updates)}
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Push notifications</h3>
              <OneSignalSettings
                settings={settings?.onesignal}
                onChange={(updates) => updateSettings("onesignal", updates)}
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Maps &amp; analytics</h3>
              <p className="text-sm text-gray-600 mb-3">
                Enable/keys below feed client config. For service zones (Mapbox) and advanced options (Amplitude), use the menu under <strong>Integrations &amp; dev</strong>.
              </p>
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href="/admin/mapbox"
                  className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <MapPin className="w-4 h-4" />
                  Mapbox (zones)
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </Link>
                <Link
                  href="/admin/integrations/amplitude"
                  className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <BarChart3 className="w-4 h-4" />
                  Amplitude (full config)
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <MapboxSettings
                  settings={settings?.mapbox}
                  onChange={(updates) => updateSettings("mapbox", updates)}
                />
                <AmplitudeSettings
                  settings={settings?.amplitude}
                  onChange={(updates) => updateSettings("amplitude", updates)}
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Google (Maps, Places, Analytics)</h3>
              <GoogleSettings
                settings={settings?.google}
                onChange={(updates) => updateSettings("google", updates)}
              />
            </div>
          </TabsContent>
          <TabsContent value="apps">
            <AppsSettings
              settings={settings?.apps}
              onChange={(updates) => updateSettings("apps", updates)}
            />
          </TabsContent>
          <TabsContent value="travel-fees">
            <TravelFeesSettings
              settings={settings?.travel_fees}
              onChange={(updates) => updateSettings("travel_fees", updates)}
            />
          </TabsContent>
          <TabsContent value="seo">
            <SEOSettings
              settings={settings?.seo}
              onChange={(updates) => updateSettings("seo", updates)}
            />
          </TabsContent>
          <TabsContent value="calendar-integrations">
            <CalendarIntegrationsSettings
              settings={settings?.calendar_integrations}
              onChange={(updates) => updateSettings("calendar_integrations", updates)}
            />
          </TabsContent>
          <TabsContent value="providers">
            <ProviderSettings
              settings={settings?.features}
              onChange={(updates) => updateSettings("features", updates)}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-4 sm:mt-6 flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full sm:w-auto touch-target"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}

function BrandingSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["branding"] | undefined;
  onChange: (updates: Partial<PlatformSettings["branding"]>) => void;
}) {
  const safeSettings = {
    site_name: settings?.site_name ?? "",
    logo_url: settings?.logo_url ?? "",
    favicon_url: settings?.favicon_url ?? "",
    primary_color: settings?.primary_color ?? "#000000",
    secondary_color: settings?.secondary_color ?? "#FF0077",
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <Label htmlFor="site_name" className="text-sm sm:text-base">Site Name *</Label>
        <Input
          id="site_name"
          value={safeSettings.site_name}
          onChange={(e) => onChange({ site_name: e.target.value })}
          required
          className="mt-1 text-sm sm:text-base"
        />
      </div>
      <div>
        <Label htmlFor="logo_url" className="text-sm sm:text-base">Logo URL</Label>
        <Input
          id="logo_url"
          type="url"
          value={safeSettings.logo_url}
          onChange={(e) => onChange({ logo_url: e.target.value })}
          placeholder="https://example.com/logo.png"
          className="mt-1"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          URL to your platform logo (used in navbar, footer, etc.)
        </p>
      </div>
      <div>
        <Label htmlFor="favicon_url" className="text-sm sm:text-base">Favicon URL</Label>
        <Input
          id="favicon_url"
          type="url"
          value={safeSettings.favicon_url}
          onChange={(e) => onChange({ favicon_url: e.target.value })}
          placeholder="https://example.com/favicon.ico"
          className="mt-1"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          URL to your platform favicon (displayed in browser tabs)
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="primary_color">Primary Color</Label>
          <div className="flex gap-2">
            <Input
              id="primary_color"
              type="color"
              value={safeSettings.primary_color}
              onChange={(e) => onChange({ primary_color: e.target.value })}
              className="w-20 h-10"
            />
            <Input
              value={safeSettings.primary_color}
              onChange={(e) => onChange({ primary_color: e.target.value })}
              placeholder="#000000"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="secondary_color">Secondary Color</Label>
          <div className="flex gap-2">
            <Input
              id="secondary_color"
              type="color"
              value={safeSettings.secondary_color}
              onChange={(e) => onChange({ secondary_color: e.target.value })}
              className="w-20 h-10"
            />
            <Input
              value={safeSettings.secondary_color}
              onChange={(e) => onChange({ secondary_color: e.target.value })}
              placeholder="#FF0077"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalizationSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["localization"] | undefined;
  onChange: (updates: Partial<PlatformSettings["localization"]>) => void;
}) {
  const { user, role } = useAuth();
  const safeSettings = {
    default_language: settings?.default_language ?? "en",
    supported_languages: settings?.supported_languages ?? [],
    default_currency: settings?.default_currency ?? "ZAR",
    supported_currencies: settings?.supported_currencies ?? [],
    timezone: settings?.timezone ?? "Africa/Johannesburg",
  };

  const [currencies, setCurrencies] = useState<Array<{ code: string; name: string }>>([]);
  const [languages, setLanguages] = useState<Array<{ code: string; name: string }>>([]);
  const [timezones, setTimezones] = useState<Array<{ code: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id && role === "superadmin") loadIsoCodes();
  }, [user?.id, role]);

  const loadIsoCodes = async () => {
    try {
      const [currenciesRes, languagesRes, timezonesRes] = await Promise.all([
        fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/admin/iso-codes/currencies"),
        fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/admin/iso-codes/languages"),
        fetcher.get<{ data: Array<{ code: string; name: string }> }>("/api/admin/iso-codes/timezones"),
      ]);
      setCurrencies(currenciesRes.data?.filter((c: any) => c.is_active) || []);
      setLanguages(languagesRes.data?.filter((l: any) => l.is_active) || []);
      setTimezones(timezonesRes.data?.filter((t: any) => t.is_active) || []);
    } catch (error) {
      console.error("Error loading ISO codes:", error);
      // Fallback to defaults
      setCurrencies([{ code: "ZAR", name: "South African Rand" }, { code: "USD", name: "US Dollar" }, { code: "EUR", name: "Euro" }]);
      setLanguages([{ code: "en", name: "English" }, { code: "af", name: "Afrikaans" }, { code: "zu", name: "Zulu" }]);
      setTimezones([{ code: "Africa/Johannesburg", name: "Africa/Johannesburg (SAST)" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2 sm:gap-0">
        <p className="text-xs sm:text-sm text-gray-600">Manage ISO codes in the ISO Codes section</p>
        <Link href="/admin/iso-codes">
          <Button variant="outline" size="sm" className="w-full sm:w-auto touch-target text-xs sm:text-sm">
            <Globe className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Manage ISO Codes</span>
            <span className="sm:hidden">ISO Codes</span>
          </Button>
        </Link>
      </div>
      <div>
        <Label htmlFor="default_language" className="text-sm sm:text-base">Default Language *</Label>
        {isLoading ? (
          <div className="w-full p-2 border rounded-md bg-gray-100 animate-pulse text-sm">Loading...</div>
        ) : (
          <select
            id="default_language"
            value={safeSettings.default_language || ""}
            onChange={(e) => onChange({ default_language: e.target.value })}
            className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.code})
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <Label htmlFor="default_currency" className="text-sm sm:text-base">Default Currency *</Label>
        {isLoading ? (
          <div className="w-full p-2 border rounded-md bg-gray-100 animate-pulse text-sm">Loading...</div>
        ) : (
          <select
            id="default_currency"
            value={safeSettings.default_currency || ""}
            onChange={(e) => onChange({ default_currency: e.target.value })}
            className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
          >
            {currencies.map((curr) => (
              <option key={curr.code} value={curr.code}>
                {curr.code} - {curr.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <Label htmlFor="timezone" className="text-sm sm:text-base">Timezone *</Label>
        {isLoading ? (
          <div className="w-full p-2 border rounded-md bg-gray-100 animate-pulse text-sm">Loading...</div>
        ) : (
          <select
            id="timezone"
            value={safeSettings.timezone || ""}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
          >
            {timezones.map((tz) => (
              <option key={tz.code} value={tz.code}>
                {tz.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function PayoutSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["payouts"] | undefined;
  onChange: (updates: Partial<PlatformSettings["payouts"]>) => void;
}) {
  const safeSettings = {
    provider_payout_percentage: settings?.provider_payout_percentage ?? 80,
    payout_schedule: (settings?.payout_schedule ?? "weekly") as "daily" | "weekly" | "monthly",
    minimum_payout_amount: settings?.minimum_payout_amount ?? 100,
    platform_service_fee_type: (settings?.platform_service_fee_type ?? "percentage") as "percentage" | "fixed",
    platform_service_fee_percentage: settings?.platform_service_fee_percentage ?? 5,
    platform_service_fee_fixed: settings?.platform_service_fee_fixed ?? 0,
    commission_enabled: settings?.commission_enabled ?? true,
    platform_commission_percentage: settings?.platform_commission_percentage ?? 20,
    show_service_fee_to_customer: settings?.show_service_fee_to_customer ?? true,
  };
  
  const _platformCommission = 100 - safeSettings.provider_payout_percentage;
  void _platformCommission;
  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Platform Service Fee Section */}
      <div className="border-b pb-4 sm:pb-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Platform Service Fee (Customer-Facing)</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          This fee is shown to customers during checkout. It can be a percentage or fixed amount.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show_service_fee_to_customer" className="text-sm sm:text-base">
              Show Service Fee to Customers
            </Label>
            <input
              type="checkbox"
              id="show_service_fee_to_customer"
              checked={safeSettings.show_service_fee_to_customer}
              onChange={(e) =>
                onChange({ show_service_fee_to_customer: e.target.checked })
              }
              className="w-5 h-5"
            />
          </div>

          <div>
            <Label htmlFor="platform_service_fee_type" className="text-sm sm:text-base">
              Service Fee Type *
            </Label>
            <select
              id="platform_service_fee_type"
              value={safeSettings.platform_service_fee_type}
              onChange={(e) =>
                onChange({ platform_service_fee_type: e.target.value as "percentage" | "fixed" })
              }
              className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>

          {safeSettings.platform_service_fee_type === "percentage" ? (
            <div>
              <Label htmlFor="platform_service_fee_percentage" className="text-sm sm:text-base">
                Service Fee Percentage *
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="platform_service_fee_percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={safeSettings.platform_service_fee_percentage}
                  onChange={(e) =>
                    onChange({ platform_service_fee_percentage: parseFloat(e.target.value) || 0 })
                  }
                  className="flex-1"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Percentage of booking total charged to customers
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="platform_service_fee_fixed" className="text-sm sm:text-base">
                Service Fee Fixed Amount *
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="platform_service_fee_fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={safeSettings.platform_service_fee_fixed}
                  onChange={(e) =>
                    onChange({ platform_service_fee_fixed: parseFloat(e.target.value) || 0 })
                  }
                  className="flex-1"
                />
                <span className="text-xs sm:text-sm text-gray-600">ZAR</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Fixed amount charged to customers per booking
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Platform Commission Section */}
      <div className="border-b pb-4 sm:pb-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Platform Commission (Provider Revenue Split)</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Optional: Charge commission on provider revenue. When disabled, providers get 100% of services, addons, travel fees, and tips.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="commission_enabled" className="text-sm sm:text-base">
                Enable Commission on Providers
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                When disabled, providers receive 100% of all revenue (services, addons, travel fees, tips)
              </p>
            </div>
            <input
              type="checkbox"
              id="commission_enabled"
              checked={safeSettings.commission_enabled !== false}
              onChange={(e) =>
                onChange({ commission_enabled: e.target.checked })
              }
              className="w-5 h-5"
            />
          </div>

          {safeSettings.commission_enabled !== false && (
            <>
              <div>
                <Label htmlFor="platform_commission_percentage" className="text-sm sm:text-base">
                  Platform Commission Percentage *
                </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="platform_commission_percentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={safeSettings.platform_commission_percentage}
                onChange={(e) => {
                  const commission = parseFloat(e.target.value) || 0;
                  onChange({
                    platform_commission_percentage: commission,
                    provider_payout_percentage: 100 - commission,
                  });
                }}
                className="flex-1"
              />
              <span className="text-sm text-gray-600">%</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Platform takes {safeSettings.platform_commission_percentage}% of booking revenue
            </p>
          </div>

          <div>
            <Label htmlFor="provider_payout_percentage" className="text-sm sm:text-base">
              Provider Payout Percentage *
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="provider_payout_percentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={safeSettings.provider_payout_percentage}
                onChange={(e) => {
                  const payout = parseFloat(e.target.value) || 0;
                  onChange({
                    provider_payout_percentage: payout,
                    platform_commission_percentage: 100 - payout,
                  });
                }}
                className="flex-1"
              />
              <span className="text-sm text-gray-600">%</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Providers receive {safeSettings.provider_payout_percentage}% of booking revenue
            </p>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs sm:text-sm text-blue-800">
                <strong>Note:</strong> Platform Commission + Provider Payout = 100%
                <br />
                Current split: {safeSettings.platform_commission_percentage}% Platform / {safeSettings.provider_payout_percentage}% Provider
              </p>
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* Payout Schedule Section */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Payout Schedule</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="payout_schedule" className="text-sm sm:text-base">Payout Schedule *</Label>
            <select
              id="payout_schedule"
              value={safeSettings.payout_schedule}
              onChange={(e) =>
                onChange({ payout_schedule: e.target.value as any })
              }
              className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              How often providers receive their payouts
            </p>
          </div>

          <div>
            <Label htmlFor="minimum_payout_amount" className="text-sm sm:text-base">
              Minimum Payout Amount *
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="minimum_payout_amount"
                type="number"
                min="0"
                step="0.01"
                value={safeSettings.minimum_payout_amount}
                onChange={(e) =>
                  onChange({ minimum_payout_amount: parseFloat(e.target.value) || 0 })
                }
                className="flex-1"
              />
              <span className="text-xs sm:text-sm text-gray-600">ZAR</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Minimum amount required before payout is processed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaystackSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["paystack"] | undefined;
  onChange: (updates: Partial<PlatformSettings["paystack"]>) => void;
}) {
  const safeSettings = {
    secret_key: settings?.secret_key ?? "",
    public_key: settings?.public_key ?? "",
    use_transaction_splits: settings?.use_transaction_splits ?? false,
    transfer_otp_required: settings?.transfer_otp_required ?? false,
    skip_payout_account_verification: settings?.skip_payout_account_verification ?? false,
    webhook_secret: settings?.webhook_secret ?? "",
    default_split_code: settings?.default_split_code ?? "",
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Paystack API Configuration</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Configure Paystack payment gateway settings. Keep secret keys secure.
        </p>
      </div>

      <div>
        <Label htmlFor="paystack_secret_key" className="text-sm sm:text-base">
          Secret Key *
        </Label>
        <Input
          id="paystack_secret_key"
          type="password"
          value={safeSettings.secret_key}
          onChange={(e) => onChange({ secret_key: e.target.value })}
          placeholder="sk_test_... or sk_live_..."
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your Paystack secret key (never share this)
        </p>
      </div>

      <div>
        <Label htmlFor="paystack_public_key" className="text-sm sm:text-base">
          Public Key *
        </Label>
        <Input
          id="paystack_public_key"
          type="text"
          value={safeSettings.public_key}
          onChange={(e) => onChange({ public_key: e.target.value })}
          placeholder="pk_test_... or pk_live_..."
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your Paystack public key (safe to expose to client)
        </p>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Transaction Splits</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="use_transaction_splits" className="text-sm sm:text-base">
                Use Transaction Splits
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Automatically split revenue between platform and providers
              </p>
            </div>
            <input
              type="checkbox"
              id="use_transaction_splits"
              checked={safeSettings.use_transaction_splits}
              onChange={(e) => onChange({ use_transaction_splits: e.target.checked })}
              className="w-5 h-5"
            />
          </div>

          {safeSettings.use_transaction_splits && (
            <div>
              <Label htmlFor="default_split_code" className="text-sm sm:text-base">
                Default Split Code
              </Label>
              <Input
                id="default_split_code"
                type="text"
                value={safeSettings.default_split_code}
                onChange={(e) => onChange({ default_split_code: e.target.value })}
                placeholder="SPL_..."
                className="mt-1 font-mono text-xs sm:text-sm"
              />
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Default split code to use for transactions (leave empty to auto-select)
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Transfer Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="transfer_otp_required" className="text-sm sm:text-base">
                Require OTP for Transfers
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Require OTP verification before finalizing transfers
              </p>
            </div>
            <input
              type="checkbox"
              id="transfer_otp_required"
              checked={safeSettings.transfer_otp_required}
              onChange={(e) => onChange({ transfer_otp_required: e.target.checked })}
              className="w-5 h-5"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="skip_payout_account_verification" className="text-sm sm:text-base">
                Skip payout account verification (superadmin)
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                When on, new payout accounts are added without calling Paystack verify (saves ZAR 3/call in SA). If a transfer fails, provider must upload a bank confirmation letter to confirm account details.
              </p>
            </div>
            <input
              type="checkbox"
              id="skip_payout_account_verification"
              checked={safeSettings.skip_payout_account_verification}
              onChange={(e) => onChange({ skip_payout_account_verification: e.target.checked })}
              className="w-5 h-5"
            />
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-base sm:text-lg font-semibold mb-4">Webhook Configuration</h3>
        <div>
          <Label htmlFor="webhook_secret" className="text-sm sm:text-base">
            Webhook Secret
          </Label>
          <Input
            id="webhook_secret"
            type="password"
            value={safeSettings.webhook_secret}
            onChange={(e) => onChange({ webhook_secret: e.target.value })}
            placeholder="Webhook signature secret"
            className="mt-1 font-mono text-xs sm:text-sm"
          />
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Secret for verifying webhook signatures (optional, recommended)
          </p>
        </div>
      </div>
    </div>
  );
}

function OneSignalSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["onesignal"] | undefined;
  onChange: (updates: Partial<PlatformSettings["onesignal"]>) => void;
}) {
  const safeSettings = {
    app_id: settings?.app_id ?? "",
    rest_api_key: settings?.rest_api_key ?? "",
    safari_web_id: settings?.safari_web_id ?? "",
    enabled: settings?.enabled ?? false,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">OneSignal Push Notifications</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Configure OneSignal for push notifications to mobile apps and web.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="onesignal_enabled" className="text-sm sm:text-base">
            Enable OneSignal
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Enable push notifications via OneSignal
          </p>
        </div>
        <input
          type="checkbox"
          id="onesignal_enabled"
          checked={safeSettings.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>

      <div>
        <Label htmlFor="onesignal_app_id" className="text-sm sm:text-base">
          App ID *
        </Label>
        <Input
          id="onesignal_app_id"
          type="text"
          value={safeSettings.app_id}
          onChange={(e) => onChange({ app_id: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Your OneSignal App ID
        </p>
      </div>

      <div>
        <Label htmlFor="onesignal_rest_api_key" className="text-sm sm:text-base">
          REST API Key *
        </Label>
        <Input
          id="onesignal_rest_api_key"
          type="password"
          value={safeSettings.rest_api_key}
          onChange={(e) => onChange({ rest_api_key: e.target.value })}
          placeholder="Your REST API Key"
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          OneSignal REST API Key (keep secure)
        </p>
      </div>

      <div>
        <Label htmlFor="onesignal_safari_web_id" className="text-sm sm:text-base">
          Safari Web ID (Optional)
        </Label>
        <Input
          id="onesignal_safari_web_id"
          type="text"
          value={safeSettings.safari_web_id}
          onChange={(e) => onChange({ safari_web_id: e.target.value })}
          placeholder="web.onesignal.auto.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="mt-1 font-mono text-xs sm:text-sm"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Safari Web Push ID (for web push notifications)
        </p>
      </div>
    </div>
  );
}

function MapboxSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["mapbox"] | undefined;
  onChange: (updates: Partial<PlatformSettings["mapbox"]>) => void;
}) {
  const safeSettings = {
    access_token: settings?.access_token ?? "",
    public_token: settings?.public_token ?? "",
    enabled: settings?.enabled ?? false,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Mapbox Configuration</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Configure Mapbox for maps, geocoding, and location services.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="mapbox_enabled" className="text-sm sm:text-base">
            Enable Mapbox
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Enable Mapbox services
          </p>
        </div>
        <input
          type="checkbox"
          id="mapbox_enabled"
          checked={safeSettings.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>

      <div>
        <Label htmlFor="mapbox_access_token" className="text-sm sm:text-base">
          Access Token (Secret) *
        </Label>
        <Input
          id="mapbox_access_token"
          type="password"
          value={safeSettings.access_token}
          onChange={(e) => onChange({ access_token: e.target.value })}
          placeholder="pk.eyJ1Ijoi..."
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Mapbox secret access token (server-side)
        </p>
      </div>

      <div>
        <Label htmlFor="mapbox_public_token" className="text-sm sm:text-base">
          Public Token *
        </Label>
        <Input
          id="mapbox_public_token"
          type="text"
          value={safeSettings.public_token}
          onChange={(e) => onChange({ public_token: e.target.value })}
          placeholder="pk.eyJ1Ijoi..."
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Mapbox public token (client-side, safe to expose)
        </p>
      </div>
    </div>
  );
}

function AmplitudeSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["amplitude"] | undefined;
  onChange: (updates: Partial<PlatformSettings["amplitude"]>) => void;
}) {
  const safeSettings = {
    api_key: settings?.api_key ?? "",
    secret_key: settings?.secret_key ?? "",
    enabled: settings?.enabled ?? false,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Amplitude Analytics</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Configure Amplitude for user analytics and event tracking.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="amplitude_enabled" className="text-sm sm:text-base">
            Enable Amplitude
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Enable Amplitude analytics tracking
          </p>
        </div>
        <input
          type="checkbox"
          id="amplitude_enabled"
          checked={safeSettings.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>

      <div>
        <Label htmlFor="amplitude_api_key" className="text-sm sm:text-base">
          API Key *
        </Label>
        <Input
          id="amplitude_api_key"
          type="text"
          value={safeSettings.api_key}
          onChange={(e) => onChange({ api_key: e.target.value })}
          placeholder="Your Amplitude API Key"
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Amplitude API Key (can be exposed to client)
        </p>
      </div>

      <div>
        <Label htmlFor="amplitude_secret_key" className="text-sm sm:text-base">
          Secret Key (Optional)
        </Label>
        <Input
          id="amplitude_secret_key"
          type="password"
          value={safeSettings.secret_key || ""}
          onChange={(e) => onChange({ secret_key: e.target.value })}
          placeholder="Your Amplitude Secret Key"
          className="mt-1 font-mono text-xs sm:text-sm"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Amplitude Secret Key (for server-side operations, keep secure)
        </p>
      </div>
    </div>
  );
}

function GoogleSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["google"] | undefined;
  onChange: (updates: Partial<PlatformSettings["google"]>) => void;
}) {
  const safeSettings = {
    maps_api_key: settings?.maps_api_key ?? "",
    places_api_key: settings?.places_api_key ?? "",
    analytics_id: settings?.analytics_id ?? "",
    enabled: settings?.enabled ?? false,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Google Services</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Configure Google Maps, Places, and Analytics services.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="google_enabled" className="text-sm sm:text-base">
            Enable Google Services
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Enable Google Maps and related services
          </p>
        </div>
        <input
          type="checkbox"
          id="google_enabled"
          checked={safeSettings.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>

      <div>
        <Label htmlFor="google_maps_api_key" className="text-sm sm:text-base">
          Maps API Key *
        </Label>
        <Input
          id="google_maps_api_key"
          type="text"
          value={safeSettings.maps_api_key}
          onChange={(e) => onChange({ maps_api_key: e.target.value })}
          placeholder="AIzaSy..."
          className="mt-1 font-mono text-xs sm:text-sm"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Google Maps API Key (can be exposed to client with restrictions)
        </p>
      </div>

      <div>
        <Label htmlFor="google_places_api_key" className="text-sm sm:text-base">
          Places API Key (Optional)
        </Label>
        <Input
          id="google_places_api_key"
          type="text"
          value={safeSettings.places_api_key || ""}
          onChange={(e) => onChange({ places_api_key: e.target.value })}
          placeholder="AIzaSy..."
          className="mt-1 font-mono text-xs sm:text-sm"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Google Places API Key (for place search and autocomplete)
        </p>
      </div>

      <div>
        <Label htmlFor="google_analytics_id" className="text-sm sm:text-base">
          Analytics ID (Optional)
        </Label>
        <Input
          id="google_analytics_id"
          type="text"
          value={safeSettings.analytics_id || ""}
          onChange={(e) => onChange({ analytics_id: e.target.value })}
          placeholder="G-XXXXXXXXXX"
          className="mt-1 font-mono text-xs sm:text-sm"
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Google Analytics 4 Measurement ID
        </p>
      </div>
    </div>
  );
}

function AppsSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["apps"] | undefined;
  onChange: (updates: Partial<PlatformSettings["apps"]>) => void;
}) {
  const ca = settings?.customer?.android;
  const ci = settings?.customer?.ios;
  const ch = settings?.customer?.huawei;
  const pa = settings?.provider?.android;
  const pi = settings?.provider?.ios;
  const ph = settings?.provider?.huawei;
  const safeSettings = {
    customer: {
      android: {
        package_name: ca?.package_name ?? "",
        version: ca?.version ?? "",
        min_version: ca?.min_version ?? "",
        download_url: ca?.download_url ?? "",
        enabled: ca?.enabled ?? false,
      },
      ios: {
        bundle_id: ci?.bundle_id ?? "",
        version: ci?.version ?? "",
        min_version: ci?.min_version ?? "",
        app_store_url: ci?.app_store_url ?? "",
        enabled: ci?.enabled ?? false,
      },
      huawei: {
        package_name: ch?.package_name ?? "",
        version: ch?.version ?? "",
        min_version: ch?.min_version ?? "",
        app_gallery_url: ch?.app_gallery_url ?? "",
        enabled: ch?.enabled ?? false,
      },
    },
    provider: {
      android: {
        package_name: pa?.package_name ?? "",
        version: pa?.version ?? "",
        min_version: pa?.min_version ?? "",
        download_url: pa?.download_url ?? "",
        enabled: pa?.enabled ?? false,
      },
      ios: {
        bundle_id: pi?.bundle_id ?? "",
        version: pi?.version ?? "",
        min_version: pi?.min_version ?? "",
        app_store_url: pi?.app_store_url ?? "",
        enabled: pi?.enabled ?? false,
      },
      huawei: {
        package_name: ph?.package_name ?? "",
        version: ph?.version ?? "",
        min_version: ph?.min_version ?? "",
        app_gallery_url: ph?.app_gallery_url ?? "",
        enabled: ph?.enabled ?? false,
      },
    },
  };

  const updateCustomerApp = (platform: "android" | "ios" | "huawei", updates: any) => {
    onChange({
      customer: {
        ...safeSettings.customer,
        [platform]: {
          ...safeSettings.customer[platform],
          ...updates,
        },
      },
    });
  };

  const updateProviderApp = (platform: "android" | "ios" | "huawei", updates: any) => {
    onChange({
      provider: {
        ...safeSettings.provider,
        [platform]: {
          ...safeSettings.provider[platform],
          ...updates,
        },
      },
    });
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-semibold mb-4">Mobile App Management</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Manage customer and provider mobile apps for Android, iOS, and Huawei platforms.
        </p>
      </div>

      <Tabs defaultValue="customer" className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="customer" className="text-xs sm:text-sm">Customer App</TabsTrigger>
          <TabsTrigger value="provider" className="text-xs sm:text-sm">Provider App</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <h4 className="text-base font-semibold">Customer App</h4>
          
          {/* Android */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">Android</h5>
              <input
                type="checkbox"
                checked={safeSettings.customer.android.enabled}
                onChange={(e) => updateCustomerApp("android", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Package Name</Label>
                <Input
                  value={safeSettings.customer.android.package_name}
                  onChange={(e) => updateCustomerApp("android", { package_name: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.customer.android.version}
                  onChange={(e) => updateCustomerApp("android", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.customer.android.min_version}
                  onChange={(e) => updateCustomerApp("android", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Download URL</Label>
                <Input
                  value={safeSettings.customer.android.download_url}
                  onChange={(e) => updateCustomerApp("android", { download_url: e.target.value })}
                  placeholder="https://..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {/* iOS */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">iOS</h5>
              <input
                type="checkbox"
                checked={safeSettings.customer.ios.enabled}
                onChange={(e) => updateCustomerApp("ios", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Bundle ID</Label>
                <Input
                  value={safeSettings.customer.ios.bundle_id}
                  onChange={(e) => updateCustomerApp("ios", { bundle_id: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.customer.ios.version}
                  onChange={(e) => updateCustomerApp("ios", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.customer.ios.min_version}
                  onChange={(e) => updateCustomerApp("ios", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">App Store URL</Label>
                <Input
                  value={safeSettings.customer.ios.app_store_url}
                  onChange={(e) => updateCustomerApp("ios", { app_store_url: e.target.value })}
                  placeholder="https://apps.apple.com/..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {/* Huawei */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">Huawei</h5>
              <input
                type="checkbox"
                checked={safeSettings.customer.huawei.enabled}
                onChange={(e) => updateCustomerApp("huawei", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Package Name</Label>
                <Input
                  value={safeSettings.customer.huawei.package_name}
                  onChange={(e) => updateCustomerApp("huawei", { package_name: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.customer.huawei.version}
                  onChange={(e) => updateCustomerApp("huawei", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.customer.huawei.min_version}
                  onChange={(e) => updateCustomerApp("huawei", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">App Gallery URL</Label>
                <Input
                  value={safeSettings.customer.huawei.app_gallery_url}
                  onChange={(e) => updateCustomerApp("huawei", { app_gallery_url: e.target.value })}
                  placeholder="https://appgallery.huawei.com/..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="provider" className="space-y-6">
          <h4 className="text-base font-semibold">Provider App</h4>
          
          {/* Android */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">Android</h5>
              <input
                type="checkbox"
                checked={safeSettings.provider.android.enabled}
                onChange={(e) => updateProviderApp("android", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Package Name</Label>
                <Input
                  value={safeSettings.provider.android.package_name}
                  onChange={(e) => updateProviderApp("android", { package_name: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.provider.android.version}
                  onChange={(e) => updateProviderApp("android", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.provider.android.min_version}
                  onChange={(e) => updateProviderApp("android", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Download URL</Label>
                <Input
                  value={safeSettings.provider.android.download_url}
                  onChange={(e) => updateProviderApp("android", { download_url: e.target.value })}
                  placeholder="https://..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {/* iOS */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">iOS</h5>
              <input
                type="checkbox"
                checked={safeSettings.provider.ios.enabled}
                onChange={(e) => updateProviderApp("ios", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Bundle ID</Label>
                <Input
                  value={safeSettings.provider.ios.bundle_id}
                  onChange={(e) => updateProviderApp("ios", { bundle_id: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.provider.ios.version}
                  onChange={(e) => updateProviderApp("ios", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.provider.ios.min_version}
                  onChange={(e) => updateProviderApp("ios", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">App Store URL</Label>
                <Input
                  value={safeSettings.provider.ios.app_store_url}
                  onChange={(e) => updateProviderApp("ios", { app_store_url: e.target.value })}
                  placeholder="https://apps.apple.com/..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>

          {/* Huawei */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-medium text-sm sm:text-base">Huawei</h5>
              <input
                type="checkbox"
                checked={safeSettings.provider.huawei.enabled}
                onChange={(e) => updateProviderApp("huawei", { enabled: e.target.checked })}
                className="w-5 h-5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs sm:text-sm">Package Name</Label>
                <Input
                  value={safeSettings.provider.huawei.package_name}
                  onChange={(e) => updateProviderApp("huawei", { package_name: e.target.value })}
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Version</Label>
                <Input
                  value={safeSettings.provider.huawei.version}
                  onChange={(e) => updateProviderApp("huawei", { version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">Min Version</Label>
                <Input
                  value={safeSettings.provider.huawei.min_version}
                  onChange={(e) => updateProviderApp("huawei", { min_version: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs sm:text-sm">App Gallery URL</Label>
                <Input
                  value={safeSettings.provider.huawei.app_gallery_url}
                  onChange={(e) => updateProviderApp("huawei", { app_gallery_url: e.target.value })}
                  placeholder="https://appgallery.huawei.com/..."
                  className="text-xs sm:text-sm mt-1"
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["notifications"] | undefined;
  onChange: (updates: Partial<PlatformSettings["notifications"]>) => void;
}) {
  const safeSettings = {
    email_enabled: settings?.email_enabled ?? true,
    sms_enabled: settings?.sms_enabled ?? false,
    push_enabled: settings?.push_enabled ?? true,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="email_enabled">Email Notifications</Label>
          <p className="text-sm text-gray-600">
            Enable email notifications for users
          </p>
        </div>
        <input
          type="checkbox"
          id="email_enabled"
          checked={safeSettings.email_enabled}
          onChange={(e) => onChange({ email_enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="sms_enabled">SMS Notifications</Label>
          <p className="text-sm text-gray-600">
            Enable SMS notifications for users
          </p>
        </div>
        <input
          type="checkbox"
          id="sms_enabled"
          checked={safeSettings.sms_enabled}
          onChange={(e) => onChange({ sms_enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="push_enabled">Push Notifications</Label>
          <p className="text-sm text-gray-600">
            Enable push notifications for mobile apps
          </p>
        </div>
        <input
          type="checkbox"
          id="push_enabled"
          checked={safeSettings.push_enabled}
          onChange={(e) => onChange({ push_enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>
    </div>
  );
}

function PaymentTypesSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["payment_types"] | undefined;
  onChange: (updates: Partial<PlatformSettings["payment_types"]>) => void;
}) {
  const paymentTypeLabels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    mobile: "Mobile Payment",
    gift_card: "Gift Card",
  };

  const safeSettings = {
    cash: settings?.cash ?? true,
    card: settings?.card ?? true,
    mobile: settings?.mobile ?? true,
    gift_card: settings?.gift_card ?? false,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold mb-2">Accepted Payment Methods</h3>
        <p className="text-sm text-gray-600">
          Configure which payment methods are accepted across the platform
        </p>
      </div>
      {Object.entries(safeSettings).map(([typeId, enabled]) => (
        <div key={typeId} className="flex items-center justify-between">
          <div>
            <Label htmlFor={`payment_type_${typeId}`}>
              {paymentTypeLabels[typeId] || typeId.replace("_", " ")}
            </Label>
          </div>
          <input
            type="checkbox"
            id={`payment_type_${typeId}`}
            checked={enabled}
            onChange={(e) => onChange({ [typeId]: e.target.checked } as any)}
            className="w-5 h-5"
          />
        </div>
      ))}
    </div>
  );
}

 
function _VerificationSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["verification"] | undefined;
  onChange: (updates: Partial<PlatformSettings["verification"]>) => void;
}) {
  const safeSettings = {
    otp_enabled: settings?.otp_enabled !== false, // Default to true
    qr_code_enabled: settings?.qr_code_enabled !== false, // Default to true
    require_verification: settings?.require_verification !== false, // Default to true
  };

  return (
    <div className="bg-white border rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-sm">
      <div className="mb-4 sm:mb-5">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">At-Home Booking Verification</h3>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          Configure verification methods for at-home/housecall bookings. If both OTP and QR code are disabled, providers can use simple confirmation.
        </p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl border-2 border-gray-200 active:scale-[0.99] transition-transform touch-manipulation">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Label htmlFor="require_verification" className="text-base sm:text-lg font-semibold text-gray-900 cursor-pointer">
                Require Verification
              </Label>
            </div>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              If disabled, providers can simply confirm arrival without OTP or QR code verification. If enabled, at least one verification method (OTP or QR code) must be enabled.
            </p>
          </div>
          <div className="flex-shrink-0 pt-1">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="require_verification"
                checked={safeSettings.require_verification}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  onChange({ require_verification: newValue });
                  // If disabling verification, also disable OTP and QR code
                  if (!newValue) {
                    onChange({ otp_enabled: false, qr_code_enabled: false });
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 sm:w-14 sm:h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FF0077]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] sm:after:top-[3px] sm:after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 sm:after:h-6 sm:after:w-6 after:transition-all peer-checked:bg-[#FF0077]"></div>
            </label>
          </div>
        </div>

        {safeSettings.require_verification && (
          <>
            <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-blue-100/30 rounded-xl border-2 border-blue-200 active:scale-[0.99] transition-transform touch-manipulation">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <Label htmlFor="otp_enabled" className="text-base sm:text-lg font-semibold text-gray-900 cursor-pointer">
                    Enable OTP Verification
                  </Label>
                </div>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Send 6-digit OTP codes via SMS/Email for customer verification when provider arrives.
                </p>
              </div>
              <div className="flex-shrink-0 pt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="otp_enabled"
                    checked={safeSettings.otp_enabled}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      onChange({ otp_enabled: newValue });
                      // If disabling both OTP and QR code, disable require_verification
                      if (!newValue && !safeSettings.qr_code_enabled) {
                        onChange({ require_verification: false });
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 sm:w-14 sm:h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] sm:after:top-[3px] sm:after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 sm:after:h-6 sm:after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-gradient-to-br from-green-50 to-green-100/30 rounded-xl border-2 border-green-200 active:scale-[0.99] transition-transform touch-manipulation">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-green-500/10 rounded-lg">
                    <QrCode className="w-4 h-4 text-green-600" />
                  </div>
                  <Label htmlFor="qr_code_enabled" className="text-base sm:text-lg font-semibold text-gray-900 cursor-pointer">
                    Enable QR Code Verification
                  </Label>
                </div>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  Generate QR codes for customer scanning to verify provider arrival. Works as fallback when OTP is disabled.
                </p>
              </div>
              <div className="flex-shrink-0 pt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="qr_code_enabled"
                    checked={safeSettings.qr_code_enabled}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      onChange({ qr_code_enabled: newValue });
                      // If disabling both OTP and QR code, disable require_verification
                      if (!newValue && !safeSettings.otp_enabled) {
                        onChange({ require_verification: false });
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 sm:w-14 sm:h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] sm:after:top-[3px] sm:after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 sm:after:h-6 sm:after:w-6 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
            </div>

            {!safeSettings.otp_enabled && !safeSettings.qr_code_enabled && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs sm:text-sm text-yellow-800">
                  <strong>Warning:</strong> Both OTP and QR code are disabled. Verification requirement will be automatically disabled, and providers will use simple confirmation.
                </p>
              </div>
            )}
          </>
        )}

        {!safeSettings.require_verification && (
          <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
            <p className="text-xs sm:text-sm text-gray-700">
              <strong>Simple Confirmation Mode:</strong> Providers can mark arrival without customer verification. This is useful for trusted providers or when verification is not needed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TravelFeesSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["travel_fees"] | undefined;
  onChange: (updates: Partial<PlatformSettings["travel_fees"]>) => void;
}) {
  const safeSettings = {
    default_rate_per_km: settings?.default_rate_per_km ?? 8.00,
    default_minimum_fee: settings?.default_minimum_fee ?? 20.00,
    default_maximum_fee: settings?.default_maximum_fee ?? null,
    default_currency: settings?.default_currency ?? "ZAR",
    allow_provider_customization: settings?.allow_provider_customization ?? true,
    provider_min_rate_per_km: settings?.provider_min_rate_per_km ?? 0.00,
    provider_max_rate_per_km: settings?.provider_max_rate_per_km ?? 50.00,
    provider_min_minimum_fee: settings?.provider_min_minimum_fee ?? 0.00,
    provider_max_minimum_fee: settings?.provider_max_minimum_fee ?? 100.00,
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Default Travel Fee Settings</h3>
        <p className="text-sm text-gray-600 mb-4">
          These are the default travel fees used when providers don't set custom rates.
        </p>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="default_rate_per_km">Default Rate per Kilometer</Label>
            <Input
              id="default_rate_per_km"
              type="number"
              min="0"
              step="0.01"
              value={safeSettings.default_rate_per_km}
              onChange={(e) => onChange({ default_rate_per_km: parseFloat(e.target.value) || 0 })}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Amount charged per kilometer traveled</p>
          </div>

          <div>
            <Label htmlFor="default_minimum_fee">Default Minimum Fee</Label>
            <Input
              id="default_minimum_fee"
              type="number"
              min="0"
              step="0.01"
              value={safeSettings.default_minimum_fee}
              onChange={(e) => onChange({ default_minimum_fee: parseFloat(e.target.value) || 0 })}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum travel fee regardless of distance</p>
          </div>

          <div>
            <Label htmlFor="default_maximum_fee">Default Maximum Fee (Optional)</Label>
            <Input
              id="default_maximum_fee"
              type="number"
              min="0"
              step="0.01"
              value={safeSettings.default_maximum_fee || ""}
              onChange={(e) => onChange({ default_maximum_fee: e.target.value ? parseFloat(e.target.value) : null })}
              className="mt-1"
              placeholder="No maximum"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum travel fee cap (leave empty for no limit)</p>
          </div>

          <div>
            <Label htmlFor="default_currency">Default Currency</Label>
            <Input
              id="default_currency"
              type="text"
              value={safeSettings.default_currency}
              onChange={(e) => onChange({ default_currency: e.target.value })}
              className="mt-1"
              maxLength={3}
            />
            <p className="text-xs text-gray-500 mt-1">Currency code (e.g., ZAR, USD)</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold mb-4">Provider Customization Limits</h3>
        <p className="text-sm text-gray-600 mb-4">
          Set the minimum and maximum values providers can set for their custom travel fees.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="allow_provider_customization">Allow Provider Customization</Label>
              <p className="text-sm text-gray-600">
                Let providers set their own travel fee rates
              </p>
            </div>
            <input
              type="checkbox"
              id="allow_provider_customization"
              checked={safeSettings.allow_provider_customization}
              onChange={(e) => onChange({ allow_provider_customization: e.target.checked })}
              className="w-5 h-5"
            />
          </div>

          {safeSettings.allow_provider_customization && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="provider_min_rate_per_km">Min Rate per km</Label>
                  <Input
                    id="provider_min_rate_per_km"
                    type="number"
                    min="0"
                    step="0.01"
                    value={safeSettings.provider_min_rate_per_km}
                    onChange={(e) => onChange({ provider_min_rate_per_km: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="provider_max_rate_per_km">Max Rate per km</Label>
                  <Input
                    id="provider_max_rate_per_km"
                    type="number"
                    min="0"
                    step="0.01"
                    value={safeSettings.provider_max_rate_per_km}
                    onChange={(e) => onChange({ provider_max_rate_per_km: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="provider_min_minimum_fee">Min Minimum Fee</Label>
                  <Input
                    id="provider_min_minimum_fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={safeSettings.provider_min_minimum_fee}
                    onChange={(e) => onChange({ provider_min_minimum_fee: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="provider_max_minimum_fee">Max Minimum Fee</Label>
                  <Input
                    id="provider_max_minimum_fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={safeSettings.provider_max_minimum_fee}
                    onChange={(e) => onChange({ provider_max_minimum_fee: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SEOSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["seo"] | undefined;
  onChange: (updates: Partial<PlatformSettings["seo"]>) => void;
}) {
  const safeSettings = {
    site_url: settings?.site_url ?? "",
    default_meta_description: settings?.default_meta_description ?? "",
    default_keywords: settings?.default_keywords ?? [],
    og_image_url: settings?.og_image_url ?? "",
    twitter_image_url: settings?.twitter_image_url ?? "",
    google_verification_code: settings?.google_verification_code ?? "",
    facebook_url: settings?.facebook_url ?? "",
    instagram_url: settings?.instagram_url ?? "",
    twitter_url: settings?.twitter_url ?? "",
    linkedin_url: settings?.linkedin_url ?? "",
    youtube_url: settings?.youtube_url ?? "",
  };

  const keywordsString = Array.isArray(safeSettings.default_keywords)
    ? safeSettings.default_keywords.join(", ")
    : "";

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Basic SEO Settings</h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure your site's SEO metadata and social media presence.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="site_url">Site URL *</Label>
            <Input
              id="site_url"
              type="url"
              value={safeSettings.site_url}
              onChange={(e) => onChange({ site_url: e.target.value })}
              placeholder="https://beautonomi.com"
              className="mt-1"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Your website's base URL (used for canonical URLs, sitemap, etc.)
            </p>
          </div>

          <div>
            <Label htmlFor="default_meta_description">Default Meta Description</Label>
            <textarea
              id="default_meta_description"
              value={safeSettings.default_meta_description}
              onChange={(e) => onChange({ default_meta_description: e.target.value })}
              placeholder="Discover and book beauty services from verified providers..."
              className="mt-1 w-full min-h-[100px] p-2 border rounded-md"
              maxLength={160}
            />
            <p className="text-xs text-gray-500 mt-1">
              Default description for pages without specific metadata (max 160 characters)
            </p>
          </div>

          <div>
            <Label htmlFor="default_keywords">Default Keywords</Label>
            <Input
              id="default_keywords"
              type="text"
              value={keywordsString}
              onChange={(e) => {
                const keywords = e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                onChange({ default_keywords: keywords });
              }}
              placeholder="beauty services, salon booking, spa booking"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated list of default keywords for SEO
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold mb-4">Social Media Images</h3>
        <p className="text-sm text-gray-600 mb-4">
          URLs to images used when sharing your site on social media.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="og_image_url">Open Graph Image URL</Label>
            <Input
              id="og_image_url"
              type="url"
              value={safeSettings.og_image_url}
              onChange={(e) => onChange({ og_image_url: e.target.value })}
              placeholder="https://beautonomi.com/og-image.jpg"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Recommended size: 1200x630px. Used for Facebook, LinkedIn, etc.
            </p>
          </div>

          <div>
            <Label htmlFor="twitter_image_url">Twitter Card Image URL</Label>
            <Input
              id="twitter_image_url"
              type="url"
              value={safeSettings.twitter_image_url}
              onChange={(e) => onChange({ twitter_image_url: e.target.value })}
              placeholder="https://beautonomi.com/twitter-image.jpg"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Recommended size: 1200x630px. Used for Twitter/X sharing.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold mb-4">Search Engine Verification</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="google_verification_code">Google Verification Code</Label>
            <Input
              id="google_verification_code"
              type="text"
              value={safeSettings.google_verification_code}
              onChange={(e) => onChange({ google_verification_code: e.target.value })}
              placeholder="abc123def456"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your Google Search Console verification code
            </p>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold mb-4">Social Media Links</h3>
        <p className="text-sm text-gray-600 mb-4">
          Add your social media profiles. These will appear in structured data and can be linked from your footer.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="facebook_url">Facebook URL</Label>
            <Input
              id="facebook_url"
              type="url"
              value={safeSettings.facebook_url}
              onChange={(e) => onChange({ facebook_url: e.target.value })}
              placeholder="https://www.facebook.com/beautonomi"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="instagram_url">Instagram URL</Label>
            <Input
              id="instagram_url"
              type="url"
              value={safeSettings.instagram_url}
              onChange={(e) => onChange({ instagram_url: e.target.value })}
              placeholder="https://www.instagram.com/beautonomi"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="twitter_url">Twitter/X URL</Label>
            <Input
              id="twitter_url"
              type="url"
              value={safeSettings.twitter_url}
              onChange={(e) => onChange({ twitter_url: e.target.value })}
              placeholder="https://twitter.com/beautonomi"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="linkedin_url">LinkedIn URL</Label>
            <Input
              id="linkedin_url"
              type="url"
              value={safeSettings.linkedin_url}
              onChange={(e) => onChange({ linkedin_url: e.target.value })}
              placeholder="https://www.linkedin.com/company/beautonomi"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="youtube_url">YouTube URL</Label>
            <Input
              id="youtube_url"
              type="url"
              value={safeSettings.youtube_url}
              onChange={(e) => onChange({ youtube_url: e.target.value })}
              placeholder="https://www.youtube.com/@beautonomi"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-sm text-blue-800">
          <strong>Note:</strong> After updating these settings, you may need to:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Upload OG and Twitter images to your public folder</li>
            <li>Test your sitemap at <code className="bg-blue-100 px-1 rounded">/sitemap.xml</code></li>
            <li>Verify robots.txt at <code className="bg-blue-100 px-1 rounded">/robots.txt</code></li>
            <li>Submit your sitemap to Google Search Console</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CalendarIntegrationsSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["calendar_integrations"] | undefined;
  onChange: (updates: Partial<PlatformSettings["calendar_integrations"]>) => void;
}) {
  const safeSettings = {
    google: {
      client_id: settings?.google?.client_id ?? "",
      client_secret: settings?.google?.client_secret ?? "",
      enabled: settings?.google?.enabled ?? false,
    },
    outlook: {
      client_id: settings?.outlook?.client_id ?? "",
      client_secret: settings?.outlook?.client_secret ?? "",
      enabled: settings?.outlook?.enabled ?? false,
    },
    apple: {
      enabled: settings?.apple?.enabled ?? true,
    },
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6">
        <div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">Google Calendar Integration</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure OAuth credentials for Google Calendar. Once configured, providers can connect their own Google accounts.
          </p>

          <div className="flex items-center justify-between mb-4">
            <div>
              <Label htmlFor="google_calendar_enabled" className="text-sm sm:text-base">
                Enable Google Calendar Integration
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Allow providers to sync appointments with Google Calendar
              </p>
            </div>
            <input
              type="checkbox"
              id="google_calendar_enabled"
              checked={safeSettings.google.enabled}
              onChange={(e) =>
                onChange({
                  google: { ...safeSettings.google, enabled: e.target.checked },
                })
              }
              className="w-5 h-5"
            />
          </div>

          {safeSettings.google.enabled && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <Label htmlFor="google_calendar_client_id" className="text-sm sm:text-base">
                  Google Calendar Client ID *
                </Label>
                <Input
                  id="google_calendar_client_id"
                  type="text"
                  value={safeSettings.google.client_id}
                  onChange={(e) =>
                    onChange({
                      google: { ...safeSettings.google, client_id: e.target.value },
                    })
                  }
                  placeholder="xxxxx.apps.googleusercontent.com"
                  className="mt-1 font-mono text-xs sm:text-sm"
                  required
                />
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  OAuth 2.0 Client ID from Google Cloud Console
                </p>
              </div>

              <div>
                <Label htmlFor="google_calendar_client_secret" className="text-sm sm:text-base">
                  Google Calendar Client Secret *
                </Label>
                <Input
                  id="google_calendar_client_secret"
                  type="password"
                  value={safeSettings.google.client_secret}
                  onChange={(e) =>
                    onChange({
                      google: { ...safeSettings.google, client_secret: e.target.value },
                    })
                  }
                  placeholder="GOCSPX-..."
                  className="mt-1 font-mono text-xs sm:text-sm"
                  required
                />
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  OAuth 2.0 Client Secret from Google Cloud Console (keep secure)
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs sm:text-sm text-blue-800">
                  <strong>Redirect URI:</strong> <code className="bg-blue-100 px-1 rounded">
                    {process.env.NEXT_PUBLIC_APP_URL || "https://yourdomain.com"}/api/provider/calendar/callback/google
                  </code>
                </p>
                <p className="text-xs sm:text-sm text-blue-800 mt-2">
                  Make sure to add this exact redirect URI in your Google Cloud Console OAuth client configuration.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6">
        <div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">Microsoft Outlook Integration</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure OAuth credentials for Microsoft Outlook. Once configured, providers can connect their own Outlook accounts.
          </p>

          <div className="flex items-center justify-between mb-4">
            <div>
              <Label htmlFor="outlook_enabled" className="text-sm sm:text-base">
                Enable Outlook Integration
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Allow providers to sync appointments with Microsoft Outlook
              </p>
            </div>
            <input
              type="checkbox"
              id="outlook_enabled"
              checked={safeSettings.outlook.enabled}
              onChange={(e) =>
                onChange({
                  outlook: { ...safeSettings.outlook, enabled: e.target.checked },
                })
              }
              className="w-5 h-5"
            />
          </div>

          {safeSettings.outlook.enabled && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <Label htmlFor="outlook_client_id" className="text-sm sm:text-base">
                  Outlook Client ID (Application ID) *
                </Label>
                <Input
                  id="outlook_client_id"
                  type="text"
                  value={safeSettings.outlook.client_id}
                  onChange={(e) =>
                    onChange({
                      outlook: { ...safeSettings.outlook, client_id: e.target.value },
                    })
                  }
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mt-1 font-mono text-xs sm:text-sm"
                  required
                />
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Application (client) ID from Azure Portal
                </p>
              </div>

              <div>
                <Label htmlFor="outlook_client_secret" className="text-sm sm:text-base">
                  Outlook Client Secret *
                </Label>
                <Input
                  id="outlook_client_secret"
                  type="password"
                  value={safeSettings.outlook.client_secret}
                  onChange={(e) =>
                    onChange({
                      outlook: { ...safeSettings.outlook, client_secret: e.target.value },
                    })
                  }
                  placeholder="Client secret value"
                  className="mt-1 font-mono text-xs sm:text-sm"
                  required
                />
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Client Secret Value from Azure Portal (keep secure)
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs sm:text-sm text-blue-800">
                  <strong>Redirect URI:</strong> <code className="bg-blue-100 px-1 rounded">
                    {process.env.NEXT_PUBLIC_APP_URL || "https://yourdomain.com"}/api/provider/calendar/callback/outlook
                  </code>
                </p>
                <p className="text-xs sm:text-sm text-blue-800 mt-2">
                  Make sure to add this exact redirect URI in your Azure App Registration.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6">
        <div>
          <h3 className="text-base sm:text-lg font-semibold mb-2">Apple Calendar (iCal) Integration</h3>
          <p className="text-sm text-gray-600 mb-4">
            Apple Calendar uses iCal subscription URLs. No OAuth credentials are required. Providers can subscribe to their calendar feed.
          </p>

          <div className="flex items-center justify-between mb-4">
            <div>
              <Label htmlFor="apple_calendar_enabled" className="text-sm sm:text-base">
                Enable Apple Calendar (iCal) Integration
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Allow providers to share iCal subscription URLs for Apple Calendar
              </p>
            </div>
            <input
              type="checkbox"
              id="apple_calendar_enabled"
              checked={safeSettings.apple.enabled}
              onChange={(e) =>
                onChange({
                  apple: { enabled: e.target.checked },
                })
              }
              className="w-5 h-5"
            />
          </div>

          {safeSettings.apple.enabled && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs sm:text-sm text-blue-800">
                <strong>Note:</strong> Apple Calendar uses iCal subscription URLs. Providers can generate and share their calendar feed URL, which customers can subscribe to in Apple Calendar. No OAuth setup is required.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>How it works:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-xs sm:text-sm">
            <li>Superadmin configures OAuth credentials here (one-time setup for Google/Outlook)</li>
            <li>Each provider connects their own Google/Outlook account through the provider portal</li>
            <li>Each provider's access tokens are stored separately in the database</li>
            <li>Apple Calendar uses iCal subscription URLs (no OAuth required)</li>
            <li>This centralized approach is more secure and easier to manage than per-provider OAuth apps</li>
          </ul>
        </p>
      </div>
    </div>
  );
}

function ProviderSettings({
  settings,
  onChange,
}: {
  settings: PlatformSettings["features"] | undefined;
  onChange: (updates: Partial<PlatformSettings["features"]>) => void;
}) {
  const safeSettings = {
    auto_approve_providers: settings?.auto_approve_providers ?? false,
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Provider Management</h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure how provider applications are processed and approved.
        </p>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Label htmlFor="auto_approve_providers" className="text-base font-medium">
                Auto-Approve Providers
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                When enabled, new provider applications will be automatically approved and set to active status.
                When disabled, providers will require manual approval by a superadmin.
              </p>
            </div>
            <div className="ml-4">
              <Switch
                id="auto_approve_providers"
                checked={safeSettings.auto_approve_providers}
                onCheckedChange={(checked) =>
                  onChange({ auto_approve_providers: checked })
                }
              />
            </div>
          </div>

          {safeSettings.auto_approve_providers && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> With auto-approval enabled, all new provider applications will be automatically
                activated. Make sure you have proper verification and onboarding processes in place.
              </p>
            </div>
          )}

          {!safeSettings.auto_approve_providers && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Manual Approval Mode:</strong> New provider applications will be set to "pending_approval" status
                and require manual review in the{" "}
                <Link href="/admin/providers" className="text-[#FF0077] hover:underline font-medium">
                  Providers
                </Link>{" "}
                section.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
