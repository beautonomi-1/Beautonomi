"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneInput } from "@/components/ui/phone-input";
import { Camera, Mail, Phone, Shield, Clock, DollarSign, Bell, Send, MapPin, Scissors } from "lucide-react";
import type { TeamMember } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { FetchError } from "@/lib/http/fetcher";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";

interface TeamMemberCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: TeamMember | null;
  onSave?: (wasUpdate?: boolean) => void;
}

export function TeamMemberCreateEditDialog({
  open,
  onOpenChange,
  member,
  onSave,
}: TeamMemberCreateEditDialogProps) {
  const { getOptions } = useReferenceData(["team_role", "commission_type", "working_day"]);
  const { t } = useTranslation();
  const { salons, selectedLocationId } = useProviderPortal();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [offerings, setOfferings] = useState<Array<{ id: string; title: string }>>([]);

  const [formData, setFormData] = useState({
    // Basic Information
    name: "",
    email: "",
    mobile: "",
    avatar_url: "",
    role: "employee" as "owner" | "manager" | "employee",
    
    // Service Provider Settings
    is_service_provider: true,
    enable_in_online_booking: true,
    can_be_assigned_to_product_sales: false,
    mobileReady: false,
    
    // Permissions
    is_admin: false,
    
    // Notifications
    email_notifications_enabled: true,
    sms_notifications_enabled: false,
    sms_plan_allowed: false,
    desktop_notifications_enabled: false,
    
    // Work Hours
    work_hours_enabled: true,
    
    // Compensation
    commission_enabled: false,
    commission_rate: 0,
    hourly_rate: 0,
    salary: 0,
    tips_enabled: true,
    
    // Time Clock
    time_clock_enabled: false,
    time_clock_pin: "",
    
    // Phone
    phone_call_availability_enabled: false,
    
    // Status
    is_active: true,
  });

  useEffect(() => {
    if (open) {
      if (member) {
        // Load settings from API
        const loadSettings = async () => {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            const settingsResponse = await fetcher.get<{ data: any }>(`/api/provider/staff/${member.id}/settings`);
            const settings = settingsResponse.data;
            
            setFormData({
              name: member.name || "",
              email: member.email || "",
              mobile: member.mobile || "",
              avatar_url: member.avatar_url || "",
              role: member.role || "employee",
              is_service_provider: settings?.is_service_provider ?? true,
              enable_in_online_booking: settings?.enable_in_online_booking ?? true,
              can_be_assigned_to_product_sales: settings?.can_be_assigned_to_product_sales ?? false,
              mobileReady: settings?.mobileReady ?? false,
              is_admin: settings?.is_admin ?? member.role === "owner",
              email_notifications_enabled: settings?.email_notifications_enabled ?? true,
              sms_notifications_enabled: settings?.sms_notifications_enabled ?? false,
              sms_plan_allowed: settings?.sms_plan_allowed === true,
              desktop_notifications_enabled: settings?.desktop_notifications_enabled ?? false,
              work_hours_enabled: settings?.work_hours_enabled ?? true,
              commission_enabled: settings?.commission_enabled ?? false,
              commission_rate: settings?.commission_rate ?? 0,
              hourly_rate: settings?.hourly_rate ?? 0,
              salary: settings?.salary ?? 0,
              tips_enabled: settings?.tips_enabled ?? true,
              time_clock_enabled: settings?.time_clock_enabled ?? false,
              time_clock_pin: settings?.time_clock_pin ?? "",
              phone_call_availability_enabled: settings?.phone_call_availability_enabled ?? false,
              is_active: member.is_active ?? true,
            });
          } catch (error) {
            // Fallback to defaults if API fails
            console.error("Failed to load settings:", error);
            setFormData({
              name: member.name || "",
              email: member.email || "",
              mobile: member.mobile || "",
              avatar_url: member.avatar_url || "",
              role: member.role || "employee",
              is_service_provider: true,
              enable_in_online_booking: true,
              can_be_assigned_to_product_sales: false,
              mobileReady: false,
              is_admin: member.role === "owner",
              email_notifications_enabled: true,
              sms_notifications_enabled: false,
              sms_plan_allowed: false,
              desktop_notifications_enabled: false,
              work_hours_enabled: true,
              commission_enabled: false,
              commission_rate: 0,
              hourly_rate: 0,
              salary: 0,
              tips_enabled: true,
              time_clock_enabled: false,
              time_clock_pin: "",
              phone_call_availability_enabled: false,
              is_active: member.is_active ?? true,
            });
          }
        };
        loadSettings();
        setAvatarPreview(member.avatar_url || null);
        void (async () => {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            const locRes = await fetcher.get<{
              data?: Array<{ location_id?: string; id?: string }> | { locations?: Array<{ location_id?: string; id?: string }> };
            }>(`/api/provider/staff/${member.id}/locations`);
            const payload = locRes.data;
            const rows = Array.isArray(payload) ? payload : payload?.locations ?? [];
            const ids = rows
              .map((r) => r.location_id ?? r.id)
              .filter((id): id is string => typeof id === "string");
            setLocationIds(
              ids.length > 0 ? ids : selectedLocationId ? [selectedLocationId] : salons.map((s) => s.id),
            );
          } catch {
            setLocationIds(selectedLocationId ? [selectedLocationId] : salons.map((s) => s.id));
          }
        })();
        void (async () => {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            const staffRes = await fetcher.get<{ data?: { service_ids?: string[] } }>(
              `/api/provider/staff/${member.id}`,
            );
            setServiceIds(Array.isArray(staffRes.data?.service_ids) ? staffRes.data.service_ids : []);
          } catch {
            setServiceIds([]);
          }
        })();
      } else {
        setFormData({
          name: "",
          email: "",
          mobile: "",
          avatar_url: "",
          role: "employee",
          is_service_provider: true,
          enable_in_online_booking: true,
          can_be_assigned_to_product_sales: false,
          mobileReady: false,
          is_admin: false,
          email_notifications_enabled: true,
          sms_notifications_enabled: false,
          sms_plan_allowed: false,
          desktop_notifications_enabled: false,
          work_hours_enabled: true,
          commission_enabled: false,
          commission_rate: 0,
          hourly_rate: 0,
          salary: 0,
          tips_enabled: true,
          time_clock_enabled: false,
          time_clock_pin: "",
          phone_call_availability_enabled: false,
          is_active: true,
        });
        setAvatarPreview(null);
        setLocationIds(selectedLocationId ? [selectedLocationId] : salons.map((s) => s.id));
        setServiceIds([]);
      }
      void (async () => {
        try {
          const { fetcher } = await import("@/lib/http/fetcher");
          const svcRes = await fetcher.get<{ data: Array<{ id: string; title?: string; name?: string }> }>(
            "/api/provider/services",
          );
          const rows = Array.isArray(svcRes.data) ? svcRes.data : [];
          setOfferings(rows.map((r) => ({ id: r.id, title: r.title || r.name || t("web.provider.teamMemberDialog.serviceFallback") })));
        } catch {
          setOfferings([]);
        }
      })();
      setActiveTab("basic");
    }
  }, [member, open]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Upload to storage and get URL
        const { fetcher } = await import("@/lib/http/fetcher");
        const uploadPayload = new FormData();
        uploadPayload.append("file", file);
        uploadPayload.append("folder", "avatars");
        
        const uploadResponse = await fetcher.post<{ data?: { url?: string } }>("/api/upload", uploadPayload);
        const avatarUrl = uploadResponse?.data?.url;
        
        if (avatarUrl) {
          setAvatarPreview(avatarUrl);
          setFormData((prev) => ({ ...prev, avatar_url: avatarUrl }));
        } else {
          // Fallback to data URL if upload fails
          const reader = new FileReader();
          reader.onloadend = () => {
            setAvatarPreview(reader.result as string);
            setFormData((prev) => ({ ...prev, avatar_url: reader.result as string }));
          };
          reader.readAsDataURL(file);
        }
      } catch (error) {
        console.error("Failed to upload avatar:", error);
        // Fallback to data URL
        const reader = new FileReader();
        reader.onloadend = () => {
          setAvatarPreview(reader.result as string);
          setFormData((prev) => ({ ...prev, avatar_url: reader.result as string }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let createdStaffId: string | undefined;
      if (member) {
        const updateData = {
          name: formData.name,
          email: formData.email,
          mobile: formData.mobile,
          avatar_url: formData.avatar_url,
          role: (formData.role as string) === "staff" ? "employee" : formData.role,
        };
        await providerApi.updateTeamMember(member.id, updateData);

        const { fetcher } = await import("@/lib/http/fetcher");
        try {
          await fetcher.patch(`/api/provider/staff/${member.id}`, {
            is_active: formData.is_active,
          });
        } catch (activeErr) {
          const fetchErr = activeErr as FetchError;
          if (
            formData.is_active === false &&
            (fetchErr?.status === 409 || fetchErr?.code === "FUTURE_BOOKINGS_CONFLICT")
          ) {
            const proceed = window.confirm(
              t("web.provider.teamMemberDialog.deactivateConfirm", { name: formData.name }),
            );
            if (!proceed) throw activeErr;
            await fetcher.patch(`/api/provider/staff/${member.id}`, {
              is_active: false,
              reassign_to: "any",
            });
          } else {
            throw activeErr;
          }
        }
        
        // Update basic info and settings separately
        try {
          // Update all other settings
          await fetcher.patch(`/api/provider/staff/${member.id}/settings`, {
            is_service_provider: formData.is_service_provider,
            enable_in_online_booking: formData.enable_in_online_booking,
            can_be_assigned_to_product_sales: formData.can_be_assigned_to_product_sales,
            mobileReady: formData.mobileReady,
            is_admin: formData.is_admin,
            email_notifications_enabled: formData.email_notifications_enabled,
            sms_notifications_enabled: formData.sms_plan_allowed
              ? formData.sms_notifications_enabled
              : false,
            desktop_notifications_enabled: formData.desktop_notifications_enabled,
            work_hours_enabled: formData.work_hours_enabled,
            commission_enabled: formData.commission_enabled,
            commission_rate: formData.commission_rate,
            hourly_rate: formData.hourly_rate,
            salary: formData.salary,
            tips_enabled: formData.tips_enabled,
            time_clock_enabled: formData.time_clock_enabled,
            time_clock_pin: formData.time_clock_pin,
            phone_call_availability_enabled: formData.phone_call_availability_enabled,
          });
        } catch (error) {
          console.error("Failed to update settings:", error);
          // Don't fail the whole operation if settings update fails
          toast.warning(t("web.provider.teamMemberDialog.settingsNotSavedUpdate"));
        }
        
        toast.success(t("web.provider.teamMemberDialog.updated"));
      } else {
        // Create staff member first
        const createdMember = await providerApi.createTeamMember({
          ...formData,
          location_ids: locationIds,
        });
        createdStaffId = createdMember.id;
        toast.success(t("web.provider.teamMemberDialog.created"));
        
        // Save settings after creation
        if (createdMember.id) {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            // Update avatar_url if provided
            if (formData.avatar_url) {
              await fetcher.patch(`/api/provider/staff/${createdMember.id}`, {
                avatar_url: formData.avatar_url,
              });
            }
            
            // Save all settings including is_active
            await fetcher.patch(`/api/provider/staff/${createdMember.id}`, {
              is_active: formData.is_active,
            });
            
            await fetcher.patch(`/api/provider/staff/${createdMember.id}/settings`, {
              is_service_provider: formData.is_service_provider,
              enable_in_online_booking: formData.enable_in_online_booking,
              can_be_assigned_to_product_sales: formData.can_be_assigned_to_product_sales,
              mobileReady: formData.mobileReady,
              is_admin: formData.is_admin,
              email_notifications_enabled: formData.email_notifications_enabled,
              sms_notifications_enabled: formData.sms_plan_allowed
                ? formData.sms_notifications_enabled
                : false,
              desktop_notifications_enabled: formData.desktop_notifications_enabled,
              work_hours_enabled: formData.work_hours_enabled,
              commission_enabled: formData.commission_enabled,
              commission_rate: formData.commission_rate,
              hourly_rate: formData.hourly_rate,
              salary: formData.salary,
              tips_enabled: formData.tips_enabled,
              time_clock_enabled: formData.time_clock_enabled,
              time_clock_pin: formData.time_clock_pin,
              phone_call_availability_enabled: formData.phone_call_availability_enabled,
            });
          } catch (error) {
            console.error("Failed to save settings:", error);
            // Don't fail the whole operation if settings save fails
            toast.warning(t("web.provider.teamMemberDialog.settingsNotSavedCreate"));
          }
        }
        
        // Optionally send invitation (email via Resend + push when registered)
        if (formData.email && createdMember.id) {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            const res = await fetcher.post<{
              data?: { join_url?: string; channels?: { email?: boolean; push?: boolean } };
            }>(`/api/provider/staff/${createdMember.id}/invite`, {
              email: formData.email,
            });
            const joinUrl = res.data?.join_url;
            if (joinUrl && !res.data?.channels?.email) {
              toast.success(t("web.provider.teamMemberDialog.createdShareInvite"), {
                description: joinUrl,
                duration: 8000,
              });
            } else {
              toast.success(t("web.provider.teamMemberDialog.createdInviteSent", { email: formData.email }));
            }
          } catch (error: any) {
            console.error("Failed to send invitation:", error);
            const joinUrl = error?.details?.join_url;
            if (joinUrl) {
              toast.warning(t("web.provider.teamMemberDialog.createdEmailFailed"), {
                description: t("web.provider.teamMemberDialog.shareThisLink", { url: joinUrl }),
                duration: 10000,
              });
            } else {
              toast.warning(t("web.provider.teamMemberDialog.createdInviteFailed"));
            }
          }
        }
      }
      const staffId = member?.id ?? createdStaffId;
      if (staffId && locationIds.length > 0) {
        try {
          const { fetcher } = await import("@/lib/http/fetcher");
          await fetcher.put(`/api/provider/staff/${staffId}/locations`, {
            location_ids: locationIds,
            primary_location_id: locationIds[0],
          });
        } catch (locErr) {
          const fetchErr = locErr as FetchError;
          if (fetchErr?.status === 409 || fetchErr?.code === "FUTURE_BOOKINGS_CONFLICT") {
            const proceed = window.confirm(
              t("web.provider.teamMemberDialog.locationsConflictConfirm"),
            );
            if (proceed) {
              const { fetcher } = await import("@/lib/http/fetcher");
              await fetcher.put(`/api/provider/staff/${staffId}/locations`, {
                location_ids: locationIds,
                primary_location_id: locationIds[0],
                force: true,
              });
            } else {
              toast.warning(t("web.provider.teamMemberDialog.locationsNotUpdated"));
            }
          } else {
            console.error("Failed to save staff locations:", locErr);
            toast.warning(t("web.provider.teamMemberDialog.locationsMayNotUpdate"));
          }
        }
      }
      if (staffId) {
        try {
          const { fetcher } = await import("@/lib/http/fetcher");
          await fetcher.put(`/api/provider/staff/${staffId}/services`, {
            service_ids: serviceIds,
          });
        } catch (svcErr) {
          const fetchErr = svcErr as FetchError;
          if (fetchErr?.status === 409 || fetchErr?.code === "FUTURE_BOOKINGS_CONFLICT") {
            const proceed = window.confirm(
              t("web.provider.teamMemberDialog.servicesConflictConfirm"),
            );
            if (proceed) {
              const { fetcher } = await import("@/lib/http/fetcher");
              await fetcher.put(`/api/provider/staff/${staffId}/services`, {
                service_ids: serviceIds,
                force: true,
              });
            } else {
              toast.warning(t("web.provider.teamMemberDialog.servicesNotUpdated"));
            }
          } else {
            console.error("Failed to save staff services:", svcErr);
            toast.warning(t("web.provider.teamMemberDialog.servicesMayNotUpdate"));
          }
        }
      }

      onSave?.(!!member);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Failed to save team member:", error);
      toastPlanGateError(error, t("web.provider.teamMemberDialog.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async () => {
    if (!formData.email || !member) {
      toast.error(t("web.provider.teamMemberDialog.inviteRequired"));
      return;
    }

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      const res = await fetcher.post<{
        data?: { join_url?: string; channels?: { email?: boolean; push?: boolean } };
      }>(`/api/provider/staff/${member.id}/invite`, {
        email: formData.email,
      });
      const joinUrl = res.data?.join_url;
      if (joinUrl && !res.data?.channels?.email) {
        toast.success(t("web.provider.teamMemberDialog.inviteLinkReady"), {
          description: joinUrl,
          duration: 8000,
        });
      } else {
        toast.success(t("web.provider.teamMemberDialog.invitationSent", { email: formData.email }));
      }
    } catch (error: any) {
      console.error("Failed to send invitation:", error);
      const joinUrl = error?.details?.join_url;
      if (joinUrl) {
        toast.error(error?.message || t("web.provider.teamMemberDialog.emailNotConfigured"), {
          description: t("web.provider.teamMemberDialog.shareThisLink", { url: joinUrl }),
          duration: 10000,
        });
      } else {
        toast.error(error?.message || t("web.provider.teamMemberDialog.inviteFailed"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-hidden p-0 bg-white rounded-lg sm:rounded-xl w-full m-4 sm:m-0 flex flex-col gap-0">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between pe-8">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 truncate">
                {member ? t("web.provider.teamMemberDialog.editTitle") : t("web.provider.teamMemberDialog.addTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-base text-gray-600 leading-relaxed line-clamp-2">
                {member 
                  ? t("web.provider.teamMemberDialog.editSubtitle")
                  : t("web.provider.teamMemberDialog.addSubtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            {/* Scrollable Tabs Header */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white">
              <div className="overflow-x-auto scrollbar-hide px-4 sm:px-6 py-2">
                <TabsList className="inline-flex h-auto w-auto p-1 bg-gray-100 rounded-lg whitespace-nowrap">
                  <TabsTrigger 
                    value="basic" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabBasic")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="service" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabService")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="permissions" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabPermissions")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="notifications" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabNotifications")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="compensation" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabCompensation")}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    {t("web.provider.teamMemberDialog.tabSettings")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6 pb-24">
                <TabsContent value="basic" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">{t("web.provider.teamMemberDialog.profileInformation")}</h3>
                
                {/* Avatar Upload - Mobile optimized */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-6 sm:mb-8 p-4 sm:p-6 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-white shadow-lg">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} alt={formData.name || t("web.provider.teamMemberDialog.staffMemberAlt")} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary-hover text-white text-3xl sm:text-4xl font-bold">
                          {formData.name.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <label
                      htmlFor="avatar-upload"
                      className="absolute -bottom-1 -right-1 p-2.5 sm:p-3 bg-primary text-white rounded-full cursor-pointer hover:bg-primary-hover transition-all shadow-lg hover:scale-110 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                    >
                      <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex-1 text-center sm:text-start">
                    <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5">{t("web.provider.teamMemberDialog.profilePhoto")}</p>
                    <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                      {t("web.provider.teamMemberDialog.profilePhotoHint")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm sm:text-base font-semibold text-gray-900">
                      {t("web.provider.teamMemberDialog.fullName")} <span className="text-primary">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                      placeholder={t("web.provider.teamMemberDialog.enterFullName")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm sm:text-base font-semibold text-gray-900">
                      {t("web.provider.common.email")} <span className="text-primary">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                      placeholder={t("web.provider.teamMemberDialog.emailPlaceholder")}
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />
                      {t("web.provider.teamMemberDialog.emailLoginHint")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <PhoneInput
                      value={formData.mobile}
                      onChange={(value) => setFormData({ ...formData, mobile: value })}
                      label={t("web.provider.teamMemberDialog.mobileNumber")}
                      required
                      placeholder={t("web.provider.teamMemberDialog.mobilePlaceholder")}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />
                      {t("web.provider.teamMemberDialog.smsHint")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-sm sm:text-base font-semibold text-gray-900">
                      {t("web.provider.common.role")} <span className="text-primary">*</span>
                    </Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value: any) => setFormData({ ...formData, role: value, is_admin: value === "owner" })}
                    >
                      <SelectTrigger className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[10000]">
                        {getOptions("team_role").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1.5">
                      {formData.role === "owner" || formData.role === "manager" 
                        ? t("web.provider.teamMemberDialog.adminRoleHint")
                        : t("web.provider.teamMemberDialog.normalRoleHint")}
                    </p>
                  </div>
                </div>

                {salons.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    <Label className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {t("web.provider.teamMemberDialog.assignLocations")}
                    </Label>
                    <p className="text-xs text-gray-500">
                      {t("web.provider.teamMemberDialog.assignLocationsHint")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {salons.map((salon) => {
                        const checked = locationIds.includes(salon.id);
                        return (
                          <label
                            key={salon.id}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 min-h-[44px] cursor-pointer hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setLocationIds((prev) =>
                                  checked ? prev.filter((id) => id !== salon.id) : [...prev, salon.id],
                                );
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-primary"
                            />
                            <span className="text-sm text-gray-900">
                              {salon.name}
                              {salon.city ? ` · ${salon.city}` : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {offerings.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    <Label className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
                      <Scissors className="w-4 h-4" />
                      {t("web.provider.teamMemberDialog.assignServices")}
                    </Label>
                    <p className="text-xs text-gray-500">
                      {t("web.provider.teamMemberDialog.assignServicesHint")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {offerings.map((offering) => {
                        const checked = serviceIds.includes(offering.id);
                        return (
                          <label
                            key={offering.id}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 min-h-[44px] cursor-pointer hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setServiceIds((prev) =>
                                  checked ? prev.filter((id) => id !== offering.id) : [...prev, offering.id],
                                );
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-primary"
                            />
                            <span className="text-sm text-gray-900">{offering.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {!member ? (
                  <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Bell className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-blue-900 mb-1.5">
                          {t("web.provider.teamMemberDialog.inviteToApp")}
                        </p>
                        <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
                          {t("web.provider.teamMemberDialog.inviteToAppBody")}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Send className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-blue-900 mb-1.5">
                          {t("web.provider.teamMemberDialog.resendInvite")}
                        </p>
                        <p className="text-xs sm:text-sm text-blue-700 mb-4 leading-relaxed">
                          {t("web.provider.teamMemberDialog.resendInviteBody", { email: formData.email || t("web.provider.teamMemberDialog.thisTeamMember") })}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSendInvite}
                          disabled={!formData.email}
                          className="min-h-[44px] touch-manipulation border-blue-300 text-blue-700 hover:bg-blue-100 hover:border-blue-400 w-full sm:w-auto"
                        >
                          <Send className="w-4 h-4 me-2" />
                          {t("web.provider.teamMemberDialog.resendInvitation")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

                <TabsContent value="service" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">{t("web.provider.teamMemberDialog.serviceProviderSettings")}</h3>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.is_service_provider}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_service_provider: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                        {t("web.provider.teamMemberDialog.isServiceProvider")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.isServiceProviderHint")}
                      </p>
                    </div>
                  </div>

                  {formData.is_service_provider && (
                    <div className="ms-0 sm:ms-4 space-y-4 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="flex items-start gap-4 p-3 sm:p-4 bg-white rounded-lg border border-blue-100">
                        <Switch
                          checked={formData.enable_in_online_booking}
                          onCheckedChange={(checked) => setFormData({ ...formData, enable_in_online_booking: checked })}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                            {t("web.provider.teamMemberDialog.enableInOnlineBooking")}
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                            {t("web.provider.teamMemberDialog.enableInOnlineBookingHint")}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4 p-3 sm:p-4 bg-white rounded-lg border border-blue-100">
                        <Switch
                          checked={formData.mobileReady}
                          onCheckedChange={(checked) => setFormData({ ...formData, mobileReady: checked })}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                            {t("web.provider.teamMemberDialog.mobileReady")}
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                            {t("web.provider.teamMemberDialog.mobileReadyHint")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.can_be_assigned_to_product_sales}
                      onCheckedChange={(checked) => setFormData({ ...formData, can_be_assigned_to_product_sales: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                        {t("web.provider.teamMemberDialog.canAssignProductSales")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.canAssignProductSalesHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="permissions" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.teamMemberDialog.permissions")}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  {t("web.provider.teamMemberDialog.permissionsHint")}
                </p>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.is_admin}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_admin: checked })}
                      disabled={formData.role === "owner"}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        {t("web.provider.teamMemberDialog.adminUser")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.role === "owner" 
                          ? t("web.provider.teamMemberDialog.ownersAllPermissions")
                          : t("web.provider.teamMemberDialog.adminFullAccess")}
                      </p>
                    </div>
                  </div>

                  {!formData.is_admin && (
                    <div className="ms-0 sm:ms-4 space-y-3 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <p className="text-sm font-semibold text-blue-900 mb-3">
                        {t("web.provider.teamMemberDialog.normalUsersAccess")}
                      </p>
                      <ul className="text-xs sm:text-sm text-blue-700 space-y-2 list-none">
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{t("web.provider.teamMemberDialog.accessOwnAppointments")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{t("web.provider.teamMemberDialog.accessCheckInOut")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{t("web.provider.teamMemberDialog.accessSales")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{t("web.provider.teamMemberDialog.accessSchedule")}</span>
                        </li>
                      </ul>
                      <p className="text-xs sm:text-sm text-blue-700 mt-4 leading-relaxed">
                        {t("web.provider.teamMemberDialog.detailedPermissions")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

                <TabsContent value="notifications" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.teamMemberDialog.notificationPreferences")}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  {t("web.provider.teamMemberDialog.notificationPreferencesHint")}
                </p>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.email_notifications_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, email_notifications_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.emailNotifications")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.emailNotificationsAt", { email: formData.email || t("web.provider.teamMemberDialog.theirEmailAddress") })}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm ${!formData.sms_plan_allowed ? "opacity-70" : ""}`}
                  >
                    <Switch
                      checked={formData.sms_plan_allowed ? formData.sms_notifications_enabled : false}
                      disabled={!formData.sms_plan_allowed}
                      onCheckedChange={(checked) => setFormData({ ...formData, sms_notifications_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.smsNotifications")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.sms_plan_allowed
                          ? t("web.provider.teamMemberDialog.smsNotificationsAt", { mobile: formData.mobile || t("web.provider.teamMemberDialog.theirMobileNumber") })
                          : t("web.provider.teamMemberDialog.smsPlanLocked")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.desktop_notifications_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, desktop_notifications_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.desktopNotifications")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.desktopNotificationsHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="compensation" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{t("web.provider.teamMemberDialog.compensationSettings")}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  {t("web.provider.teamMemberDialog.compensationHint")}
                </p>
                
                <div className="space-y-5 sm:space-y-6">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.commission_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, commission_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.serviceProductCommission")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.commissionHint")}
                      </p>
                    </div>
                  </div>

                  {formData.commission_enabled && (
                    <div className="ms-0 sm:ms-4 space-y-3 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="space-y-2">
                        <Label htmlFor="commission_rate" className="text-sm sm:text-base font-semibold text-gray-900">
                          {t("web.provider.teamMemberDialog.commissionRate")}
                        </Label>
                        <Input
                          id="commission_rate"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={formData.commission_rate}
                          onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })}
                          className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                          placeholder={t("web.provider.teamMemberDialog.commissionRatePlaceholder")}
                        />
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          {t("web.provider.teamMemberDialog.commissionRateHint")}
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator className="my-6" />

                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate" className="text-sm sm:text-base font-semibold text-gray-900">
                      {t("web.provider.teamMemberDialog.hourlyRate")}
                    </Label>
                    <Input
                      id="hourly_rate"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.hourly_rate}
                      onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                      placeholder={t("web.provider.teamMemberDialog.moneyPlaceholder")}
                    />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      {t("web.provider.teamMemberDialog.hourlyRateHint")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="salary" className="text-sm sm:text-base font-semibold text-gray-900">
                      {t("web.provider.teamMemberDialog.salary")}
                    </Label>
                    <Input
                      id="salary"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.salary}
                      onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                      placeholder={t("web.provider.teamMemberDialog.moneyPlaceholder")}
                    />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      {t("web.provider.teamMemberDialog.salaryHint")}
                    </p>
                  </div>

                  <Separator className="my-6" />

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.tips_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, tips_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                        {t("web.provider.teamMemberDialog.tipsEnabled")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.tipsEnabledHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="settings" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-5 sm:mb-6">{t("web.provider.teamMemberDialog.additionalSettings")}</h3>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.work_hours_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, work_hours_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.customWorkHours")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.work_hours_enabled
                          ? t("web.provider.teamMemberDialog.customWorkHoursOn")
                          : t("web.provider.teamMemberDialog.customWorkHoursOff")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.time_clock_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, time_clock_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.timeClockEnabled")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.timeClockEnabledHint")}
                      </p>
                    </div>
                  </div>

                  {formData.time_clock_enabled && (
                    <div className="ms-0 sm:ms-4 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="space-y-2">
                        <Label htmlFor="time_clock_pin" className="text-sm sm:text-base font-semibold text-gray-900">
                          {t("web.provider.teamMemberDialog.timeClockPin")}
                        </Label>
                        <Input
                          id="time_clock_pin"
                          type="text"
                          value={formData.time_clock_pin}
                          onChange={(e) => setFormData({ ...formData, time_clock_pin: e.target.value })}
                          className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-primary focus:ring-primary rounded-lg"
                          placeholder={t("web.provider.teamMemberDialog.timeClockPinPlaceholder")}
                          maxLength={4}
                        />
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          {t("web.provider.teamMemberDialog.timeClockPinHint")}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.phone_call_availability_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, phone_call_availability_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        {t("web.provider.teamMemberDialog.phoneCallAvailability")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {t("web.provider.teamMemberDialog.phoneCallAvailabilityHint")}
                      </p>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                        {t("web.provider.common.active")}
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.is_active 
                          ? t("web.provider.teamMemberDialog.staffActiveHint")
                          : t("web.provider.teamMemberDialog.staffInactiveHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
              </div>
            </div>
          </Tabs>

          <DialogFooter className="flex-shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 flex-col-reverse sm:flex-row gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm font-semibold border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-[#B80452] min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all rounded-lg"
            >
              {isLoading ? t("web.provider.common.saving") : member ? t("web.provider.teamMemberDialog.updateStaffMember") : t("web.provider.teamMemberDialog.createStaffMember")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
