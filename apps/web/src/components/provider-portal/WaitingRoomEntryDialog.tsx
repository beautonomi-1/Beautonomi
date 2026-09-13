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
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { WaitingRoomEntry, TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { RADIX_SELECT_ANY } from "@/lib/ui/select-radix-sentinels";

interface WaitingRoomEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: WaitingRoomEntry | null;
  onSuccess?: () => void;
}

export function WaitingRoomEntryDialog({
  open,
  onOpenChange,
  entry,
  onSuccess,
}: WaitingRoomEntryDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);

  const [formData, setFormData] = useState({
    client_name: entry?.client_name || "",
    client_email: entry?.client_email || "",
    client_phone: entry?.client_phone || "",
    service_id: entry?.service_id || "",
    service_name: entry?.service_name || "",
    team_member_id: entry?.team_member_id || "",
    estimated_wait_time: entry?.estimated_wait_time || undefined,
    notes: entry?.notes || "",
  });

  useEffect(() => {
    if (open) {
      loadData();
      if (entry) {
        setFormData({
          client_name: entry.client_name,
          client_email: entry.client_email || "",
          client_phone: entry.client_phone || "",
          service_id: entry.service_id || "",
          service_name: entry.service_name,
          team_member_id: entry.team_member_id || "",
          estimated_wait_time: entry.estimated_wait_time,
          notes: entry.notes || "",
        });
      } else {
        setFormData({
          client_name: "",
          client_email: "",
          client_phone: "",
          service_id: "",
          service_name: "",
          team_member_id: "",
          estimated_wait_time: undefined,
          notes: "",
        });
      }
    }
  }, [open, entry]);

  const loadData = async () => {
    try {
      const [categories, members] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
      ]);
      setServices(categories.flatMap((cat) => cat.services));
      setTeamMembers(members);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.client_phone?.trim() && !isCompleteE164(formData.client_phone)) {
      toast.error(t("web.provider.waitingRoomEntryDialog.invalidPhone"));
      return;
    }
    setIsLoading(true);

    try {
      const entryData: Partial<WaitingRoomEntry> = {
        client_name: formData.client_name,
        client_email: formData.client_email || undefined,
        client_phone: formData.client_phone?.trim() || undefined,
        service_id: formData.service_id || undefined,
        service_name: formData.service_name,
        team_member_id: formData.team_member_id || undefined,
        team_member_name: teamMembers.find((m) => m.id === formData.team_member_id)?.name,
        estimated_wait_time: formData.estimated_wait_time,
        notes: formData.notes || undefined,
      };

      if (entry) {
        await providerApi.updateWaitingRoomEntry(entry.id, entryData);
        toast.success(t("web.provider.waitingRoomEntryDialog.updated"));
      } else {
        await providerApi.addToWaitingRoom(entryData);
        toast.success(t("web.provider.waitingRoomEntryDialog.added"));
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save waiting room entry:", error);
      toast.error(t("web.provider.waitingRoomEntryDialog.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? t("web.provider.waitingRoomEntryDialog.editTitle") : t("web.provider.waitingRoomEntryDialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="client_name">{t("web.provider.waitingRoomEntryDialog.clientName")}</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waiting-room-client-phone">{t("web.provider.waitingRoomEntryDialog.phoneOptional")}</Label>
              <PhoneInput
                label=""
                inputId="waiting-room-client-phone"
                value={formData.client_phone}
                onChange={(e164) => setFormData({ ...formData, client_phone: e164 })}
                className="space-y-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="client_email">{t("web.provider.waitingRoomEntryDialog.email")}</Label>
            <Input
              id="client_email"
              type="email"
              value={formData.client_email}
              onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="service_id">{t("web.provider.waitingRoomEntryDialog.service")}</Label>
              <Select
                value={formData.service_id || RADIX_SELECT_ANY}
                onValueChange={(value) => {
                  if (value === RADIX_SELECT_ANY) {
                    setFormData({ ...formData, service_id: "", service_name: "" });
                    return;
                  }
                  const service = services.find((s) => s.id === value);
                  setFormData({
                    ...formData,
                    service_id: value,
                    service_name: service?.name || "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.waitingRoomEntryDialog.selectService")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_ANY}>{t("web.provider.waitingRoomEntryDialog.anyService")}</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="team_member_id">{t("web.provider.waitingRoomEntryDialog.preferredTeamMember")}</Label>
              <Select
                value={formData.team_member_id || RADIX_SELECT_ANY}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    team_member_id: value === RADIX_SELECT_ANY ? "" : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.waitingRoomEntryDialog.anyTeamMember")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_ANY}>{t("web.provider.waitingRoomEntryDialog.anyTeamMember")}</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="estimated_wait_time">{t("web.provider.waitingRoomEntryDialog.estimatedWait")}</Label>
            <Input
              id="estimated_wait_time"
              type="number"
              min={0}
              value={formData.estimated_wait_time || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  estimated_wait_time: parseInt(e.target.value) || undefined,
                })
              }
              placeholder={t("web.provider.waitingRoomEntryDialog.optional")}
            />
          </div>

          <div>
            <Label htmlFor="notes">{t("web.provider.waitingRoomEntryDialog.notes")}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("web.provider.waitingRoomEntryDialog.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? t("web.provider.waitingRoomEntryDialog.saving") : entry ? t("web.provider.waitingRoomEntryDialog.update") : t("web.provider.waitingRoomEntryDialog.addCta")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}