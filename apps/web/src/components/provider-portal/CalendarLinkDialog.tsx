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
        toast.success("Calendar link updated");
      } else {
        const newLink = await providerApi.createCalendarLink(linkData);
        toast.success("Calendar link created");
        // Copy link to clipboard
        navigator.clipboard.writeText(newLink.full_url);
        toast.info("Link copied to clipboard");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save calendar link:", error);
      toast.error("Failed to save calendar link");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-base sm:text-lg">
            {link ? "Edit Calendar Link" : "New Calendar Link"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-0 sm:px-0">
          <div>
            <Label htmlFor="name">Link Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Public Calendar, Client Subscription"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="calendar_type">Calendar Type *</Label>
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
                  <SelectItem value="public">Public Link</SelectItem>
                  <SelectItem value="subscription">Subscription (iCal/Google)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="provider">Provider</Label>
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
                  <SelectItem value="google">Google Calendar</SelectItem>
                  <SelectItem value="apple">Apple Calendar (iCal)</SelectItem>
                  <SelectItem value="outlook">Microsoft Outlook</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="expires_at">Expiration Date (Optional)</Label>
            <Input
              id="expires_at"
              type="date"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty for no expiration
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Display Settings</h4>
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
                  Show client names
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
                  Show service details
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
                  Show team member names
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
                  Include cancelled appointments
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
              Active
            </Label>
          </div>

          {link && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-1">Calendar Link URL:</p>
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : link ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}