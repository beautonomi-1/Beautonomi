"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, Link2, Copy, Check, QrCode } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildBookingButtonScriptSnippet,
  buildBookingIframeSnippet,
} from "@beautonomi/utils";
interface MangomintSettings {
  staff_selection_mode: "client_chooses" | "anyone_default" | "hidden_auto_assign";
  require_auth_step: "checkout" | "before_time_selection";
  min_notice_minutes: number;
  max_advance_days: number;
  allow_pay_in_person: boolean;
  deposit_required: boolean;
  deposit_amount: number | null;
  deposit_percent: number | null;
  on_demand_accept_enabled: boolean;
}

interface OnlineBookingSettings {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
}

interface BookingLinkData {
  url: string;
  embed_url: string;
  script_url?: string;
  slug: string;
  business_name: string;
  online_booking_enabled: boolean;
}

function publicOriginFromBookingLink(link: BookingLinkData): string {
  try {
    return new URL(link.embed_url || link.url).origin;
  } catch {
    return "";
  }
}

function bookingEmbedSnippets(link: BookingLinkData) {
  const origin = publicOriginFromBookingLink(link);
  return {
    iframe: buildBookingIframeSnippet({ origin, slug: link.slug, height: 800 }),
    scriptIframe: buildBookingButtonScriptSnippet({
      origin,
      slug: link.slug,
      mode: "iframe",
      height: 800,
    }),
    scriptButton: buildBookingButtonScriptSnippet({
      origin,
      slug: link.slug,
      mode: "button",
    }),
  };
}

export default function OnlineBookingSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<OnlineBookingSettings>({
    enabled: true,
    advanceNoticeHours: 24,
    cancellationHours: 24,
  });
  const [originalSettings, setOriginalSettings] = useState<OnlineBookingSettings | null>(null);
  const [mangomint, setMangomint] = useState<MangomintSettings | null>(null);
  const [originalMangomint, setOriginalMangomint] = useState<MangomintSettings | null>(null);
  const [bookingLink, setBookingLink] = useState<BookingLinkData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingMangomint, setIsSavingMangomint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings.enabled) {
      fetcher
        .get<{ data: BookingLinkData }>("/api/provider/booking-link")
        .then((res) => setBookingLink((res as any)?.data ?? res))
        .catch(() => setBookingLink(null));
    } else {
      setBookingLink(null);
    }
  }, [settings.enabled]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [bookingRes, mangomintRes] = await Promise.all([
        fetcher.get<{ data: OnlineBookingSettings }>(
          "/api/provider/settings/online-booking"
        ),
        fetcher
          .get<{ data: MangomintSettings }>(
            "/api/provider/settings/online-booking-mangomint"
          )
          .catch(() => null),
      ]);
      setSettings(bookingRes.data);
      setOriginalSettings(bookingRes.data);
      const m = mangomintRes && (mangomintRes as { data?: MangomintSettings }).data;
      const mangomintDefaults: MangomintSettings = {
        staff_selection_mode: "client_chooses",
        require_auth_step: "checkout",
        min_notice_minutes: 0,
        max_advance_days: 90,
        allow_pay_in_person: false,
        deposit_required: false,
        deposit_amount: null,
        deposit_percent: null,
        on_demand_accept_enabled: false,
      };
      const merged = m ? { ...mangomintDefaults, ...m } : mangomintDefaults;
      setMangomint(merged);
      setOriginalMangomint(merged);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.appointment-activity/online-booking.failedToLoadOnlineBooking");
      setError(errorMessage);
      console.error("Error loading online booking settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMangomint = async () => {
    if (!mangomint) return;
    try {
      setIsSavingMangomint(true);
      const response = await fetcher.patch<{ data: MangomintSettings }>(
        "/api/provider/settings/online-booking-mangomint",
        mangomint
      );
      setMangomint(response.data);
      setOriginalMangomint(response.data);
      toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.bookingFlowSettingsUpdated"));
    } catch (err) {
      toast.error(
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.appointment-activity/online-booking.failedToUpdateBookingFlow")
      );
    } finally {
      setIsSavingMangomint(false);
    }
  };

  const generateQr = async (url: string) => {
    try {
      const qrcode = await import("qrcode");
      const dataUrl = await qrcode.toDataURL(url, {
        width: 256,
        margin: 2,
      });
      setQrDataUrl(dataUrl);
      setShowQr(true);
    } catch {
      toast.error(t("web.provider.settings.pages.appointment-activity/online-booking.failedToGenerateQrCode"));
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Validate settings before saving
      if (settings.advanceNoticeHours < 0 || settings.advanceNoticeHours > 168) {
        toast.error(t("web.provider.settings.pages.appointment-activity/online-booking.advanceNoticeMustBeBetween0"));
        return;
      }
      
      if (settings.cancellationHours < 0 || settings.cancellationHours > 168) {
        toast.error(t("web.provider.settings.pages.appointment-activity/online-booking.cancellationNoticeMustBeBetween0"));
        return;
      }

      const response = await fetcher.patch<{ data: OnlineBookingSettings }>(
        "/api/provider/settings/online-booking",
        settings
      );
      
      // Update with response data to ensure consistency
      setSettings(response.data);
      setOriginalSettings(response.data);
      toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.onlineBookingSettingsUpdatedSuccessfully"));
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.appointment-activity/online-booking.failedToUpdateOnlineBooking");
      toast.error(errorMessage);
      console.error("Error saving online booking settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    originalSettings && JSON.stringify(settings) !== JSON.stringify(originalSettings);
  const hasMangomintChanges =
    mangomint &&
    originalMangomint &&
    JSON.stringify(mangomint) !== JSON.stringify(originalMangomint);

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.appointment-activity/online-booking.onlineBooking") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.onlineBooking.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.onlineBooking.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.appointment-activity/online-booking.loadingOnlineBookingSettings")} />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalSettings) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.onlineBooking.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.onlineBooking.description")}
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title={t("web.provider.settings.pages.appointment-activity/online-booking.failedToLoadSettings")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadSettings,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.appointment-activity/online-booking.onlineBooking")}
      subtitle={t("web.provider.settings.pages.appointment-activity/online-booking.configureOnlineBookingPreferences")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <Label className="text-base sm:text-lg font-medium block mb-2">
                {t("web.provider.settings.pages.appointment-activity/online-booking.enableOnlineBooking")}
              </Label>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.appointment-activity/online-booking.enableOnlineBookingHint")}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enabled: checked })
                }
              />
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="border-t pt-6 space-y-6">
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="w-4 h-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-800">
                    {t("web.provider.settings.pages.appointment-activity/online-booking.configureNoticeAlert")}
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="advanceNoticeHours" className="text-sm sm:text-base font-medium block mb-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.advanceNoticeHours")}
                    </Label>
                    <Input
                      id="advanceNoticeHours"
                      type="number"
                      min="0"
                      max="168"
                      value={settings.advanceNoticeHours}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 0;
                        const clampedValue = Math.max(0, Math.min(168, value));
                        setSettings({
                          ...settings,
                          advanceNoticeHours: clampedValue,
                        });
                      }}
                      className="w-full"
                    />
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.advanceNoticeHint")}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="cancellationHours" className="text-sm sm:text-base font-medium block mb-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.cancellationNoticeHours")}
                    </Label>
                    <Input
                      id="cancellationHours"
                      type="number"
                      min="0"
                      max="168"
                      value={settings.cancellationHours}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 0;
                        const clampedValue = Math.max(0, Math.min(168, value));
                        setSettings({
                          ...settings,
                          cancellationHours: clampedValue,
                        });
                      }}
                      className="w-full"
                    />
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.cancellationNoticeHint")}
                    </p>
                  </div>
                </div>
              </div>

              {bookingLink && (
                <div className="border-t pt-6 space-y-6">
                  <h3 className="font-medium flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    {t("web.provider.settings.pages.appointment-activity/online-booking.directBookingLink")}
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={bookingLink.url}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(bookingLink.url);
                        setCopiedField("url");
                        toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.linkCopiedToClipboard"));
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                    >
                      {copiedField === "url" ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => generateQr(bookingLink.url)}
                      title={t("web.provider.settings.pages.appointment-activity/online-booking.showQrCode")}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                  {showQr && qrDataUrl && (
                    <div className="flex flex-col items-center gap-2 p-4 bg-muted/30 rounded-lg">
                      <img
                        src={qrDataUrl}
                        alt={t("web.provider.settings.pages.appointment-activity/online-booking.bookingQrAlt")}
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.clientsCanScan")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowQr(false)}
                      >
                        {t("web.provider.common.close")}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {t("web.provider.settings.pages.appointment-activity/online-booking.shareLinkHint")}
                  </p>

                  {/* Embed URL */}
                  <div className="space-y-2">
                    <Label className="font-medium">{t("web.provider.settings.pages.appointment-activity/online-booking.embedUrl")}</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={bookingLink.embed_url}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(bookingLink.embed_url);
                          setCopiedField("embed_url");
                          toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.embedUrlCopied"));
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === "embed_url" ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Iframe snippet */}
                  <div className="space-y-2">
                    <Label className="font-medium">{t("web.provider.settings.pages.appointment-activity/online-booking.embedIframe")}</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.embedIframeHint")}
                    </p>
                    <div className="relative group">
                      <pre className="p-3 pe-10 bg-muted rounded-md text-xs overflow-x-auto">
                        <code>{bookingEmbedSnippets(bookingLink).iframe}</code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 end-2 h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(bookingEmbedSnippets(bookingLink).iframe);
                          setCopiedField("iframe");
                          toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.iframeCodeCopied"));
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === "iframe" ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Script embed: in-page widget */}
                  <div className="space-y-2">
                    <Label className="font-medium">{t("web.provider.settings.pages.appointment-activity/online-booking.embedScriptWidget")}</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.embedScriptWidgetHint")}
                    </p>
                    <div className="relative">
                      <pre className="p-3 pe-10 bg-muted rounded-md text-xs overflow-x-auto">
                        <code>{bookingEmbedSnippets(bookingLink).scriptIframe}</code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 end-2 h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(bookingEmbedSnippets(bookingLink).scriptIframe);
                          setCopiedField("script_iframe");
                          toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.widgetCodeCopied"));
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === "script_iframe" ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Script embed instructions */}
                  <div className="space-y-2">
                    <Label className="font-medium">{t("web.provider.settings.pages.appointment-activity/online-booking.embedScriptButton")}</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.embedScriptButtonHint", { slug: bookingLink.slug || "your-slug" })}
                    </p>
                    <div className="relative">
                      <pre className="p-3 pe-10 bg-muted rounded-md text-xs overflow-x-auto">
                        <code>{bookingEmbedSnippets(bookingLink).scriptButton}</code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 end-2 h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(bookingEmbedSnippets(bookingLink).scriptButton);
                          setCopiedField("script");
                          toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.scriptEmbedCodeCopied"));
                          setTimeout(() => setCopiedField(null), 2000);
                        }}
                      >
                        {copiedField === "script" ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {t("web.provider.settings.pages.appointment-activity/online-booking.orAddDataAttr", { attr: "data-beautonomi-book" })}
                    </p>
                  </div>
                </div>
              )}

              {mangomint && (
                <div className="border-t pt-6 space-y-6">
                  <h3 className="font-medium">{t("web.provider.settings.pages.appointment-activity/online-booking.bookingFlowSettings")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("web.provider.settings.pages.appointment-activity/online-booking.bookingFlowHint")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <Label className="block mb-2">{t("web.provider.settings.pages.appointment-activity/online-booking.staffSelection")}</Label>
                      <Select
                        value={mangomint.staff_selection_mode}
                        onValueChange={(v) =>
                          setMangomint({
                            ...mangomint,
                            staff_selection_mode: v as MangomintSettings["staff_selection_mode"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client_chooses">
                            {t("web.provider.settings.pages.appointment-activity/online-booking.clientChoosesStaff")}
                          </SelectItem>
                          <SelectItem value="anyone_default">
                            {t("web.provider.settings.pages.appointment-activity/online-booking.anyoneAvailable")}
                          </SelectItem>
                          <SelectItem value="hidden_auto_assign">
                            {t("web.provider.settings.pages.appointment-activity/online-booking.hiddenAutoAssign")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Switch
                        id="allow_pay_in_person"
                        checked={mangomint.allow_pay_in_person}
                        onCheckedChange={(v) =>
                          setMangomint({
                            ...mangomint,
                            allow_pay_in_person: v,
                          })
                        }
                      />
                      <Label htmlFor="allow_pay_in_person" className="cursor-pointer">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.allowPayAtVenue")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Switch
                        id="on_demand_accept_enabled"
                        checked={mangomint.on_demand_accept_enabled}
                        onCheckedChange={(v) =>
                          setMangomint({
                            ...mangomint,
                            on_demand_accept_enabled: v,
                          })
                        }
                      />
                      <div>
                        <Label htmlFor="on_demand_accept_enabled" className="cursor-pointer">
                          {t("web.provider.settings.pages.appointment-activity/online-booking.acceptOnDemand")}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("web.provider.settings.pages.appointment-activity/online-booking.acceptOnDemandHint")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <Label className="block mb-2">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.minNoticeMinutes")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={10080}
                        value={mangomint.min_notice_minutes}
                        onChange={(e) =>
                          setMangomint({
                            ...mangomint,
                            min_notice_minutes: Math.max(
                              0,
                              Math.min(10080, parseInt(e.target.value) || 0)
                            ),
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.minNoticeHint")}
                      </p>
                    </div>
                    <div>
                      <Label className="block mb-2">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.maxAdvanceDays")}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={mangomint.max_advance_days}
                        onChange={(e) =>
                          setMangomint({
                            ...mangomint,
                            max_advance_days: Math.max(
                              1,
                              Math.min(365, parseInt(e.target.value) || 1)
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="deposit_required"
                        checked={mangomint.deposit_required}
                        onCheckedChange={(v) =>
                          setMangomint({
                            ...mangomint,
                            deposit_required: v,
                          })
                        }
                      />
                      <Label htmlFor="deposit_required" className="cursor-pointer">
                        {t("web.provider.settings.pages.appointment-activity/online-booking.requireDeposit")}
                      </Label>
                    </div>
                    {mangomint.deposit_required && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ps-6">
                        <div>
                          <Label className="block mb-2">{t("web.provider.settings.pages.appointment-activity/online-booking.depositAmount")}</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder={t("web.provider.settings.pages.appointment-activity/online-booking.optional")}
                            value={mangomint.deposit_amount ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMangomint({
                                ...mangomint,
                                deposit_amount:
                                  v === "" ? null : parseFloat(v) || 0,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <Label className="block mb-2">{t("web.provider.settings.pages.appointment-activity/online-booking.depositPercent")}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder={t("web.provider.settings.pages.appointment-activity/online-booking.optional")}
                            value={mangomint.deposit_percent ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMangomint({
                                ...mangomint,
                                deposit_percent:
                                  v === "" ? null : parseFloat(v) || 0,
                              });
                            }}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("web.provider.settings.pages.appointment-activity/online-booking.useAmountOrPct")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {hasMangomintChanges && (
                    <Button
                      onClick={handleSaveMangomint}
                      disabled={isSavingMangomint}
                    >
                      {isSavingMangomint ? t("web.provider.common.saving") : t("web.provider.settings.pages.appointment-activity/online-booking.saveBookingFlow")}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {!settings.enabled && (
            <Alert className="border-amber-200 bg-amber-50">
              <Info className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-800">
                {t("web.provider.settings.pages.appointment-activity/online-booking.onlineBookingDisabled")}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
