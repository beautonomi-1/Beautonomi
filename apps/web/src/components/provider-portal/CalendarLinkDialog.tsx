"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarLink, CalendarProvider } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/browser/clipboard";
import { useTranslation } from "@beautonomi/i18n";

interface CalendarLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link?: CalendarLink | null;
  onSuccess?: () => void;
}

export function CalendarLinkDialog({
  open,
  onOpenChange,
  link,
  onSuccess,
}: CalendarLinkDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: link?.name || "",
    calendar_type: link?.calendar_type || "public",
    provider: link?.provider || "google",
    expires_at: link?.expires_at
      ? new Date(link.expires_at).toISOString().split("T")[0]
      : "",
    is_active: link?.is_active ?? true,
    show_client_names: link?.settings?.show_client_names ?? true,
    show_service_details: link?.settings?.show_service_details ?? true,
    show_team_member_names: link?.settings?.show_team_member_names ?? true,
    include_cancelled: link?.settings?.include_cancelled ?? false,
  });

  useEffect(() => {
    if (open && link) {
      setFormData({
        name: link.name,
        calendar_type: link.calendar_type,
        provider: link.provider,
        expires_at: link.expires_at
          ? new Date(link.expires_at).toISOString().split("T")[0]
          : "",
        is_active: link.is_active,
        show_client_names: link.settings.show_client_names,
        show_service_details: link.settings.show_service_details,
        show_team_member_names: link.settings.show_team_member_names,
        include_cancelled: link.settings.include_cancelled,
      });
    } else if (open) {
      setFormData({
        name: "",
        calendar_type: "public",
        provider: "google",
        expires_at: "",
        is_active: true,
        show_client_names: true,
        show_service_details: true,
        show_team_member_names: true,
        include_cancelled: false,
      });
    }
  }, [open, link]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const linkData: Partial<CalendarLink> = {
        name: formData.name,
        calendar_type: formData.calendar_type as any,
        provider: formData.provider as CalendarProvider,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : undefined,
        is_active: formData.is_active,
        settings: {
          show_client_names: formData.show_client_names,
          show_service_details: formData.show_service_details,
          show_team_member_names: formData.show_team_member_names,
          include_cancelled: formData.include_cancelled,
        },
      };

      if (link) {
        await providerApi.updateCalendarLink(link.id, linkData);
        toast.success(t("web.provider.portal.calendarLinkDialog.updated"));
      } else {
        const newLink = await providerApi.createCalendarLink(linkData);
        toast.success(t("web.provider.portal.calendarLinkDialog.created"));
        const copied = await copyTextToClipboard(newLink.full_url);
        if (copied) {
          toast.info(t("web.provider.portal.calendarLinkDialog.linkCopied"));
        }
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save calendar link:", error);
      toast.error(t("web.provider.portal.calendarLinkDialog.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-base sm:text-lg">
            {link ? t("web.provider.portal.calendarLinkDialog.titleEdit") : t("web.provider.portal.calendarLinkDialog.titleNew")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-0 sm:px-0">
          <div>
            <Label htmlFor="name">{t("web.provider.portal.calendarLinkDialog.linkNameRequired")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("web.provider.portal.calendarLinkDialog.linkNamePlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="calendar_type">{t("web.provider.portal.calendarLinkDialog.calendarTypeRequired")}</Label>
              <Select
                value={formData.calendar_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, calendar_type: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t("web.provider.portal.calendarLinkDialog.publicLink")}</SelectItem>
                  <SelectItem value="subscription">{t("web.provider.portal.calendarLinkDialog.subscriptionIcal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="provider">{t("web.provider.portal.calendarLinkDialog.provider")}</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData({ ...formData, provider: value as CalendarProvider })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">{t("web.provider.portal.calendarLinkDialog.googleCalendar")}</SelectItem>
                  <SelectItem value="apple">{t("web.provider.portal.calendarLinkDialog.appleCalendar")}</SelectItem>
                  <SelectItem value="outlook">{t("web.provider.portal.calendarLinkDialog.microsoftOutlook")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="expires_at">{t("web.provider.portal.calendarLinkDialog.expirationOptional")}</Label>
            <Input
              id="expires_at"
              type="date"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              {t("web.provider.portal.calendarLinkDialog.noExpiration")}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">{t("web.provider.portal.calendarLinkDialog.displaySettings")}</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show_client_names"
                  checked={formData.show_client_names}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, show_client_names: !!checked })
                  }
                />
                <Label htmlFor="show_client_names" className="cursor-pointer text-sm">
                  {t("web.provider.portal.calendarLinkDialog.showClientNames")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show_service_details"
                  checked={formData.show_service_details}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, show_service_details: !!checked })
                  }
                />
                <Label htmlFor="show_service_details" className="cursor-pointer text-sm">
                  {t("web.provider.portal.calendarLinkDialog.showServiceDetails")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show_team_member_names"
                  checked={formData.show_team_member_names}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, show_team_member_names: !!checked })
                  }
                />
                <Label htmlFor="show_team_member_names" className="cursor-pointer text-sm">
                  {t("web.provider.portal.calendarLinkDialog.showTeamMemberNames")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include_cancelled"
                  checked={formData.include_cancelled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, include_cancelled: !!checked })
                  }
                />
                <Label htmlFor="include_cancelled" className="cursor-pointer text-sm">
                  {t("web.provider.portal.calendarLinkDialog.includeCancelled")}
                </Label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: !!checked })
              }
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              {t("web.provider.portal.calendarLinkDialog.active")}
            </Label>
          </div>

          {link && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-1">{t("web.provider.portal.calendarLinkDialog.calendarLinkUrl")}</p>
              <code className="text-xs text-blue-600 break-all">{link.full_url}</code>
            </div>
          )}

          <DialogFooter className="px-0 sm:px-0 pt-4 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("web.provider.portal.calendarLinkDialog.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading
                ? t("web.provider.portal.calendarLinkDialog.saving")
                : link
                  ? t("web.provider.portal.calendarLinkDialog.update")
                  : t("web.provider.portal.calendarLinkDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}