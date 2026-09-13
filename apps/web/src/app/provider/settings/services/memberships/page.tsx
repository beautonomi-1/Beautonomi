"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  currency: string;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function MembershipsSettings() {
  const { t } = useTranslation();
  const locale = useTenantLocaleTag();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price_monthly: "",
    discount_percent: "",
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscribers, setSubscribers] = useState<
    Array<{
      subscription: { id: string; status: string; expires_at: string | null };
      user: { full_name: string | null; email: string | null };
      plan: { name: string };
    }>
  >([]);
  const [extendingId, setExtendingId] = useState<string | null>(null);

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: { plans: MembershipPlan[] } }>(`/api/provider/membership-plans`);
      setPlans(res.data.plans || []);
    } catch (error: any) {
      console.error("Error loading membership plans:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.services/memberships.failedToLoad");
      toast.error(errorMessage);
      setPlans([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSubscribers = async () => {
    try {
      const res = await fetcher.get<{
        data: {
          subscribers: Array<{
            subscription: { id: string; status: string; expires_at: string | null };
            user: { full_name: string | null; email: string | null };
            plan: { name: string };
          }>;
        };
      }>("/api/provider/membership-subscribers?status=all");
      setSubscribers(res.data.subscribers || []);
    } catch {
      setSubscribers([]);
    }
  };

  useEffect(() => {
    void loadPlans();
    void loadSubscribers();
  }, []);

  const extendSubscription = async (id: string) => {
    const daysRaw = window.prompt(t("web.provider.settings.pages.services/memberships.extendPrompt"), "30");
    if (!daysRaw) return;
    const days = Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error(t("web.provider.settings.pages.services/memberships.enterAWholeNumberOfDays"));
      return;
    }
    setExtendingId(id);
    try {
      await fetcher.post(`/api/provider/membership-subscriptions/${id}/extend`, { days });
      toast.success(t("web.provider.settings.pages.services/memberships.extendedBy", { count: days }));
      await loadSubscribers();
    } catch (error) {
      toast.error(error instanceof FetchError ? error.message : t("web.provider.settings.pages.services/memberships.failedToExtend"));
    } finally {
      setExtendingId(null);
    }
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setFormData({
      name: "",
      description: "",
      price_monthly: "",
      discount_percent: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price_monthly: plan.price_monthly.toString(),
      discount_percent: plan.discount_percent.toString(),
      is_active: plan.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.services/memberships.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/membership-plans/${id}`);
      toast.success(t("web.provider.settings.pages.services/memberships.membershipPlanDeletedSuccessfully"));
      await loadPlans();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.services/memberships.failedToDelete");
      toast.error(errorMessage);
      console.error("Error deleting membership plan:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error(t("web.provider.settings.pages.services/memberships.planNameIsRequired"));
        return;
      }

      const priceNum = Number(formData.price_monthly);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        toast.error(t("web.provider.settings.pages.services/memberships.pleaseEnterAValidPrice0"));
        return;
      }

      const discountNum = formData.discount_percent ? Number(formData.discount_percent) : 0;
      if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
        toast.error(t("web.provider.settings.pages.services/memberships.discountMustBeBetween0And"));
        return;
      }

      setIsSubmitting(true);

      if (editingPlan) {
        await fetcher.patch(`/api/provider/membership-plans/${editingPlan.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          price_monthly: priceNum,
          discount_percent: discountNum,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.services/memberships.membershipPlanUpdatedSuccessfully"));
      } else {
        await fetcher.post(`/api/provider/membership-plans`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          price_monthly: priceNum,
          discount_percent: discountNum,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.services/memberships.membershipPlanCreatedSuccessfully"));
      }

      setIsDialogOpen(false);
      await loadPlans();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.services/memberships.failedToSave");
      toast.error(errorMessage);
      console.error("Error saving membership plan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = LAST_RESORT_CURRENCY) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.services.items.memberships.title")}
      subtitle={t("web.provider.settings.categories.services.items.memberships.description")}
      onSave={() => loadPlans()}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.services/memberships.memberships") },
      ]}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              {t("web.provider.settings.pages.services/memberships.createPlansHint")}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.services/memberships.addPlan")}
          </Button>
        </div>

        {isLoading ? (
          <SectionCard>
            <LoadingTimeout loadingMessage={t("web.provider.settings.pages.services/memberships.loadingMembershipPlans")} />
          </SectionCard>
        ) : plans.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.services/memberships.noMembershipPlansYet")}
              description={t("web.provider.settings.pages.services/memberships.emptyDescription")}
              action={{
                label: t("web.provider.settings.pages.services/memberships.addPlan"),
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <SectionCard key={plan.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-sm text-gray-600 mb-2">{plan.description}</p>
                    )}
                    <div className="space-y-1 mb-2">
                      <p className="text-sm font-medium text-gray-900">
                        {t("web.provider.settings.pages.services/memberships.perMonth", { amount: formatCurrency(plan.price_monthly, plan.currency) })}
                      </p>
                      {plan.discount_percent > 0 && (
                        <p className="text-sm text-gray-600">
                          {t("web.provider.settings.pages.services/memberships.discountOnServices", { pct: plan.discount_percent })}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={plan.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
                      {plan.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(plan)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 me-1" />
                    {t("web.provider.common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                    className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Trash2 className="w-3 h-3 me-1" />
                    {t("web.provider.common.delete")}
                  </Button>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">{t("web.provider.settings.pages.services/memberships.subscribers")}</h2>
        {subscribers.length === 0 ? (
          <SectionCard>
            <p className="text-sm text-gray-600">{t("web.provider.settings.pages.services/memberships.noMembersYet")}</p>
          </SectionCard>
        ) : (
          <div className="space-y-2">
            {subscribers.map((row) => (
              <SectionCard key={row.subscription.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {row.user.full_name || row.user.email || t("web.provider.settings.pages.services/memberships.member")}
                    </p>
                    <p className="text-sm text-gray-600">
                      {row.plan.name} · {row.subscription.status}
                      {row.subscription.expires_at
                        ? t("web.provider.settings.pages.services/memberships.expiresOn", { date: new Date(row.subscription.expires_at).toLocaleDateString() })
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={extendingId === row.subscription.id}
                    onClick={() => void extendSubscription(row.subscription.id)}
                  >
                    {extendingId === row.subscription.id ? t("web.provider.settings.pages.services/memberships.extending") : t("web.provider.settings.pages.services/memberships.extendPeriod")}
                  </Button>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? t("web.provider.settings.pages.services/memberships.editPlan") : t("web.provider.settings.pages.services/memberships.addPlanTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingPlan
                ? t("web.provider.settings.pages.services/memberships.updatePlanHint")
                : t("web.provider.settings.pages.services/memberships.createPlanHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">{t("web.provider.settings.pages.services/memberships.planName")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.services/memberships.eGPremiumMembership")}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">{t("web.provider.common.description")}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("web.provider.settings.pages.services/memberships.optionalDescriptionOfThePlanBenefits")}
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="price_monthly">{t("web.provider.settings.pages.services/memberships.monthlyPrice")}</Label>
              <Input
                id="price_monthly"
                type="number"
                step="0.01"
                min="0"
                value={formData.price_monthly}
                onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                placeholder={t("web.provider.settings.pages.services/memberships.n000")}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="discount_percent">{t("web.provider.settings.pages.services/memberships.discountPercentage")}</Label>
              <Input
                id="discount_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.discount_percent}
                onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                placeholder="0"
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
              <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.services/memberships.discountHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                {t("web.provider.common.active")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
            >
              {isSubmitting ? t("web.provider.common.saving") : editingPlan ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
