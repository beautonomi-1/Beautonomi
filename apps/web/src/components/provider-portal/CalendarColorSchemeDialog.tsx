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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarColorScheme, ServiceItem, TeamMember } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";

interface CalendarColorSchemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme?: CalendarColorScheme | null;
  onSuccess?: () => void;
}

export function CalendarColorSchemeDialog({
  open,
  onOpenChange,
  scheme,
  onSuccess,
}: CalendarColorSchemeDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [formData, setFormData] = useState({
    name: scheme?.name || "",
    description: scheme?.description || "",
    color: scheme?.color || "#FF0077",
    icon: scheme?.icon || "",
    applies_to: scheme?.applies_to || "service",
    service_id: scheme?.service_id || "",
    status: scheme?.status || "",
    team_member_id: scheme?.team_member_id || "",
    is_default: scheme?.is_default || false,
  });

  useEffect(() => {
    if (open) {
      loadData();
      if (scheme) {
        setFormData({
          name: scheme.name,
          description: scheme.description || "",
          color: scheme.color,
          icon: scheme.icon || "",
          applies_to: scheme.applies_to,
          service_id: scheme.service_id || "",
          status: scheme.status || "",
          team_member_id: scheme.team_member_id || "",
          is_default: scheme.is_default,
        });
      } else {
        setFormData({
          name: "",
          description: "",
          color: "#FF0077",
          icon: "",
          applies_to: "service",
          service_id: "",
          status: "",
          team_member_id: "",
          is_default: false,
        });
      }
    }
  }, [open, scheme]);

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
    setIsLoading(true);

    try {
      const schemeData: Partial<CalendarColorScheme> = {
        name: formData.name,
        description: formData.description || undefined,
        color: formData.color,
        icon: formData.icon || undefined,
        applies_to: formData.applies_to as any,
        service_id: formData.applies_to === "service" ? formData.service_id || undefined : undefined,
        status: formData.applies_to === "status" ? (formData.status as any) : undefined,
        team_member_id: formData.applies_to === "team_member" ? formData.team_member_id || undefined : undefined,
        is_default: formData.is_default,
      };

      if (scheme) {
        await providerApi.updateCalendarColorScheme(scheme.id, schemeData);
        toast.success(t("web.provider.portal.calendarColorScheme.updated"));
      } else {
        await providerApi.createCalendarColorScheme(schemeData);
        toast.success(t("web.provider.portal.calendarColorScheme.created"));
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save color scheme:", error);
      toast.error(t("web.provider.portal.calendarColorScheme.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-base sm:text-lg">
            {scheme
              ? t("web.provider.portal.calendarColorScheme.titleEdit")
              : t("web.provider.portal.calendarColorScheme.titleNew")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-0 sm:px-0">
          <div>
            <Label htmlFor="name">{t("web.provider.portal.calendarColorScheme.nameRequired")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("web.provider.portal.calendarColorScheme.namePlaceholder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">{t("web.provider.portal.calendarColorScheme.description")}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="color">{t("web.provider.portal.calendarColorScheme.colorRequired")}</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 sm:w-20"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#FF0077"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="icon">{t("web.provider.portal.calendarColorScheme.iconOptional")}</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder={t("web.provider.portal.calendarColorScheme.iconPlaceholder")}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="applies_to">{t("web.provider.portal.calendarColorScheme.appliesToRequired")}</Label>
            <Select
              value={formData.applies_to}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  applies_to: value as any,
                  service_id: "",
                  status: "",
                  team_member_id: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service">{t("web.provider.portal.calendarColorScheme.appliesToService")}</SelectItem>
                <SelectItem value="status">{t("web.provider.portal.calendarColorScheme.appliesToStatus")}</SelectItem>
                <SelectItem value="team_member">{t("web.provider.portal.calendarColorScheme.appliesToTeamMember")}</SelectItem>
                <SelectItem value="custom">{t("web.provider.portal.calendarColorScheme.appliesToCustom")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.applies_to === "service" && (
            <div>
              <Label htmlFor="service_id">{t("web.provider.portal.calendarColorScheme.service")}</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.portal.calendarColorScheme.selectService")} />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.applies_to === "status" && (
            <div>
              <Label htmlFor="status">{t("web.provider.portal.calendarColorScheme.status")}</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.portal.calendarColorScheme.selectStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booked">{t("web.provider.portal.calendarColorScheme.booked")}</SelectItem>
                  <SelectItem value="started">{t("web.provider.portal.calendarColorScheme.started")}</SelectItem>
                  <SelectItem value="completed">{t("web.provider.portal.calendarColorScheme.completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("web.provider.portal.calendarColorScheme.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.applies_to === "team_member" && (
            <div>
              <Label htmlFor="team_member_id">{t("web.provider.portal.calendarColorScheme.teamMember")}</Label>
              <Select
                value={formData.team_member_id}
                onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("web.provider.portal.calendarColorScheme.selectTeamMember")} />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_default: !!checked })
              }
            />
            <Label htmlFor="is_default" className="cursor-pointer">
              {t("web.provider.portal.calendarColorScheme.setAsDefault")}
            </Label>
          </div>

          <DialogFooter className="px-0 sm:px-0 pt-4 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {t("web.provider.portal.calendarColorScheme.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
            >
              {isLoading
                ? t("web.provider.portal.calendarColorScheme.saving")
                : scheme
                  ? t("web.provider.portal.calendarColorScheme.update")
                  : t("web.provider.portal.calendarColorScheme.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}