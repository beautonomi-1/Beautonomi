"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, CreditCard, Gift, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";

// Complex feature gating structure matching migration 133
interface FeatureGating {
  marketing_campaigns?: {
    enabled: boolean;
    channels?: string[];
    max_campaigns_per_month?: number | null;
    max_recipients_per_campaign?: number | null;
    advanced_segmentation?: boolean;
    custom_integrations?: boolean;
  };
  chat_messages?: {
    enabled: boolean;
    max_messages_per_month?: number | null;
    file_attachments?: boolean;
    group_chats?: boolean;
  };
  yoco_integration?: {
    enabled: boolean;
    max_devices?: number | null;
    advanced_features?: boolean;
  };
  staff_management?: {
    enabled: boolean;
    max_staff_members?: number | null;
  };
  multi_location?: {
    enabled: boolean;
    max_locations?: number | null;
  };
  booking_limits?: {
    enabled: boolean;
    max_bookings_per_month?: number | null;
  };
  advanced_analytics?: {
    enabled: boolean;
    basic_reports?: boolean;
    advanced_reports?: boolean;
    data_export?: boolean;
    api_access?: boolean;
    report_types?: string[];
  };
  marketing_automations?: {
    enabled: boolean;
    max_automations?: number | null;
  };
  recurring_appointments?: {
    enabled: boolean;
    advanced_patterns?: boolean;
  };
  express_booking?: {
    enabled: boolean;
    max_links?: number | null;
  };
  calendar_sync?: {
    enabled: boolean;
    providers?: string[];
    api_access?: boolean;
  };
}

interface PricingPlanLink {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  display_order: number;
  subscription_plan_id: string | null;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_monthly?: number;
  price_yearly?: number;
  currency: string;
  features: FeatureGating | string[] | null; // Support both complex and legacy
  is_free: boolean;
  is_active: boolean;
  is_popular: boolean;
  display_order: number;
  max_bookings_per_month?: number | null;
  max_staff_members?: number | null;
  max_locations: number;
  paystack_plan_code_monthly?: string;
  paystack_plan_code_yearly?: string;
  created_at: string;
  updated_at: string;
  pricing_plan?: PricingPlanLink | null;
}

// Default feature structure
const getDefaultFeatures = (): FeatureGating => ({
  marketing_campaigns: {
    enabled: false,
    channels: [],
    max_campaigns_per_month: null,
    max_recipients_per_campaign: null,
    advanced_segmentation: false,
    custom_integrations: false,
  },
  chat_messages: {
    enabled: true,
    max_messages_per_month: 50,
    file_attachments: false,
    group_chats: false,
  },
  yoco_integration: {
    enabled: false,
    max_devices: 0,
    advanced_features: false,
  },
  staff_management: {
    enabled: false,
    max_staff_members: 0,
  },
  multi_location: {
    enabled: true,
    max_locations: 1,
  },
  booking_limits: {
    enabled: true,
    max_bookings_per_month: 10,
  },
  advanced_analytics: {
    enabled: false,
    basic_reports: false,
    advanced_reports: false,
    data_export: false,
    api_access: false,
    report_types: [],
  },
  marketing_automations: {
    enabled: false,
    max_automations: 0,
  },
  recurring_appointments: {
    enabled: false,
    advanced_patterns: false,
  },
  express_booking: {
    enabled: false,
    max_links: 0,
  },
  calendar_sync: {
    enabled: false,
    providers: [],
    api_access: false,
  },
});

// Available channels and providers
const MARKETING_CHANNELS = ["email", "sms", "whatsapp"];
const CALENDAR_PROVIDERS = ["google", "outlook", "ical"];
const REPORT_TYPES = ["sales", "bookings", "staff", "clients", "products", "payments", "gift_cards", "packages"];

type PlansPageProps = { useMergedPlans?: boolean };

export default function SubscriptionPlansPage({ useMergedPlans = false }: PlansPageProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price_monthly: "",
    price_yearly: "",
    currency: "ZAR",
    features: getDefaultFeatures(),
    is_free: false,
    is_active: true,
    is_popular: false,
    display_order: 0,
    max_bookings_per_month: "",
    max_staff_members: "",
    max_locations: "1",
    paystack_plan_code_monthly: "",
    paystack_plan_code_yearly: "",
    // Pricing page (public) - when useMergedPlans
    show_on_pricing_page: false,
    price_display: "",
    period_display: "month",
    description_display: "",
    cta_text: "Get started",
    display_order_pricing: 0,
  });

  // Helper to normalize features from API (handle both legacy array and complex object)
  const normalizeFeatures = (features: any): FeatureGating => {
    if (!features) return getDefaultFeatures();
    if (Array.isArray(features)) return getDefaultFeatures(); // Legacy array format
    if (typeof features === 'object') {
      // Merge with defaults to ensure all fields exist
      const defaults = getDefaultFeatures();
      return {
        ...defaults,
        ...features,
        marketing_campaigns: { ...defaults.marketing_campaigns, ...features.marketing_campaigns },
        chat_messages: { ...defaults.chat_messages, ...features.chat_messages },
        yoco_integration: { ...defaults.yoco_integration, ...features.yoco_integration },
        staff_management: { ...defaults.staff_management, ...features.staff_management },
        multi_location: { ...defaults.multi_location, ...features.multi_location },
        booking_limits: { ...defaults.booking_limits, ...features.booking_limits },
        advanced_analytics: { ...defaults.advanced_analytics, ...features.advanced_analytics },
        marketing_automations: { ...defaults.marketing_automations, ...features.marketing_automations },
        recurring_appointments: { ...defaults.recurring_appointments, ...features.recurring_appointments },
        express_booking: { ...defaults.express_booking, ...features.express_booking },
        calendar_sync: { ...defaults.calendar_sync, ...features.calendar_sync },
      };
    }
    return getDefaultFeatures();
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const url = useMergedPlans ? "/api/admin/plans" : "/api/admin/subscription-plans";
      const response = await fetcher.get<{ data: SubscriptionPlan[] }>(url);
      setPlans(response.data || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
      toast.error("Failed to load subscription plans");
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
      description: "",
      price_monthly: "",
      price_yearly: "",
      currency: "ZAR",
      features: getDefaultFeatures(),
      is_free: false,
      is_active: true,
      is_popular: false,
      display_order: plans.length,
      max_bookings_per_month: "",
      max_staff_members: "",
      max_locations: "1",
      paystack_plan_code_monthly: "",
      paystack_plan_code_yearly: "",
      show_on_pricing_page: false,
      price_display: "",
      period_display: "month",
      description_display: "",
      cta_text: "Get started",
      display_order_pricing: plans.length,
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    const normalizedFeatures = normalizeFeatures(plan.features);
    const pp = plan.pricing_plan;
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price_monthly: plan.price_monthly?.toString() || "",
      price_yearly: plan.price_yearly?.toString() || "",
      currency: plan.currency,
      features: normalizedFeatures,
      is_free: plan.is_free,
      is_active: plan.is_active,
      is_popular: plan.is_popular,
      display_order: plan.display_order,
      max_bookings_per_month: plan.max_bookings_per_month?.toString() || "",
      max_staff_members: plan.max_staff_members?.toString() || "",
      max_locations: plan.max_locations?.toString() || "1",
      paystack_plan_code_monthly: plan.paystack_plan_code_monthly || "",
      paystack_plan_code_yearly: plan.paystack_plan_code_yearly || "",
      show_on_pricing_page: !!pp,
      price_display: pp?.price || "",
      period_display: pp?.period || "month",
      description_display: pp?.description || "",
      cta_text: pp?.cta_text || "Get started",
      display_order_pricing: pp?.display_order ?? plan.display_order,
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...(selectedPlan ? { id: selectedPlan.id } : {}),
        name: formData.name,
        description: formData.description || undefined,
        price_monthly: formData.is_free ? undefined : parseFloat(formData.price_monthly) || undefined,
        price_yearly: formData.is_free ? undefined : parseFloat(formData.price_yearly) || undefined,
        currency: formData.currency,
        features: formData.features,
        is_free: formData.is_free,
        is_active: formData.is_active,
        is_popular: formData.is_popular,
        display_order: formData.display_order,
        max_bookings_per_month: formData.max_bookings_per_month ? parseInt(formData.max_bookings_per_month) : null,
        max_staff_members: formData.max_staff_members ? parseInt(formData.max_staff_members) : null,
        max_locations: parseInt(formData.max_locations) || 1,
        paystack_plan_code_monthly: formData.paystack_plan_code_monthly || null,
        paystack_plan_code_yearly: formData.paystack_plan_code_yearly || null,
      };

      let savedPlan: SubscriptionPlan;
      if (selectedPlan) {
        const res = await fetcher.put<{ data: SubscriptionPlan }>("/api/admin/subscription-plans", payload);
        savedPlan = res.data;
        toast.success("Plan updated successfully");
      } else {
        const res = await fetcher.post<{ data: SubscriptionPlan }>("/api/admin/subscription-plans", payload);
        savedPlan = res.data;
        toast.success("Plan created successfully");
      }

      // When consolidated view: sync pricing page entry so public pricing and onboarding use it
      if (useMergedPlans && formData.show_on_pricing_page && savedPlan?.id) {
        const pricingPayload = {
          ...(selectedPlan?.pricing_plan ? { id: selectedPlan.pricing_plan.id } : {}),
          name: formData.name,
          price: formData.price_display || (savedPlan.price_monthly != null ? String(savedPlan.price_monthly) : "0"),
          period: formData.period_display || null,
          description: formData.description_display || null,
          cta_text: formData.cta_text,
          is_popular: formData.is_popular,
          display_order: formData.display_order_pricing,
          is_active: savedPlan.is_active,
          subscription_plan_id: savedPlan.id,
          paystack_plan_code_monthly: savedPlan.paystack_plan_code_monthly || null,
          paystack_plan_code_yearly: savedPlan.paystack_plan_code_yearly || null,
        };
        if (selectedPlan?.pricing_plan) {
          await fetcher.put("/api/admin/pricing-plans", pricingPayload);
        } else {
          await fetcher.post("/api/admin/pricing-plans", pricingPayload);
        }
      } else if (useMergedPlans && !formData.show_on_pricing_page && selectedPlan?.pricing_plan) {
        // Unlink: deactivate or delete pricing plan so it no longer appears on public page
        await fetcher.put("/api/admin/pricing-plans", {
          id: selectedPlan.pricing_plan.id,
          is_active: false,
          subscription_plan_id: null,
        });
      }

      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      fetchPlans();
    } catch (error) {
      const errorMessage =
        error instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : error instanceof FetchError
          ? error.message
          : "Failed to save plan";
      toast.error(errorMessage);
      console.error("Error saving plan:", error);
    }
  };

  const updateFeature = (category: keyof FeatureGating, updates: any) => {
    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [category]: {
          ...prev.features[category],
          ...updates,
        },
      },
    }));
  };

  const toggleFeatureCategory = (category: keyof FeatureGating) => {
    const current = formData.features[category];
    updateFeature(category, { enabled: !current?.enabled });
  };

  const toggleArrayItem = (category: keyof FeatureGating, field: string, item: string) => {
    const current = formData.features[category] as any;
    const currentArray = (current?.[field] as string[]) || [];
    const newArray = currentArray.includes(item)
      ? currentArray.filter((i) => i !== item)
      : [...currentArray, item];
    updateFeature(category, { [field]: newArray });
  };

  const getFeatureSummary = (plan: SubscriptionPlan): string => {
    const features = normalizeFeatures(plan.features);
    const enabled = Object.values(features).filter((f) => f?.enabled).length;
    const total = Object.keys(features).length;
    return `${enabled}/${total} enabled`;
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <LoadingTimeout loadingMessage={useMergedPlans ? "Loading plans..." : "Loading subscription plans..."} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {useMergedPlans ? "Plans" : "Subscription Plans"}
            </h1>
            <p className="text-gray-600 mt-1">
              {useMergedPlans
                ? "Manage subscription tiers, feature access, and public pricing page in one place"
                : "Manage subscription tiers and feature access with granular controls"}
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Plan
          </Button>
        </div>

        {plans.length === 0 ? (
          <EmptyState
            title={useMergedPlans ? "No plans" : "No subscription plans"}
            description={useMergedPlans ? "Create your first plan to get started" : "Create your first subscription plan to get started"}
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
                  {useMergedPlans && <TableHead>On pricing page</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paystack</TableHead>
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
                    {useMergedPlans && (
                      <TableCell>
                        {plan.pricing_plan ? (
                          <Badge variant="outline" className="bg-green-50 text-green-800">Yes</Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">No</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {plan.is_free ? (
                        <Badge className="bg-green-100 text-green-800">
                          <Gift className="w-3 h-3 mr-1" />
                          Free
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <CreditCard className="w-3 h-3 mr-1" />
                          Paid
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.is_free ? (
                        <span className="text-gray-500">Free</span>
                      ) : (
                        <div className="text-sm">
                          {plan.price_monthly && (
                            <div>
                              {plan.currency} {plan.price_monthly}/mo
                            </div>
                          )}
                          {plan.price_yearly && (
                            <div className="text-gray-500">
                              {plan.currency} {plan.price_yearly}/yr
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {getFeatureSummary(plan)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {plan.max_bookings_per_month
                          ? `${plan.max_bookings_per_month} bookings/mo`
                          : "Unlimited"}
                        <br />
                        {plan.max_staff_members
                          ? `${plan.max_staff_members} staff`
                          : "Unlimited staff"}
                        <br />
                        {plan.max_locations} location{plan.max_locations !== 1 ? "s" : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500">
                        {plan.paystack_plan_code_monthly && (
                          <div>Monthly: {plan.paystack_plan_code_monthly.slice(0, 8)}...</div>
                        )}
                        {plan.paystack_plan_code_yearly && (
                          <div>Yearly: {plan.paystack_plan_code_yearly.slice(0, 8)}...</div>
                        )}
                        {!plan.paystack_plan_code_monthly && !plan.paystack_plan_code_yearly && (
                          <span>Not synced</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
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
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPlan ? (useMergedPlans ? "Edit Plan" : "Edit Subscription Plan") : (useMergedPlans ? "Create Plan" : "Create Subscription Plan")}
              </DialogTitle>
              <DialogDescription>
                {useMergedPlans
                  ? "Configure billing, feature access, and optional public pricing page entry"
                  : "Configure subscription tier with pricing, Paystack integration, and granular feature access"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4 border-b pb-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Plan Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="e.g., Basic, Professional, Enterprise"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
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

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_free"
                    checked={formData.is_free}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_free: checked })
                    }
                  />
                  <Label htmlFor="is_free">Free Tier (no payment required)</Label>
                </div>

                {!formData.is_free && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price_monthly">Monthly Price</Label>
                      <Input
                        id="price_monthly"
                        type="number"
                        step="0.01"
                        value={formData.price_monthly}
                        onChange={(e) =>
                          setFormData({ ...formData, price_monthly: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="price_yearly">Yearly Price</Label>
                      <Input
                        id="price_yearly"
                        type="number"
                        step="0.01"
                        value={formData.price_yearly}
                        onChange={(e) =>
                          setFormData({ ...formData, price_yearly: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="max_bookings">Max Bookings/Month</Label>
                    <Input
                      id="max_bookings"
                      type="number"
                      value={formData.max_bookings_per_month}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_bookings_per_month: e.target.value,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_staff">Max Staff Members</Label>
                    <Input
                      id="max_staff"
                      type="number"
                      value={formData.max_staff_members}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_staff_members: e.target.value,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_locations">Max Locations</Label>
                    <Input
                      id="max_locations"
                      type="number"
                      value={formData.max_locations}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_locations: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-4">
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

                {/* Public pricing page (consolidated Plans only) */}
                {useMergedPlans && (
                  <div className="space-y-4 border-t pt-4 mt-4">
                    <h4 className="font-semibold text-base">Public pricing page</h4>
                    <p className="text-sm text-gray-500">
                      When enabled, this plan appears on the public pricing page and in provider onboarding. Paystack codes are synced from this plan.
                    </p>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="show_on_pricing_page"
                        checked={formData.show_on_pricing_page}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, show_on_pricing_page: checked })
                        }
                      />
                      <Label htmlFor="show_on_pricing_page">Show on public pricing page</Label>
                    </div>
                    {formData.show_on_pricing_page && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="price_display">Price (display text)</Label>
                          <Input
                            id="price_display"
                            value={formData.price_display}
                            onChange={(e) =>
                              setFormData({ ...formData, price_display: e.target.value })
                            }
                            placeholder="e.g. R199 or Free"
                          />
                        </div>
                        <div>
                          <Label htmlFor="period_display">Period (display)</Label>
                          <Input
                            id="period_display"
                            value={formData.period_display}
                            onChange={(e) =>
                              setFormData({ ...formData, period_display: e.target.value })
                            }
                            placeholder="e.g. month, year"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="description_display">Short description (pricing page)</Label>
                          <Textarea
                            id="description_display"
                            value={formData.description_display}
                            onChange={(e) =>
                              setFormData({ ...formData, description_display: e.target.value })
                            }
                            placeholder="Optional"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label htmlFor="cta_text">Button text</Label>
                          <Input
                            id="cta_text"
                            value={formData.cta_text}
                            onChange={(e) =>
                              setFormData({ ...formData, cta_text: e.target.value })
                            }
                            placeholder="Get started"
                          />
                        </div>
                        <div>
                          <Label htmlFor="display_order_pricing">Order on pricing page</Label>
                          <Input
                            id="display_order_pricing"
                            type="number"
                            value={formData.display_order_pricing}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                display_order_pricing: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Paystack Plan Codes */}
                <div className="space-y-4 border-t pt-4 mt-4">
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
              </div>

              {/* Feature Gating */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Feature Gating</h3>
                <div className="space-y-2 border rounded-lg p-4">
                  {/* Marketing Campaigns */}
                  <Collapsible
                    open={expandedFeatures.marketing_campaigns}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, marketing_campaigns: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.marketing_campaigns ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Marketing Campaigns</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.marketing_campaigns?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("marketing_campaigns")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Channels</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {MARKETING_CHANNELS.map((channel) => (
                            <div key={channel} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.marketing_campaigns?.channels?.includes(channel) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("marketing_campaigns", "channels", channel)
                                }
                              />
                              <Label className="text-sm font-normal">{channel}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-sm">Max Campaigns/Month</Label>
                          <Input
                            type="number"
                            value={formData.features.marketing_campaigns?.max_campaigns_per_month || ""}
                            onChange={(e) =>
                              updateFeature("marketing_campaigns", {
                                max_campaigns_per_month: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Max Recipients/Campaign</Label>
                          <Input
                            type="number"
                            value={formData.features.marketing_campaigns?.max_recipients_per_campaign || ""}
                            onChange={(e) =>
                              updateFeature("marketing_campaigns", {
                                max_recipients_per_campaign: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Unlimited"
                          />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.marketing_campaigns?.advanced_segmentation || false}
                          onCheckedChange={(checked) =>
                            updateFeature("marketing_campaigns", { advanced_segmentation: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Segmentation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.marketing_campaigns?.custom_integrations || false}
                          onCheckedChange={(checked) =>
                            updateFeature("marketing_campaigns", { custom_integrations: checked })
                          }
                        />
                        <Label className="text-sm">Custom Integrations</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Chat Messages */}
                  <Collapsible
                    open={expandedFeatures.chat_messages}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, chat_messages: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.chat_messages ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Chat Messages</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.chat_messages?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("chat_messages")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Max Messages/Month</Label>
                        <Input
                          type="number"
                          value={formData.features.chat_messages?.max_messages_per_month || ""}
                          onChange={(e) =>
                            updateFeature("chat_messages", {
                              max_messages_per_month: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.chat_messages?.file_attachments || false}
                          onCheckedChange={(checked) =>
                            updateFeature("chat_messages", { file_attachments: checked })
                          }
                        />
                        <Label className="text-sm">File Attachments</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.chat_messages?.group_chats || false}
                          onCheckedChange={(checked) =>
                            updateFeature("chat_messages", { group_chats: checked })
                          }
                        />
                        <Label className="text-sm">Group Chats</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Yoco Integration */}
                  <Collapsible
                    open={expandedFeatures.yoco_integration}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, yoco_integration: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.yoco_integration ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Yoco Integration</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.yoco_integration?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("yoco_integration")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Max Devices</Label>
                        <Input
                          type="number"
                          value={formData.features.yoco_integration?.max_devices || ""}
                          onChange={(e) =>
                            updateFeature("yoco_integration", {
                              max_devices: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.yoco_integration?.advanced_features || false}
                          onCheckedChange={(checked) =>
                            updateFeature("yoco_integration", { advanced_features: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Features</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Staff Management */}
                  <Collapsible
                    open={expandedFeatures.staff_management}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, staff_management: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.staff_management ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Staff Management</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.staff_management?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("staff_management")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Staff Members</Label>
                        <Input
                          type="number"
                          value={formData.features.staff_management?.max_staff_members || ""}
                          onChange={(e) =>
                            updateFeature("staff_management", {
                              max_staff_members: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Multi Location */}
                  <Collapsible
                    open={expandedFeatures.multi_location}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, multi_location: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.multi_location ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Multi Location</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.multi_location?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("multi_location")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Locations</Label>
                        <Input
                          type="number"
                          value={formData.features.multi_location?.max_locations || ""}
                          onChange={(e) =>
                            updateFeature("multi_location", {
                              max_locations: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Booking Limits */}
                  <Collapsible
                    open={expandedFeatures.booking_limits}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, booking_limits: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.booking_limits ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Booking Limits</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.booking_limits?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("booking_limits")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Bookings/Month</Label>
                        <Input
                          type="number"
                          value={formData.features.booking_limits?.max_bookings_per_month || ""}
                          onChange={(e) =>
                            updateFeature("booking_limits", {
                              max_bookings_per_month: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Advanced Analytics */}
                  <Collapsible
                    open={expandedFeatures.advanced_analytics}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, advanced_analytics: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.advanced_analytics ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Advanced Analytics</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.advanced_analytics?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("advanced_analytics")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.basic_reports || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { basic_reports: checked })
                          }
                        />
                        <Label className="text-sm">Basic Reports</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.advanced_reports || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { advanced_reports: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Reports</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.data_export || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { data_export: checked })
                          }
                        />
                        <Label className="text-sm">Data Export</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.api_access || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { api_access: checked })
                          }
                        />
                        <Label className="text-sm">API Access</Label>
                      </div>
                      <div>
                        <Label className="text-sm">Report Types</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {REPORT_TYPES.map((type) => (
                            <div key={type} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.advanced_analytics?.report_types?.includes(type) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("advanced_analytics", "report_types", type)
                                }
                              />
                              <Label className="text-sm font-normal">{type}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Marketing Automations */}
                  <Collapsible
                    open={expandedFeatures.marketing_automations}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, marketing_automations: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.marketing_automations ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Marketing Automations</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.marketing_automations?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("marketing_automations")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Automations</Label>
                        <Input
                          type="number"
                          value={formData.features.marketing_automations?.max_automations || ""}
                          onChange={(e) =>
                            updateFeature("marketing_automations", {
                              max_automations: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Recurring Appointments */}
                  <Collapsible
                    open={expandedFeatures.recurring_appointments}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, recurring_appointments: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.recurring_appointments ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Recurring Appointments</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.recurring_appointments?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("recurring_appointments")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.recurring_appointments?.advanced_patterns || false}
                          onCheckedChange={(checked) =>
                            updateFeature("recurring_appointments", { advanced_patterns: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Patterns</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Express Booking */}
                  <Collapsible
                    open={expandedFeatures.express_booking}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, express_booking: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.express_booking ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Express Booking</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.express_booking?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("express_booking")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Links</Label>
                        <Input
                          type="number"
                          value={formData.features.express_booking?.max_links || ""}
                          onChange={(e) =>
                            updateFeature("express_booking", {
                              max_links: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Calendar Sync */}
                  <Collapsible
                    open={expandedFeatures.calendar_sync}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, calendar_sync: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.calendar_sync ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Calendar Sync</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.calendar_sync?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("calendar_sync")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Providers</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {CALENDAR_PROVIDERS.map((provider) => (
                            <div key={provider} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.calendar_sync?.providers?.includes(provider) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("calendar_sync", "providers", provider)
                                }
                              />
                              <Label className="text-sm font-normal">{provider}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.calendar_sync?.api_access || false}
                          onCheckedChange={(checked) =>
                            updateFeature("calendar_sync", { api_access: checked })
                          }
                        />
                        <Label className="text-sm">API Access</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
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
