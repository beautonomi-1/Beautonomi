"use client";

import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
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
  const [shareCancellationFee, setShareCancellationFee] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [checklist, setChecklist] = useState<{
    staff_with_commission_enabled: number;
    staff_enabled_zero_rate: number;
    services_with_staff_commission_disabled: number;
    active_services: number;
  } | null>(null);

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
      try {
        const setup = await fetcher.get<{
          data: {
            staff_share_cancellation_fee?: boolean;
            checklist?: {
              staff_with_commission_enabled: number;
              staff_enabled_zero_rate: number;
              services_with_staff_commission_disabled: number;
              active_services: number;
            };
          };
        }>("/api/provider/settings/team/commissions?view=setup");
        setShareCancellationFee(setup.data?.staff_share_cancellation_fee === true);
        setChecklist(setup.data?.checklist ?? null);
      } catch {
        setChecklist(null);
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
      toast.error(t("web.provider.settings.pages.team/commissions.failedToLoadTeamMembers"));
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
      toast.success(t("web.provider.settings.pages.team/commissions.commissionSettingsSavedSuccessfully"));
    } catch (error: any) {
      console.error("Failed to save commission settings:", error);
      toast.error(error.message || t("web.provider.settings.pages.team/commissions.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.team.items.commissions.title")}
      subtitle={t("web.provider.settings.categories.team.items.commissions.description")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.common.saving") : t("web.provider.common.saveSettings")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.team/commissions.team"), href: "/provider/settings/team/roles" },
        { label: t("web.provider.settings.pages.team/commissions.commissions") },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <p className="text-gray-600 mb-4">{t("web.provider.settings.pages.team/commissions.noActiveMembers")}</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
            {t("web.provider.settings.pages.team/commissions.addTeamMembers")}
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {checklist ? (
            <SectionCard>
              <p className="text-sm font-semibold text-gray-900 mb-2">{t("web.provider.settings.pages.team/commissions.checklistTitle")}</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>
                  {checklist.staff_with_commission_enabled > 0 ? "✓" : "○"} {t("web.provider.settings.pages.team/commissions.enableCommissionOnStaff")}
                  {checklist.staff_with_commission_enabled > 0
                    ? t("web.provider.settings.pages.team/commissions.enabledCount", { count: checklist.staff_with_commission_enabled })
                    : ""}
                </li>
                <li>
                  {checklist.staff_enabled_zero_rate === 0 ? "✓" : "○"} {t("web.provider.settings.pages.team/commissions.setRateAboveZero")}
                  {checklist.staff_enabled_zero_rate > 0
                    ? t("web.provider.settings.pages.team/commissions.stillAtZero", { count: checklist.staff_enabled_zero_rate })
                    : ""}
                </li>
                <li>
                  {checklist.services_with_staff_commission_disabled === 0 ? "✓" : "○"} {t("web.provider.settings.pages.team/commissions.turnOnStaffCommission")}
                  {checklist.services_with_staff_commission_disabled > 0
                    ? t("web.provider.settings.pages.team/commissions.servicesOff", {
                        count: checklist.services_with_staff_commission_disabled,
                        total: checklist.active_services,
                      })
                    : ""}
                </li>
              </ul>
              <div className="mt-4 flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <Switch
                  checked={shareCancellationFee}
                  disabled={savingPolicy}
                  onCheckedChange={async (checked) => {
                    setSavingPolicy(true);
                    try {
                      await fetcher.patch("/api/provider/settings/team/commissions", {
                        staff_share_cancellation_fee: checked,
                      });
                      setShareCancellationFee(checked);
                      toast.success(
                        checked
                          ? t("web.provider.settings.pages.team/commissions.shareFeesOn")
                          : t("web.provider.settings.pages.team/commissions.shareFeesOff"),
                      );
                    } catch (error: unknown) {
                      toast.error(error instanceof Error ? error.message : t("web.provider.settings.pages.team/commissions.failedToUpdatePolicy"));
                    } finally {
                      setSavingPolicy(false);
                    }
                  }}
                  className="mt-1"
                />
                <div>
                  <Label className="text-sm font-medium">{t("web.provider.settings.pages.team/commissions.shareCancellationFees")}</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    {t("web.provider.settings.pages.team/commissions.shareCancellationFeesHint")}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
                  {t("web.provider.settings.pages.team/commissions.selectTeamMember")}
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder={t("web.provider.settings.pages.team/commissions.selectATeamMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
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
                      <AvatarFallback className="bg-primary/10 text-primary">
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
                <TabsTrigger value="commission" className="text-xs sm:text-sm">{t("web.provider.settings.pages.team/commissions.commission")}</TabsTrigger>
                <TabsTrigger value="hourly" className="text-xs sm:text-sm">{t("web.provider.settings.pages.team/commissions.hourly")}</TabsTrigger>
                <TabsTrigger value="salary" className="text-xs sm:text-sm">{t("web.provider.settings.pages.team/commissions.salary")}</TabsTrigger>
                <TabsTrigger value="tips" className="text-xs sm:text-sm">{t("web.provider.settings.pages.team/commissions.tips")}</TabsTrigger>
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
                          {t("web.provider.settings.pages.team/commissions.enableCommission")}
                        </Label>
                        <p className="text-xs text-gray-500 mt-1">
                          {t("web.provider.settings.pages.team/commissions.enableCommissionHint")}
                        </p>
                      </div>
                    </div>

                    {settings.enabled && (
                      <div className="ms-0 sm:ms-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div>
                          <Label htmlFor="service_commission_rate" className="text-sm font-medium">
                            {t("web.provider.settings.pages.team/commissions.serviceCommissionRate")}
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
                              className="min-h-[44px] touch-manipulation pe-10"
                              placeholder={t("web.provider.settings.pages.team/commissions.n00")}
                            />
                            <Percent className="absolute end-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5">
                            {t("web.provider.settings.pages.team/commissions.serviceCommissionRateHint")}
                          </p>
                        </div>

                        <Separator />

                        <div>
                          <Label htmlFor="product_commission_rate" className="text-sm font-medium">
                            {t("web.provider.settings.pages.team/commissions.productCommissionRate")}
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
                              className="min-h-[44px] touch-manipulation pe-10"
                              placeholder={t("web.provider.settings.pages.team/commissions.n00")}
                            />
                            <Percent className="absolute end-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          </div>
                          <p className="text-xs text-gray-500 mt-1.5">
                            {t("web.provider.settings.pages.team/commissions.productCommissionRateHint")}
                          </p>
                        </div>

                        <Separator />

                        <div>
                          <Label className="text-sm font-medium">{t("web.provider.settings.pages.team/commissions.tieredCommission")}</Label>
                          <p className="text-xs text-gray-500 mt-1 mb-3">
                            {t("web.provider.settings.pages.team/commissions.tieredCommissionHint")}
                          </p>
                          <div className="space-y-3">
                            {settings.tiers.map((tier, idx) => (
                              <div key={tier.id ?? idx} className="flex items-center gap-2 p-3 bg-white border rounded-lg">
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">{t("web.provider.settings.pages.team/commissions.minRevenue")}</Label>
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
                                    <Label className="text-xs">{t("web.provider.settings.pages.team/commissions.ratePct")}</Label>
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
                              <Plus className="w-4 h-4 me-1" />
                              {t("web.provider.settings.pages.team/commissions.addTier")}
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
                        {t("web.provider.settings.pages.team/commissions.hourlyRate")}
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
                          className="min-h-[44px] touch-manipulation ps-8"
                          placeholder={t("web.provider.settings.pages.team/commissions.n000")}
                        />
                        <DollarSign className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        {t("web.provider.settings.pages.team/commissions.hourlyRateHint")}
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            {t("web.provider.settings.pages.team/commissions.timeClockIntegration")}
                          </p>
                          <p className="text-xs text-blue-700">
                            {t("web.provider.settings.pages.team/commissions.timeClockHint")}
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
                        {t("web.provider.settings.pages.team/commissions.monthlySalary")}
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
                          className="min-h-[44px] touch-manipulation ps-8"
                          placeholder={t("web.provider.settings.pages.team/commissions.n000")}
                        />
                        <DollarSign className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        {t("web.provider.settings.pages.team/commissions.monthlySalaryHint")}
                      </p>
                    </div>

                    <div className="p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            {t("web.provider.settings.pages.team/commissions.salaryPayment")}
                          </p>
                          <p className="text-xs text-blue-700">
                            {t("web.provider.settings.pages.team/commissions.salaryPaymentHint")}
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
                          {t("web.provider.settings.pages.team/commissions.enableTips")}
                        </Label>
                        <p className="text-xs text-gray-500 mt-1">
                          {t("web.provider.settings.pages.team/commissions.enableTipsHint")}
                        </p>
                      </div>
                    </div>

                    {settings.tips_enabled && (
                      <div className="ms-0 sm:ms-12 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs font-medium text-blue-900 mb-2">
                          {t("web.provider.settings.pages.team/commissions.tipsInformation")}
                        </p>
                        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                          <li>{t("web.provider.settings.pages.team/commissions.tipsCanBeAdded")}</li>
                          <li>{t("web.provider.settings.pages.team/commissions.tipsCanBeSplit")}</li>
                          <li>{t("web.provider.settings.pages.team/commissions.tipsTrackedSeparately")}</li>
                          <li>{t("web.provider.settings.pages.team/commissions.tipsPaidOut")}</li>
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
