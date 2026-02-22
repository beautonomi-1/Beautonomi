"use client";

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

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: { plans: MembershipPlan[] } }>(`/api/provider/membership-plans`);
      setPlans(res.data.plans || []);
    } catch (error: any) {
      console.error("Error loading membership plans:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load membership plans";
      toast.error(errorMessage);
      setPlans([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

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
    if (!confirm("Are you sure you want to delete this membership plan? This action cannot be undone.")) return;

    try {
      await fetcher.delete(`/api/provider/membership-plans/${id}`);
      toast.success("Membership plan deleted successfully");
      await loadPlans();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to delete membership plan";
      toast.error(errorMessage);
      console.error("Error deleting membership plan:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Plan name is required");
        return;
      }

      const priceNum = Number(formData.price_monthly);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        toast.error("Please enter a valid price (0 or greater)");
        return;
      }

      const discountNum = formData.discount_percent ? Number(formData.discount_percent) : 0;
      if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
        toast.error("Discount must be between 0 and 100");
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
        toast.success("Membership plan updated successfully");
      } else {
        await fetcher.post(`/api/provider/membership-plans`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          price_monthly: priceNum,
          discount_percent: discountNum,
          is_active: formData.is_active,
        });
        toast.success("Membership plan created successfully");
      }

      setIsDialogOpen(false);
      await loadPlans();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save membership plan";
      toast.error(errorMessage);
      console.error("Error saving membership plan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <SettingsDetailLayout
      title="Memberships"
      subtitle="Set up membership plans for your clients"
      onSave={() => loadPlans()}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Memberships" },
      ]}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              Create membership plans that offer recurring services and discounts to your clients
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Plan
          </Button>
        </div>

        {isLoading ? (
          <SectionCard>
            <LoadingTimeout loadingMessage="Loading membership plans..." />
          </SectionCard>
        ) : plans.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title="No membership plans yet"
              description="Create membership plans to offer recurring services and discounts to your clients"
              action={{
                label: "Add Plan",
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
                        {formatCurrency(plan.price_monthly, plan.currency)}/month
                      </p>
                      {plan.discount_percent > 0 && (
                        <p className="text-sm text-gray-600">
                          {plan.discount_percent}% discount on services
                        </p>
                      )}
                    </div>
                    <Badge
                      className={plan.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
                      {plan.is_active ? "Active" : "Inactive"}
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
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                    className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
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
              {editingPlan ? "Edit Membership Plan" : "Add Membership Plan"}
            </DialogTitle>
            <DialogDescription>
              {editingPlan
                ? "Update membership plan information"
                : "Create a new membership plan for your clients"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Plan Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Premium Membership"
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description of the plan benefits"
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="price_monthly">Monthly Price *</Label>
              <Input
                id="price_monthly"
                type="number"
                step="0.01"
                min="0"
                value={formData.price_monthly}
                onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                placeholder="0.00"
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="discount_percent">Discount Percentage</Label>
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
              <p className="text-xs text-gray-500 mt-1">Discount percentage (0-100) applied to services</p>
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
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {isSubmitting ? "Saving..." : editingPlan ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
