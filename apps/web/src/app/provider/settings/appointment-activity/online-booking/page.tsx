"use client";

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
interface MangomintSettings {
  staff_selection_mode: "client_chooses" | "anyone_default" | "hidden_auto_assign";
  require_auth_step: "checkout" | "before_time_selection";
  min_notice_minutes: number;
  max_advance_days: number;
  allow_pay_in_person: boolean;
  deposit_required: boolean;
  deposit_amount: number | null;
  deposit_percent: number | null;
}

interface OnlineBookingSettings {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
}

interface BookingLinkData {
  url: string;
  embed_url: string;
  slug: string;
  business_name: string;
  online_booking_enabled: boolean;
}

export default function OnlineBookingSettings() {
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
        min_notice_minutes: 60,
        max_advance_days: 90,
        allow_pay_in_person: false,
        deposit_required: false,
        deposit_amount: null,
        deposit_percent: null,
      };
      setMangomint(m ?? mangomintDefaults);
      setOriginalMangomint(m ?? mangomintDefaults);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load online booking settings";
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
      toast.success("Booking flow settings updated");
    } catch (err) {
      toast.error(
        err instanceof FetchError
          ? err.message
          : "Failed to update booking flow settings"
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
      toast.error("Failed to generate QR code");
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Validate settings before saving
      if (settings.advanceNoticeHours < 0 || settings.advanceNoticeHours > 168) {
        toast.error("Advance notice must be between 0 and 168 hours");
        return;
      }
      
      if (settings.cancellationHours < 0 || settings.cancellationHours > 168) {
        toast.error("Cancellation notice must be between 0 and 168 hours");
        return;
      }

      const response = await fetcher.patch<{ data: OnlineBookingSettings }>(
        "/api/provider/settings/online-booking",
        settings
      );
      
      // Update with response data to ensure consistency
      setSettings(response.data);
      setOriginalSettings(response.data);
      toast.success("Online booking settings updated successfully");
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to update online booking settings";
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
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Online Booking" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Online Booking"
        subtitle="Configure online booking preferences"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading online booking settings..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalSettings) {
    return (
      <SettingsDetailLayout
        title="Online Booking"
        subtitle="Configure online booking preferences"
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title="Failed to load settings"
          description={error}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Online Booking"
      subtitle="Configure online booking preferences"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <Label className="text-base sm:text-lg font-medium block mb-2">
                Enable Online Booking
              </Label>
              <p className="text-sm text-gray-600">
                Allow clients to book appointments online through your booking page
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
                    Configure advance notice and cancellation requirements for online bookings.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="advanceNoticeHours" className="text-sm sm:text-base font-medium block mb-2">
                      Advance Notice (Hours)
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
                      Minimum hours in advance clients must book
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="cancellationHours" className="text-sm sm:text-base font-medium block mb-2">
                      Cancellation Notice (Hours)
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
                      Minimum hours before appointment for cancellation
                    </p>
                  </div>
                </div>
              </div>

              {bookingLink && (
                <div className="border-t pt-6 space-y-6">
                  <h3 className="font-medium flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Direct booking link
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
                        toast.success("Link copied to clipboard");
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
                      title="Show QR code"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                  {showQr && qrDataUrl && (
                    <div className="flex flex-col items-center gap-2 p-4 bg-muted/30 rounded-lg">
                      <img
                        src={qrDataUrl}
                        alt="Booking QR code"
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-muted-foreground">
                        Clients can scan to open your booking page
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowQr(false)}
                      >
                        Close
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Share this link so clients can book directly.
                  </p>

                  {/* Embed URL */}
                  <div className="space-y-2">
                    <Label className="font-medium">Embed URL (for iframes)</Label>
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
                          toast.success("Embed URL copied");
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
                    <Label className="font-medium">Embed with iframe</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      Paste this code into your website to show the full booking flow in an iframe.
                    </p>
                    <div className="relative group">
                      <pre className="p-3 pr-10 bg-muted rounded-md text-xs overflow-x-auto">
                        <code>{`<iframe src="${bookingLink.embed_url}" width="100%" height="800" frameborder="0" title="Book an appointment"></iframe>`}</code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => {
                          const snippet = `<iframe src="${bookingLink.embed_url}" width="100%" height="800" frameborder="0" title="Book an appointment"></iframe>`;
                          navigator.clipboard.writeText(snippet);
                          setCopiedField("iframe");
                          toast.success("Iframe code copied");
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

                  {/* Script embed instructions */}
                  <div className="space-y-2">
                    <Label className="font-medium">Embed with script (Book Now button)</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      Add a &quot;Book Now&quot; button that opens the booking page in a new tab. Replace{" "}
                      <code className="bg-muted px-1 rounded">{bookingLink.slug || "your-slug"}</code>{" "}
                      with your provider slug if using a different domain.
                    </p>
                    <div className="relative">
                      <pre className="p-3 pr-10 bg-muted rounded-md text-xs overflow-x-auto">
                        <code>{`<script src="${bookingLink.url.replace(/\/book\/.*$/, "")}/embed/booking-button.js"
  data-provider="${bookingLink.slug}"
  data-utm-source="website">
</script>
<button id="beautonomi-book-now">Book Now</button>`}</code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => {
                          const baseUrl = bookingLink.url.replace(/\/book\/.*$/, "");
                          const snippet = `<script src="${baseUrl}/embed/booking-button.js"\n  data-provider="${bookingLink.slug}"\n  data-utm-source="website">\n</script>\n<button id="beautonomi-book-now">Book Now</button>`;
                          navigator.clipboard.writeText(snippet);
                          setCopiedField("script");
                          toast.success("Script embed code copied");
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
                      Or add <code className="bg-muted px-1 rounded">data-beautonomi-book</code> to any element to make it open the booking page on click.
                    </p>
                  </div>
                </div>
              )}

              {mangomint && (
                <div className="border-t pt-6 space-y-6">
                  <h3 className="font-medium">Booking flow settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Control how clients book: staff selection, payment options,
                    and deposit requirements.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <Label className="block mb-2">Staff selection</Label>
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
                            Client chooses staff
                          </SelectItem>
                          <SelectItem value="anyone_default">
                            Anyone available (default)
                          </SelectItem>
                          <SelectItem value="hidden_auto_assign">
                            Hidden (auto-assign)
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
                        Allow pay at venue
                      </Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <Label className="block mb-2">
                        Min. notice (minutes)
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
                        How far in advance clients must book
                      </p>
                    </div>
                    <div>
                      <Label className="block mb-2">
                        Max. advance (days)
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
                        Require deposit for online bookings
                      </Label>
                    </div>
                    {mangomint.deposit_required && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                        <div>
                          <Label className="block mb-2">Deposit amount (fixed)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="Optional"
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
                          <Label className="block mb-2">Deposit % (alternate)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="Optional"
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
                            Use either amount or %
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
                      {isSavingMangomint ? "Saving..." : "Save booking flow settings"}
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
                Online booking is currently disabled. Clients will not be able to book appointments online.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
