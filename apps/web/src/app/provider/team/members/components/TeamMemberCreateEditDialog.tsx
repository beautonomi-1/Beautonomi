"use client";

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
import { Camera, Mail, Phone, Shield, Clock, DollarSign, Bell, Send } from "lucide-react";
import type { TeamMember } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { useReferenceData } from "@/hooks/useReferenceData";

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
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

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
    sms_notifications_enabled: true,
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
              is_admin: settings?.is_admin ?? (member.role === "owner" || member.role === "manager"),
              email_notifications_enabled: settings?.email_notifications_enabled ?? true,
              sms_notifications_enabled: settings?.sms_notifications_enabled ?? true,
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
              is_admin: member.role === "owner" || member.role === "manager",
              email_notifications_enabled: true,
              sms_notifications_enabled: true,
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
          sms_notifications_enabled: true,
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
      }
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
      if (member) {
        const updateData = {
          name: formData.name,
          email: formData.email,
          mobile: formData.mobile,
          avatar_url: formData.avatar_url,
          role: (formData.role as string) === "staff" ? "employee" : formData.role,
        };
        await providerApi.updateTeamMember(member.id, updateData);
        
        // Update basic info and settings separately
        try {
          const { fetcher } = await import("@/lib/http/fetcher");
          // Update is_active via the main staff endpoint
          await fetcher.patch(`/api/provider/staff/${member.id}`, {
            is_active: formData.is_active,
          });
          
          // Update all other settings
          await fetcher.patch(`/api/provider/staff/${member.id}/settings`, {
            is_service_provider: formData.is_service_provider,
            enable_in_online_booking: formData.enable_in_online_booking,
            can_be_assigned_to_product_sales: formData.can_be_assigned_to_product_sales,
            mobileReady: formData.mobileReady,
            is_admin: formData.is_admin,
            email_notifications_enabled: formData.email_notifications_enabled,
            sms_notifications_enabled: formData.sms_notifications_enabled,
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
          toast.warning("Staff member updated but some settings may not have been saved");
        }
        
        toast.success("Team member updated successfully");
      } else {
        // Create staff member first
        const createdMember = await providerApi.createTeamMember(formData);
        toast.success("Team member created successfully");
        
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
              sms_notifications_enabled: formData.sms_notifications_enabled,
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
            toast.warning("Staff member created but some settings may not have been saved");
          }
        }
        
        // Optionally send invitation
        if (formData.email && createdMember.id) {
          try {
            const { fetcher } = await import("@/lib/http/fetcher");
            await fetcher.post(`/api/provider/staff/${createdMember.id}/invite`, {
              email: formData.email,
            });
          } catch (error) {
            console.error("Failed to send invitation:", error);
            // Don't fail the whole operation if invitation fails
          }
        }
      }
      onSave?.(!!member);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save team member:", error);
      toast.error(error?.message || "Failed to save team member");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async () => {
    if (!formData.email || !member) {
      toast.error("Email and team member are required to send invitation");
      return;
    }

    try {
      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/staff/${member.id}/invite`, {
        email: formData.email,
      });
      toast.success(`Invitation sent to ${formData.email}`);
    } catch (error: any) {
      console.error("Failed to send invitation:", error);
      toast.error(error?.message || "Failed to send invitation");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-hidden p-0 bg-white rounded-lg sm:rounded-xl w-full m-4 sm:m-0 flex flex-col gap-0">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between pr-8">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 truncate">
                {member ? "Edit Staff Member" : "Add Staff Member"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-base text-gray-600 leading-relaxed line-clamp-2">
                {member 
                  ? "Update staff member details and settings"
                  : "Add a new staff member. They'll receive an email invitation to create their account."}
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
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Basic Info
                  </TabsTrigger>
                  <TabsTrigger 
                    value="service" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Service Provider
                  </TabsTrigger>
                  <TabsTrigger 
                    value="permissions" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Permissions
                  </TabsTrigger>
                  <TabsTrigger 
                    value="notifications" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Notifications
                  </TabsTrigger>
                  <TabsTrigger 
                    value="compensation" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Compensation
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="px-3 py-1.5 text-xs sm:text-sm font-medium data-[state=active]:bg-[#FF0077] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
                  >
                    Settings
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6 pb-24">
                <TabsContent value="basic" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Profile Information</h3>
                
                {/* Avatar Upload - Mobile optimized */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-6 sm:mb-8 p-4 sm:p-6 bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-100">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-white shadow-lg">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} alt={formData.name || "Staff member"} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-[#FF0077] to-[#D60565] text-white text-3xl sm:text-4xl font-bold">
                          {formData.name.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <label
                      htmlFor="avatar-upload"
                      className="absolute -bottom-1 -right-1 p-2.5 sm:p-3 bg-[#FF0077] text-white rounded-full cursor-pointer hover:bg-[#D60565] transition-all shadow-lg hover:scale-110 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
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
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5">Profile Photo</p>
                    <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                      Click the camera icon to upload a photo. This will appear in online booking.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm sm:text-base font-semibold text-gray-900">
                      Full Name <span className="text-[#FF0077]">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm sm:text-base font-semibold text-gray-900">
                      Email <span className="text-[#FF0077]">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                      placeholder="email@example.com"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />
                      Used for login and notifications
                    </p>
                  </div>
                  <div className="space-y-2">
                    <PhoneInput
                      value={formData.mobile}
                      onChange={(value) => setFormData({ ...formData, mobile: value })}
                      label="Mobile Number"
                      required
                      placeholder="82 123 4567"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />
                      Used for SMS notifications
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-sm sm:text-base font-semibold text-gray-900">
                      Role <span className="text-[#FF0077]">*</span>
                    </Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value: any) => setFormData({ ...formData, role: value, is_admin: value === "owner" || value === "manager" })}
                    >
                      <SelectTrigger className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg">
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
                        ? "Admin users have all permissions enabled"
                        : "Normal users have limited permissions"}
                    </p>
                  </div>
                </div>

                {!member && (
                  <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Bell className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-semibold text-blue-900 mb-1.5">
                          Send Email Invitation
                        </p>
                        <p className="text-xs sm:text-sm text-blue-700 mb-4 leading-relaxed">
                          After creating the staff member, you can send them an email invitation to create their Beautonomi login.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSendInvite}
                          className="min-h-[44px] touch-manipulation border-blue-300 text-blue-700 hover:bg-blue-100 hover:border-blue-400 w-full sm:w-auto"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Send Invitation
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

                <TabsContent value="service" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Service Provider Settings</h3>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.is_service_provider}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_service_provider: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                        Is service provider
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Enable this to assign services to this staff member. Required for service providers.
                      </p>
                    </div>
                  </div>

                  {formData.is_service_provider && (
                    <div className="ml-0 sm:ml-4 space-y-4 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="flex items-start gap-4 p-3 sm:p-4 bg-white rounded-lg border border-blue-100">
                        <Switch
                          checked={formData.enable_in_online_booking}
                          onCheckedChange={(checked) => setFormData({ ...formData, enable_in_online_booking: checked })}
                          className="mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer block">
                            Enable in online booking
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                            Allow clients to select this staff member when booking online
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
                            Mobile Ready
                          </Label>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                            Can perform at-home/mobile services. Required for mobile appointments.
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
                        Can be assigned to product sales
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Allow this staff member to be assigned to product sales even if they're not a service provider (e.g., front desk staff)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="permissions" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Permissions</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  Configure what this staff member can access and manage
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
                        Admin User
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.role === "owner" 
                          ? "Owners automatically have all permissions"
                          : "Admin users have full access to all features and settings"}
                      </p>
                    </div>
                  </div>

                  {!formData.is_admin && (
                    <div className="ml-0 sm:ml-4 space-y-3 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <p className="text-sm font-semibold text-blue-900 mb-3">
                        Normal users typically have access to:
                      </p>
                      <ul className="text-xs sm:text-sm text-blue-700 space-y-2 list-none">
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>View and manage their own appointments</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>Check in/out clients</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>Process sales and payments</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>View their own schedule and shifts</span>
                        </li>
                      </ul>
                      <p className="text-xs sm:text-sm text-blue-700 mt-4 leading-relaxed">
                        Detailed permissions can be configured in Settings → Team → Permissions
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

                <TabsContent value="notifications" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Notification Preferences</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  Configure how this staff member receives notifications
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
                        <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Email Notifications
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Receive notifications via email at {formData.email || "their email address"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.sms_notifications_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, sms_notifications_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        SMS Notifications
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Receive notifications via SMS at {formData.mobile || "their mobile number"}
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
                        <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Desktop Notifications
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Show browser desktop notifications for appointments and updates
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="compensation" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Compensation Settings</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6 leading-relaxed">
                  Configure how this staff member is compensated
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
                        <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Service and Product Commission
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Enable commission-based compensation for services and products sold
                      </p>
                    </div>
                  </div>

                  {formData.commission_enabled && (
                    <div className="ml-0 sm:ml-4 space-y-3 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="space-y-2">
                        <Label htmlFor="commission_rate" className="text-sm sm:text-base font-semibold text-gray-900">
                          Commission Rate (%)
                        </Label>
                        <Input
                          id="commission_rate"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={formData.commission_rate}
                          onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })}
                          className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                          placeholder="e.g., 50"
                        />
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          Percentage of service/product price paid as commission
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator className="my-6" />

                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate" className="text-sm sm:text-base font-semibold text-gray-900">
                      Hourly Rate (R)
                    </Label>
                    <Input
                      id="hourly_rate"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.hourly_rate}
                      onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Hourly wage for hourly-based compensation
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="salary" className="text-sm sm:text-base font-semibold text-gray-900">
                      Salary (R)
                    </Label>
                    <Input
                      id="salary"
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.salary}
                      onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                      className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Monthly salary for salaried staff members
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
                        Tips Enabled
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Allow this staff member to receive tips from clients
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

                <TabsContent value="settings" className="mt-0 space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-5 sm:mb-6">Additional Settings</h3>
                
                <div className="space-y-4 sm:space-y-5">
                  <div className="flex items-start gap-4 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
                    <Switch
                      checked={formData.work_hours_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, work_hours_enabled: checked })}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm sm:text-base font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Work Hours Enabled
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Enable work hours and schedule management for this staff member
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
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Time Clock Enabled
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Allow this staff member to clock in and out using the time clock
                      </p>
                    </div>
                  </div>

                  {formData.time_clock_enabled && (
                    <div className="ml-0 sm:ml-4 p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                      <div className="space-y-2">
                        <Label htmlFor="time_clock_pin" className="text-sm sm:text-base font-semibold text-gray-900">
                          Time Clock PIN
                        </Label>
                        <Input
                          id="time_clock_pin"
                          type="text"
                          value={formData.time_clock_pin}
                          onChange={(e) => setFormData({ ...formData, time_clock_pin: e.target.value })}
                          className="mt-1.5 min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm border-gray-300 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-lg"
                          placeholder="Enter 4-digit PIN"
                          maxLength={4}
                        />
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          PIN for clocking in/out on front desk devices
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
                        <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0077]" />
                        Phone Call Availability
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        Enable phone call availability for this staff member
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
                        Active
                      </Label>
                      <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                        {formData.is_active 
                          ? "This staff member is active and can be assigned to appointments"
                          : "This staff member is inactive and will not appear in booking options"}
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#D60565] hover:to-[#B80452] min-h-[48px] sm:min-h-[44px] touch-manipulation text-base sm:text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all rounded-lg"
            >
              {isLoading ? "Saving..." : member ? "Update Staff Member" : "Create Staff Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
