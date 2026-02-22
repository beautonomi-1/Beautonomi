"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  display_order: number;
  is_active: boolean;
  paystack_plan_code_monthly: string | null;
  paystack_plan_code_yearly: string | null;
  subscription_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
}

export default function PricingPlansPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    price: "",
    period: "",
    description: "",
    cta_text: "Get started",
    is_popular: false,
    display_order: 0,
    is_active: true,
    paystack_plan_code_monthly: "",
    paystack_plan_code_yearly: "",
    subscription_plan_id: "",
  });

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const [plansResponse, subscriptionPlansResponse] = await Promise.all([
        fetcher.get<{ data: PricingPlan[] }>("/api/admin/pricing-plans"),
        fetcher.get<{ data: SubscriptionPlan[] }>("/api/admin/subscription-plans").catch(() => ({ data: [] })),
      ]);
      setPlans(plansResponse.data || []);
      setSubscriptionPlans(subscriptionPlansResponse.data || []);
    } catch {
      toast.error("Failed to load pricing plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleCreate = () => {
    setSelectedPlan(null);
    setFormData({
      name: "",
      price: "",
      period: "",
      description: "",
      cta_text: "Get started",
      is_popular: false,
      display_order: plans.length,
      is_active: true,
      paystack_plan_code_monthly: "",
      paystack_plan_code_yearly: "",
      subscription_plan_id: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (plan: PricingPlan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      price: plan.price,
      period: plan.period || "",
      description: plan.description || "",
      cta_text: plan.cta_text,
      is_popular: plan.is_popular,
      display_order: plan.display_order,
      is_active: plan.is_active,
      paystack_plan_code_monthly: plan.paystack_plan_code_monthly || "",
      paystack_plan_code_yearly: plan.paystack_plan_code_yearly || "",
      subscription_plan_id: plan.subscription_plan_id || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...(selectedPlan ? { id: selectedPlan.id } : {}),
        name: formData.name,
        price: formData.price,
        period: formData.period || null,
        description: formData.description || null,
        cta_text: formData.cta_text,
        is_popular: formData.is_popular,
        display_order: formData.display_order,
        is_active: formData.is_active,
        paystack_plan_code_monthly: formData.paystack_plan_code_monthly || null,
        paystack_plan_code_yearly: formData.paystack_plan_code_yearly || null,
        subscription_plan_id: formData.subscription_plan_id || null,
      };

      if (selectedPlan) {
        await fetcher.put("/api/admin/pricing-plans", payload);
        toast.success("Pricing plan updated successfully");
      } else {
        await fetcher.post("/api/admin/pricing-plans", payload);
        toast.success("Pricing plan created successfully");
      }

      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      fetchPlans();
    } catch (e) {
      const errorMessage =
        e instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : e instanceof FetchError
          ? e.message
          : "Failed to save pricing plan";
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this pricing plan?")) return;

    try {
      // Note: You may want to create a DELETE endpoint
      await fetcher.put("/api/admin/pricing-plans", {
        id: planId,
        is_active: false,
      });
      toast.success("Pricing plan deleted successfully");
      fetchPlans();
    } catch {
      toast.error("Failed to delete pricing plan");
    }
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <LoadingTimeout loadingMessage="Loading pricing plans..." />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pricing Plans</h1>
            <p className="text-gray-600 mt-1">
              Manage pricing plans displayed on the pricing page and link them to Paystack subscriptions
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Plan
          </Button>
        </div>

        {plans.length === 0 ? (
          <EmptyState
            title="No pricing plans"
            description="Create your first pricing plan to get started"
            action={{
              label: "Create Plan",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paystack Codes</TableHead>
                  <TableHead>Linked Plan</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {plan.name}
                        {plan.is_popular && (
                          <Badge variant="secondary" className="bg-pink-100 text-pink-800">
                            Popular
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.price} {plan.period || ""}
                    </TableCell>
                    <TableCell>
                      {plan.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500 space-y-1">
                        {plan.paystack_plan_code_monthly && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            Monthly: {plan.paystack_plan_code_monthly.slice(0, 12)}...
                          </div>
                        )}
                        {plan.paystack_plan_code_yearly && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3" />
                            Yearly: {plan.paystack_plan_code_yearly.slice(0, 12)}...
                          </div>
                        )}
                        {!plan.paystack_plan_code_monthly && !plan.paystack_plan_code_yearly && (
                          <span className="text-gray-400">Not configured</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.subscription_plan_id ? (
                        <Badge variant="outline">Linked</Badge>
                      ) : (
                        <span className="text-gray-400 text-sm">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(plan)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {!plan.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(plan.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={isCreateDialogOpen || isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setIsEditDialogOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPlan ? "Edit Pricing Plan" : "Create Pricing Plan"}
              </DialogTitle>
              <DialogDescription>
                Configure pricing plan for display on the pricing page and link to Paystack subscriptions
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Plan Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="e.g., Starter, Professional, Enterprise"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Price *</Label>
                    <Input
                      id="price"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData({ ...formData, price: e.target.value })
                      }
                      placeholder="e.g., Free, $29, Custom"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="period">Period</Label>
                    <Input
                      id="period"
                      value={formData.period}
                      onChange={(e) =>
                        setFormData({ ...formData, period: e.target.value })
                      }
                      placeholder="e.g., /month, /year, or leave empty"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cta_text">CTA Text</Label>
                    <Input
                      id="cta_text"
                      value={formData.cta_text}
                      onChange={(e) =>
                        setFormData({ ...formData, cta_text: e.target.value })
                      }
                      placeholder="e.g., Get started, Start free trial"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Plan description..."
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="display_order">Display Order</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          display_order: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-4 pt-6">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_active"
                        checked={formData.is_active}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_active: checked })
                        }
                      />
                      <Label htmlFor="is_active">Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_popular"
                        checked={formData.is_popular}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_popular: checked })
                        }
                      />
                      <Label htmlFor="is_popular">Mark as Popular</Label>
                    </div>
                  </div>
                </div>

                {/* Paystack Integration */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-base">Paystack Integration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="paystack_plan_code_monthly">Paystack Plan Code (Monthly)</Label>
                      <Input
                        id="paystack_plan_code_monthly"
                        value={formData.paystack_plan_code_monthly}
                        onChange={(e) =>
                          setFormData({ ...formData, paystack_plan_code_monthly: e.target.value })
                        }
                        placeholder="PLN_xxxxx"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get this from your Paystack dashboard
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="paystack_plan_code_yearly">Paystack Plan Code (Yearly)</Label>
                      <Input
                        id="paystack_plan_code_yearly"
                        value={formData.paystack_plan_code_yearly}
                        onChange={(e) =>
                          setFormData({ ...formData, paystack_plan_code_yearly: e.target.value })
                        }
                        placeholder="PLN_xxxxx"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get this from your Paystack dashboard
                      </p>
                    </div>
                  </div>
                </div>

                {/* Link to Subscription Plan */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-base">Feature Gating Link</h4>
                  <div>
                    <Label htmlFor="subscription_plan_id">Link to Subscription Plan (Optional)</Label>
                    <Select
                      value={formData.subscription_plan_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, subscription_plan_id: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subscription plan for feature gating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None (No feature gating)</SelectItem>
                        {subscriptionPlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Link this pricing plan to a subscription plan for feature gating and limits
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setIsEditDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                {selectedPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
