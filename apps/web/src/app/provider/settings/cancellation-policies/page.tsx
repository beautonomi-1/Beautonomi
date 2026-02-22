"use client";

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
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load cancellation policies";
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
        toast.error("Policy name is required");
        return;
      }
      
      if (policy.hours_before < 0) {
        toast.error("Hours before must be 0 or greater");
        return;
      }
      
      if (policy.refund_percentage < 0 || policy.refund_percentage > 100) {
        toast.error("Refund percentage must be between 0 and 100");
        return;
      }

      if (policy.id) {
        await fetcher.patch(`/api/provider/cancellation-policies/${policy.id}`, policy);
        toast.success("Cancellation policy updated successfully");
      } else {
        await fetcher.post("/api/provider/cancellation-policies", policy);
        toast.success("Cancellation policy created successfully");
      }
      setShowDialog(false);
      setEditingPolicy(null);
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save cancellation policy";
      toast.error(errorMessage);
      console.error("Error saving policy:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this cancellation policy? This action cannot be undone.")) return;

    try {
      await fetcher.delete(`/api/provider/cancellation-policies/${id}`);
      toast.success("Cancellation policy deleted successfully");
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to delete cancellation policy";
      toast.error(errorMessage);
      console.error("Error deleting policy:", error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetcher.patch(`/api/provider/cancellation-policies/${id}/set-default`);
      toast.success("Default policy updated successfully");
      await loadPolicies();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to set default policy";
      toast.error(errorMessage);
      console.error("Error setting default:", error);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Cancellation Policies" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage="Loading cancellation policies..." />
      </SettingsDetailLayout>
    );
  }

  if (error && policies.length === 0) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyState
          title="Failed to load cancellation policies"
          description={error}
          action={{
            label: "Retry",
            onClick: loadPolicies,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title="Cancellation Policies"
        subtitle="Configure cancellation policies and fees for your bookings"
        primaryAction={{
          label: "Add Policy",
          onClick: () => {
            setEditingPolicy(null);
            setShowDialog(true);
          },
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium mb-1">How Cancellation Policies Work</p>
            <p className="text-xs text-blue-700">
              Cancellation policies determine refund amounts based on when a customer cancels. 
              You can set different policies for different time periods before the appointment. 
              One policy can be set as the default for all bookings.
            </p>
          </div>
        </div>
      </div>

      {policies.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">No cancellation policies configured</p>
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Policy
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
                      <span className="text-xs bg-[#FF0077] text-white px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    If cancelled {policy.hours_before} hours or more before appointment:{" "}
                    <strong>{policy.refund_percentage}% refund</strong>
                  </p>
                  {policy.fee_amount && policy.fee_amount > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      Cancellation fee: {policy.fee_type === "percentage" ? `${policy.fee_amount}%` : `ZAR ${policy.fee_amount}`}
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
                      Set Default
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
                    Edit
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
  const [formData, setFormData] = useState<CancellationPolicy>({
    name: "",
    hours_before: 24,
    refund_percentage: 100,
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
          refund_percentage: 100,
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
      toast.error("Policy name is required");
      return;
    }
    
    if (formData.hours_before < 0) {
      toast.error("Hours before must be 0 or greater");
      return;
    }
    
    if (formData.refund_percentage < 0 || formData.refund_percentage > 100) {
      toast.error("Refund percentage must be between 0 and 100");
      return;
    }
    
    if (formData.fee_amount && formData.fee_amount < 0) {
      toast.error("Fee amount must be 0 or greater");
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
          <DialogTitle>{policy ? "Edit Policy" : "Create Cancellation Policy"}</DialogTitle>
          <DialogDescription>
            Configure when customers can cancel and what refund they receive
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Policy Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Flexible, Moderate, Strict"
              required
            />
          </div>

          <div>
            <Label htmlFor="hours_before">Hours Before Appointment *</Label>
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
            <p className="text-xs text-gray-500 mt-1">
              Minimum hours before appointment that this policy applies
            </p>
          </div>

          <div>
            <Label htmlFor="refund_percentage">Refund Percentage *</Label>
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
          </div>

          <div>
            <Label htmlFor="fee_type">Cancellation Fee Type</Label>
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
                <SelectItem value="fixed">Fixed Amount</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.fee_type && (
            <div>
              <Label htmlFor="fee_amount">Cancellation Fee Amount</Label>
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
                  {formData.fee_type === "percentage" ? "%" : "ZAR"}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : policy ? "Update" : "Create"} Policy
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
