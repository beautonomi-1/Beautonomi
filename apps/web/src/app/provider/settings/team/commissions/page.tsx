"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
import type { TeamMember } from "@/lib/provider-portal/types";
import { toast } from "sonner";
import { DollarSign, Percent, Clock, Calendar, TrendingUp, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CommissionTier {
  id?: string;
  min_revenue: number;
  commission_rate: number;
  tier_order?: number;
}

interface CommissionSettings {
  enabled: boolean;
  service_commission_rate: number;
  product_commission_rate: number;
  hourly_rate: number;
  salary: number;
  tips_enabled: boolean;
  tiers: CommissionTier[];
}

export default function CommissionsSettings() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [settings, setSettings] = useState<CommissionSettings>({
    enabled: false,
    service_commission_rate: 0,
    product_commission_rate: 0,
    hourly_rate: 0,
    salary: 0,
    tips_enabled: true,
    tiers: [],
  });
  const [_compensationType, setCompensationType] = useState<"commission" | "hourly" | "salary" | "mixed">("commission");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      loadCommissionSettings(selectedMember);
    }
  }, [selectedMember]);

  const loadTeamMembers = async () => {
    try {
      setIsLoading(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members.filter((m) => m.is_active));
      if (members.length > 0 && !selectedMember) {
        setSelectedMember(members[0].id);
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
      toast.error("Failed to load team members");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCommissionSettings = async (memberId: string) => {
    try {
      const response = await fetcher.get<{
        data: {
          enabled: boolean;
          serviceCommissionRate: number;
          productCommissionRate: number;
          hourlyRate: number;
          salary: number;
          tipsEnabled: boolean;
          tiers?: { id: string; minRevenue: number; commissionRate: number; tierOrder: number }[];
        };
      }>(`/api/provider/staff/${memberId}/commission`);
      const tiers = (response.data.tiers || []).map((t) => ({
        id: t.id,
        min_revenue: t.minRevenue,
        commission_rate: t.commissionRate,
        tier_order: t.tierOrder,
      }));
      setSettings({
        enabled: response.data.enabled,
        service_commission_rate: response.data.serviceCommissionRate,
        product_commission_rate: response.data.productCommissionRate,
        hourly_rate: response.data.hourlyRate,
        salary: response.data.salary,
        tips_enabled: response.data.tipsEnabled,
        tiers,
      });
      // Determine compensation type based on what's set
      if (response.data.salary > 0) {
        setCompensationType("salary");
      } else if (response.data.hourlyRate > 0) {
        setCompensationType("hourly");
      } else if (response.data.enabled) {
        setCompensationType("commission");
      } else {
        setCompensationType("commission");
      }
    } catch (error) {
      console.error("Failed to load commission settings:", error);
      // Use default values on error
      setSettings({
        enabled: false,
        service_commission_rate: 0,
        product_commission_rate: 0,
        hourly_rate: 0,
        salary: 0,
        tips_enabled: true,
        tiers: [],
      });
      setCompensationType("commission");
    }
  };

  const handleSave = async () => {
    if (!selectedMember) return;

    setIsSaving(true);
    try {
      await fetcher.patch(`/api/provider/staff/${selectedMember}/commission`, {
        commission_enabled: settings.enabled,
        service_commission_rate: settings.service_commission_rate,
        product_commission_rate: settings.product_commission_rate,
        hourly_rate: settings.hourly_rate,
        salary: settings.salary,
        tips_enabled: settings.tips_enabled,
        tiers: settings.tiers.map((t, i) => ({
          min_revenue: t.min_revenue,
          commission_rate: t.commission_rate,
          tier_order: t.tier_order ?? i,
        })),
      });
      toast.success("Commission settings saved successfully");
    } catch (error: any) {
      console.error("Failed to save commission settings:", error);
      toast.error(error.message || "Failed to save commission settings");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);

  return (
    <SettingsDetailLayout
      title="Commissions & Compensation"
      subtitle="Configure how your team members are compensated"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Settings"}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Team", href: "/provider/settings/team/roles" },
        { label: "Commissions" },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <p className="text-gray-600 mb-4">No active team members found</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
            Add Team Members
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
                  Select Team Member
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Select a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMemberData && (
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                      <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                        {selectedMemberData.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm sm:text-base">{selectedMemberData.name}</p>
                      <p className="text-xs sm:text-sm text-gray-500">{selectedMemberData.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Compensation Settings */}
          {selectedMember && (
            <Tabs defaultValue="commission" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4 sm:mb-6">
                <TabsTrigger value="commission" className="text-xs sm:text-sm">Commission</TabsTrigger>
                <TabsTrigger value="hourly" className="text-xs sm:text-sm">Hourly</TabsTrigger>
                <TabsTrigger value="salary" className="text-xs sm:text-sm">Salary</TabsTrigger>
                <TabsTrigger value="tips" className="text-xs sm:text-sm">Tips</TabsTrigger>
              </TabsList>

              {/* Commission Tab */}
              <TabsContent value="commission" className="space-y-4 sm:space-y-6">
                <SectionCard>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                      <Switch
                        checked={settings.enabled}
                        onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                          <Percent className="w-4 h-4" />
                          Enable Commission
                        </Label>
                        <p className="text-xs text-gray-500 mt-1">
                          Enable commission-based compensation for this team member
                        </p>
                      </div>
                    </div>

                    {settings.enabled && (
                      <div className="ml-0 sm:ml-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div>
                          <Label htmlFor="service_commission_rate" className="text-sm font-medium">
                            Service Commission Rate (%)
                          </Label>
                          <div className="relative mt-1.5">
                            <Input
                              id="service_commission_rate"
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={settings.service_commission_rate}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  service_commission_rate: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="min-h-[44px] touch-manipulation pr-10"
                              placeholder="0.0"
                            />
                            <Percent className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5">
                            Percentage of service price paid as commission
                          </p>
                        </div>

                        <Separator />

                        <div>
                          <Label htmlFor="product_commission_rate" className="text-sm font-medium">
                            Product Commission Rate (%)
                          </Label>
                          <div className="relative mt-1.5">
                            <Input
                              id="product_commission_rate"
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={settings.product_commission_rate}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  product_commission_rate: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="min-h-[44px] touch-manipulation pr-10"
                              placeholder="0.0"
                            />
                            <Percent className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5">
                            Percentage of product price paid as commission
                          </p>
                        </div>

                        <Separator />

                        <div>
                          <Label className="text-sm font-medium">Tiered Commission (Optional)</Label>
                          <p className="text-xs text-gray-500 mt-1 mb-3">
                            When period revenue reaches a threshold, the higher rate applies to all revenue. Add tiers in ascending order of min revenue.
                          </p>
                          <div className="space-y-3">
                            {settings.tiers.map((tier, idx) => (
                              <div key={tier.id ?? idx} className="flex items-center gap-2 p-3 bg-white border rounded-lg">
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">Min Revenue (R)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={tier.min_revenue}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        const next = [...settings.tiers];
                                        next[idx] = { ...next[idx], min_revenue: v };
                                        setSettings({ ...settings, tiers: next });
                                      }}
                                      placeholder="0"
                                      className="h-9"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Rate (%)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.1}
                                      value={tier.commission_rate}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        const next = [...settings.tiers];
                                        next[idx] = { ...next[idx], commission_rate: v };
                                        setSettings({ ...settings, tiers: next });
                                      }}
                                      placeholder="0"
                                      className="h-9"
                                    />
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700 shrink-0 mt-5"
                                  onClick={() => {
                                    const next = settings.tiers.filter((_, i) => i !== idx);
                                    setSettings({ ...settings, tiers: next });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setSettings({
                                  ...settings,
                                  tiers: [...settings.tiers, { min_revenue: 0, commission_rate: 0 }],
                                })
                              }
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add tier
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </TabsContent>

              {/* Hourly Tab */}
              <TabsContent value="hourly" className="space-y-4 sm:space-y-6">
                <SectionCard>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="hourly_rate" className="text-sm sm:text-base font-medium">
                        Hourly Rate (R)
                      </Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="hourly_rate"
                          type="number"
                          min={0}
                          step={0.01}
                          value={settings.hourly_rate}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              hourly_rate: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="min-h-[44px] touch-manipulation pl-8"
                          placeholder="0.00"
                        />
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Hourly wage for hourly-based compensation
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            Time Clock Integration
                          </p>
                          <p className="text-xs text-blue-700">
                            Hourly rate will be calculated based on time clock entries. Make sure time clock is enabled for this team member.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>

              {/* Salary Tab */}
              <TabsContent value="salary" className="space-y-4 sm:space-y-6">
                <SectionCard>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="salary" className="text-sm sm:text-base font-medium">
                        Monthly Salary (R)
                      </Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="salary"
                          type="number"
                          min={0}
                          step={0.01}
                          value={settings.salary}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              salary: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="min-h-[44px] touch-manipulation pl-8"
                          placeholder="0.00"
                        />
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Fixed monthly salary for salaried staff members
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            Salary Payment
                          </p>
                          <p className="text-xs text-blue-700">
                            Salary is paid monthly regardless of hours worked or services performed.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>

              {/* Tips Tab */}
              <TabsContent value="tips" className="space-y-4 sm:space-y-6">
                <SectionCard>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                      <Switch
                        checked={settings.tips_enabled}
                        onCheckedChange={(checked) =>
                          setSettings({ ...settings, tips_enabled: checked })
                        }
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          Enable Tips
                        </Label>
                        <p className="text-xs text-gray-500 mt-1">
                          Allow this team member to receive tips from clients during checkout
                        </p>
                      </div>
                    </div>

                    {settings.tips_enabled && (
                      <div className="ml-0 sm:ml-12 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs font-medium text-blue-900 mb-2">
                          Tips Information
                        </p>
                        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                          <li>Tips can be added during checkout</li>
                          <li>Tips can be split between multiple staff members</li>
                          <li>Tips are tracked separately from commissions and wages</li>
                          <li>Tips can be paid out in cash or included in payroll</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </SettingsDetailLayout>
  );
}
