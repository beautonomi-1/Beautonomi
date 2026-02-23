"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Crown } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Membership {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_period: string;
  features: string[];
  is_active: boolean;
  max_bookings_per_month: number | null;
  max_staff_members: number | null;
  max_locations: number | null;
  created_at: string;
}

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    currency: "ZAR",
    billing_period: "monthly",
    features: [] as string[],
    is_active: true,
    max_bookings_per_month: null as number | null,
    max_staff_members: null as number | null,
    max_locations: null as number | null,
  });
  const [newFeature, setNewFeature] = useState("");

  useEffect(() => {
    loadMemberships();
  }, []);

  const loadMemberships = async () => {
    try {
      setIsLoading(true);
      // Note: This would need a backend API endpoint
      const response = await fetcher.get<{ memberships: Membership[] }>("/api/admin/memberships").catch(() => ({ memberships: [] }));
      setMemberships(response.memberships || []);
    } catch (error) {
      console.error("Failed to load memberships:", error);
      setMemberships([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingMembership(null);
    setFormData({
      name: "",
      description: "",
      price: 0,
      currency: "ZAR",
      billing_period: "monthly",
      features: [],
      is_active: true,
      max_bookings_per_month: null,
      max_staff_members: null,
      max_locations: null,
    });
    setNewFeature("");
    setIsDialogOpen(true);
  };

  const handleEdit = (membership: Membership) => {
    setEditingMembership(membership);
    setFormData({
      name: membership.name,
      description: membership.description || "",
      price: membership.price,
      currency: membership.currency,
      billing_period: membership.billing_period,
      features: membership.features || [],
      is_active: membership.is_active,
      max_bookings_per_month: membership.max_bookings_per_month,
      max_staff_members: membership.max_staff_members,
      max_locations: membership.max_locations,
    });
    setNewFeature("");
    setIsDialogOpen(true);
  };

  const handleAddFeature = () => {
    if (newFeature.trim()) {
      setFormData({
        ...formData,
        features: [...formData.features, newFeature.trim()],
      });
      setNewFeature("");
    }
  };

  const handleRemoveFeature = (index: number) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async () => {
    try {
      if (editingMembership) {
        await fetcher.put(`/api/admin/memberships/${editingMembership.id}`, formData);
        toast.success("Membership updated successfully");
      } else {
        await fetcher.post("/api/admin/memberships", formData);
        toast.success("Membership created successfully");
      }
      setIsDialogOpen(false);
      loadMemberships();
    } catch (error) {
      console.error("Failed to save membership:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save membership");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this membership? This action cannot be undone.")) {
      return;
    }

    try {
      await fetcher.delete(`/api/admin/memberships/${id}`);
      toast.success("Membership deleted successfully");
      loadMemberships();
    } catch (error) {
      console.error("Failed to delete membership:", error);
      toast.error("Failed to delete membership");
    }
  };

  const handleToggleActive = async (membership: Membership) => {
    try {
      await fetcher.patch(`/api/admin/memberships/${membership.id}`, {
        is_active: !membership.is_active,
      });
      toast.success(`Membership ${!membership.is_active ? "activated" : "deactivated"}`);
      loadMemberships();
    } catch (error) {
      console.error("Failed to toggle membership:", error);
      toast.error("Failed to update membership");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading memberships..." />;
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Membership Plans</h1>
            <p className="text-gray-600 mt-1">
              Customer membership products (e.g. Gold, VIP) that customers can subscribe to for benefits and discounts. Not used for provider billing.
            </p>
            <p className="text-sm text-amber-700 mt-2">
              <strong>Different from Provider Subscriptions:</strong> Provider Subscriptions (Plans / Provider Subscriptions) are what <em>providers</em> pay the platform for; limits and feature gating use those. These Memberships are for <em>customers</em> who buy a membership (e.g. loyalty discount).
            </p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Add Membership Plan
          </Button>
        </div>

        {memberships.length === 0 ? (
          <EmptyState
            icon={Crown}
            title="No membership plans yet"
            description="Create customer membership products that customers can subscribe to for benefits and discounts on bookings."
            action={{
              label: "Create Membership Plan",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {memberships.map((membership) => (
              <div
                key={membership.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{membership.name}</h3>
                    <p className="text-2xl font-bold text-[#FF0077] mt-2">
                      {membership.currency} {membership.price.toFixed(2)}
                      <span className="text-sm font-normal text-gray-600">
                        /{membership.billing_period}
                      </span>
                    </p>
                  </div>
                  <Switch
                    checked={membership.is_active}
                    onCheckedChange={() => handleToggleActive(membership)}
                  />
                </div>

                {membership.description && (
                  <p className="text-gray-600 text-sm mb-4">{membership.description}</p>
                )}

                <div className="space-y-2 mb-4">
                  {membership.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                      <div className="w-1.5 h-1.5 bg-[#FF0077] rounded-full" />
                      {feature}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(membership)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(membership.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMembership ? "Edit Membership Plan" : "Create Membership Plan"}
              </DialogTitle>
              <DialogDescription>
                {editingMembership
                  ? "Update the membership plan details"
                  : "Create a new membership plan for providers"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Basic, Pro, Enterprise"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the membership plan"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="billing_period">Billing Period</Label>
                  <Select
                    value={formData.billing_period}
                    onValueChange={(value) => setFormData({ ...formData, billing_period: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="max_bookings">Max Bookings/Month</Label>
                  <Input
                    id="max_bookings"
                    type="number"
                    min="0"
                    value={formData.max_bookings_per_month || ""}
                    onChange={(e) => setFormData({ ...formData, max_bookings_per_month: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="max_staff">Max Staff Members</Label>
                  <Input
                    id="max_staff"
                    type="number"
                    min="0"
                    value={formData.max_staff_members || ""}
                    onChange={(e) => setFormData({ ...formData, max_staff_members: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <Label htmlFor="max_locations">Max Locations</Label>
                  <Input
                    id="max_locations"
                    type="number"
                    min="0"
                    value={formData.max_locations || ""}
                    onChange={(e) => setFormData({ ...formData, max_locations: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div>
                <Label>Features</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Add a feature"
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddFeature();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddFeature} variant="outline">
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm">{feature}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFeature(index)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.name || formData.price < 0}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {editingMembership ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
