"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Plus, AlertCircle } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { formatCurrency } from "@/lib/utils";

interface CancellationPolicy {
  id?: string;
  name: string;
  hours_before: number;
  refund_percentage: number;
  fee_amount?: number;
  fee_type?: "fixed" | "percentage";
  is_default: boolean;
}

export default function CancellationPoliciesPage() {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CancellationPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: CancellationPolicy[] }>(
        "/api/provider/cancellation-policies"
      );
      setPolicies(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.cancellation-policies.failedToLoadCancellationPolicies");
      setError(errorMessage);
      console.error("Error loading policies:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (policy: CancellationPolicy) => {
    try {
      setIsSaving(true);
      
      // Validate policy
      if (!policy.name?.trim()) {
        toast.error(t("web.provider.settings.pages.cancellation-policies.policyNameIsRequired"));
        return;
      }
      
      if (policy.hours_before < 0) {
        toast.error(t("web.provider.settings.pages.cancellation-policies.hoursBeforeMustBe0Or"));
        return;
      }
      
      if (policy.refund_percentage < 0 || policy.refund_percentage > 100) {
        toast.error(t("web.provider.settings.pages.cancellation-policies.refundPercentageMustBeBetween0"));
        return;
      }

      if (policy.fee_amount != null && policy.fee_amount < 0) {
        toast.error(t("web.provider.settings.pages.cancellation-policies.feeAmountMustBe0Or"));
        return;
      }

      if (
        policy.fee_type === "percentage" &&
        policy.fee_amount != null &&
        policy.fee_amount > 100
      ) {
        toast.error(t("web.provider.settings.pages.cancellation-policies.percentageFeeCannotExceed100"));
        return;
      }

      if (policy.id) {
        await fetcher.patch(`/api/provider/cancellation-policies/${policy.id}`, policy);
        toast.success(t("web.provider.settings.pages.cancellation-policies.cancellationPolicyUpdatedSuccessfully"));
      } else {
        await fetcher.post("/api/provider/cancellation-policies", policy);
        toast.success(t("web.provider.settings.pages.cancellation-policies.cancellationPolicyCreatedSuccessfully"));
      }
      setShowDialog(false);
      setEditingPolicy(null);
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.cancellation-policies.failedToSave");
      toast.error(errorMessage);
      console.error("Error saving policy:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.cancellation-policies.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/cancellation-policies/${id}`);
      toast.success(t("web.provider.settings.pages.cancellation-policies.cancellationPolicyDeletedSuccessfully"));
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.cancellation-policies.failedToDelete");
      toast.error(errorMessage);
      console.error("Error deleting policy:", error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetcher.patch(`/api/provider/cancellation-policies/${id}/set-default`);
      toast.success(t("web.provider.settings.pages.cancellation-policies.defaultPolicyUpdatedSuccessfully"));
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.cancellation-policies.failedToSetDefault");
      toast.error(errorMessage);
      console.error("Error setting default:", error);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.cancellation-policies.cancellationPolicies") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.cancellation-policies.loadingCancellationPolicies")} />
      </SettingsDetailLayout>
    );
  }

  if (error && policies.length === 0) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyState
          title={t("web.provider.settings.categories.clients.items.cancellationPolicies.title")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadPolicies,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title={t("web.provider.settings.categories.clients.items.cancellationPolicies.title")}
        subtitle={t("web.provider.settings.categories.clients.items.cancellationPolicies.description")}
        primaryAction={{
          label: t("web.provider.settings.pages.cancellation-policies.addPolicy"),
          onClick: () => {
            setEditingPolicy(null);
            setShowDialog(true);
          },
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium mb-1">{t("web.provider.settings.pages.cancellation-policies.howTitle")}</p>
            <p className="text-xs text-blue-700">{t("web.provider.settings.pages.cancellation-policies.howBody")}</p>
          </div>
        </div>
      </div>

      {policies.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">{t("web.provider.settings.pages.cancellation-policies.empty")}</p>
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.cancellation-policies.createFirst")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div key={policy.id} className="bg-white border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{policy.name}</h3>
                    {policy.is_default && (
                      <span className="text-xs bg-primary text-white px-2 py-1 rounded">
                        {t("web.provider.common.default")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {t("web.provider.settings.pages.cancellation-policies.moreThanHours", { hours: policy.hours_before })}{" "}
                    <strong>{t("web.provider.settings.pages.cancellation-policies.fullRefund")}</strong> {t("web.provider.settings.pages.cancellation-policies.toWallet")}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {t("web.provider.settings.pages.cancellation-policies.withinHours", { hours: policy.hours_before })}{" "}
                    <strong>{t("web.provider.settings.pages.cancellation-policies.lateRefund", { pct: policy.refund_percentage })}</strong> {t("web.provider.settings.pages.cancellation-policies.ofAmountsPaid")}
                  </p>
                  {policy.refund_percentage === 0 && policy.fee_amount && policy.fee_amount > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      {t("web.provider.settings.pages.cancellation-policies.lateFee")}{" "}
                      {policy.fee_type === "percentage"
                        ? `${policy.fee_amount}%`
                        : formatCurrency(policy.fee_amount ?? 0, tenantCurrency)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!policy.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(policy.id!)}
                    >
                      {t("web.provider.common.setDefault")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPolicy(policy);
                      setShowDialog(true);
                    }}
                  >
                    {t("web.provider.common.edit")}
                  </Button>
                  {!policy.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(policy.id!)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PolicyDialog
        open={showDialog}
        onClose={() => {
          setShowDialog(false);
          setEditingPolicy(null);
        }}
        policy={editingPolicy}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </SettingsDetailLayout>
  );
}

function PolicyDialog({
  open,
  onClose,
  policy,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  policy: CancellationPolicy | null;
  onSave: (policy: CancellationPolicy) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CancellationPolicy>({
    name: "",
    hours_before: 24,
    refund_percentage: 0,
    fee_amount: 0,
    fee_type: "fixed",
    is_default: false,
  });

  useEffect(() => {
    queueMicrotask(() => {
      if (policy) {
        setFormData(policy);
      } else {
        setFormData({
          name: "",
          hours_before: 24,
          refund_percentage: 0,
          fee_amount: 0,
          fee_type: "fixed",
          is_default: false,
        });
      }
    });
  }, [policy, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name.trim()) {
      toast.error(t("web.provider.settings.pages.cancellation-policies.policyNameIsRequired"));
      return;
    }
    
    if (formData.hours_before < 0) {
      toast.error(t("web.provider.settings.pages.cancellation-policies.hoursBeforeMustBe0Or"));
      return;
    }
    
    if (formData.refund_percentage < 0 || formData.refund_percentage > 100) {
      toast.error(t("web.provider.settings.pages.cancellation-policies.refundPercentageMustBeBetween0"));
      return;
    }
    
    if (formData.fee_amount && formData.fee_amount < 0) {
      toast.error(t("web.provider.settings.pages.cancellation-policies.feeAmountMustBe0Or"));
      return;
    }

    if (
      formData.fee_type === "percentage" &&
      formData.fee_amount != null &&
      formData.fee_amount > 100
    ) {
      toast.error(t("web.provider.settings.pages.cancellation-policies.percentageFeeCannotExceed100"));
      return;
    }

    onSave({
      ...formData,
      id: policy?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{policy ? t("web.provider.settings.pages.cancellation-policies.editPolicy") : t("web.provider.settings.pages.cancellation-policies.createPolicy")}</DialogTitle>
          <DialogDescription>
{t("web.provider.settings.pages.cancellation-policies.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("web.provider.settings.pages.cancellation-policies.policyNameLabel")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("web.provider.settings.pages.cancellation-policies.eGFlexibleModerateStrict")}
              required
            />
          </div>

          <div>
            <Label htmlFor="hours_before">{t("web.provider.settings.pages.cancellation-policies.hoursBeforeLabel")}</Label>
            <Input
              id="hours_before"
              type="number"
              min="0"
              value={formData.hours_before}
              onChange={(e) =>
                setFormData({ ...formData, hours_before: parseInt(e.target.value) || 0 })
              }
              required
            />
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.cancellation-policies.hoursBeforeHint")}</p>
          </div>

          <div>
            <Label htmlFor="refund_percentage">{t("web.provider.settings.pages.cancellation-policies.refundPercentageLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="refund_percentage"
                type="number"
                min="0"
                max="100"
                value={formData.refund_percentage}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    refund_percentage: parseInt(e.target.value) || 0,
                  })
                }
                required
              />
              <span className="text-sm text-gray-600">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.cancellation-policies.refundPercentageHint")}</p>
          </div>

          <div>
            <Label htmlFor="fee_type">{t("web.provider.settings.pages.cancellation-policies.feeTypeLabel")}</Label>
            <Select
              value={formData.fee_type}
              onValueChange={(value: "fixed" | "percentage") =>
                setFormData({ ...formData, fee_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t("web.provider.settings.pages.cancellation-policies.fixedAmount")}</SelectItem>
                <SelectItem value="percentage">{t("web.provider.settings.pages.cancellation-policies.percentage")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.fee_type && (
            <div>
              <Label htmlFor="fee_amount">{t("web.provider.settings.pages.cancellation-policies.feeAmountLabel")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fee_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.fee_amount || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fee_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <span className="text-sm text-gray-600">
                  {formData.fee_type === "percentage" ? "%" : LAST_RESORT_CURRENCY}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.cancellation-policies.feeAmountHint")}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save className="w-4 h-4 me-2" />
              {isSaving ? t("web.provider.common.saving") : policy ? t("web.provider.settings.pages.cancellation-policies.updatePolicy") : t("web.provider.settings.pages.cancellation-policies.createPolicySubmit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
