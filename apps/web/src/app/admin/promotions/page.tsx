"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Search, Tag, Calendar, Percent } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface Promotion {
  id: string;
  name: string;
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  min_purchase?: number;
  max_discount?: number;
  start_date: string;
  end_date: string;
  usage_limit?: number;
  used_count: number;
  is_active: boolean;
  applicable_to: "all" | "category" | "provider" | "service";
}

export default function AdminPromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Promotion[] }>(
        "/api/admin/promotions"
      );
      setPromotions(response.data);
    } catch (e) {
      const errorMessage =
        e instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : e instanceof FetchError
          ? e.message
          : "Failed to load promotions";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promotion?")) return;

    try {
      await fetcher.delete(`/api/admin/promotions/${id}`);
      toast.success("Promotion deleted");
      loadPromotions();
    } catch {
      toast.error("Failed to delete promotion");
    }
  };

  const filteredPromotions = promotions.filter((promo) =>
    promo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    promo.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading promotions..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Promotions & Discounts</h1>
            <p className="text-gray-600">Manage platform-wide promotions and coupon codes</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Promotion
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search promotions by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Promotions List */}
        {error ? (
          <EmptyState
            title="Failed to load promotions"
            description={error}
            action={{
              label: "Retry",
              onClick: loadPromotions,
            }}
          />
        ) : filteredPromotions.length === 0 ? (
          <EmptyState
            title="No promotions yet"
            description="Create your first promotion or discount code"
            action={{
              label: "Create Promotion",
              onClick: () => setShowAddModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredPromotions.map((promotion) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                onEdit={() => setEditingPromotion(promotion)}
                onDelete={() => handleDelete(promotion.id)}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {(showAddModal || editingPromotion) && (
          <PromotionModal
            promotion={editingPromotion}
            onClose={() => {
              setShowAddModal(false);
              setEditingPromotion(null);
            }}
            onSave={() => {
              setShowAddModal(false);
              setEditingPromotion(null);
              loadPromotions();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function PromotionCard({
  promotion,
  onEdit,
  onDelete,
}: {
  promotion: Promotion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isExpired = new Date(promotion.end_date) < new Date();
  const isActive = promotion.is_active && !isExpired;

  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Tag className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{promotion.name}</h3>
            <p className="text-sm text-gray-600 font-mono">{promotion.code}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-gray-400" />
          <span>
            {promotion.type === "percentage"
              ? `${promotion.value}% off`
              : `${promotion.value} ${promotion.type === "fixed_amount" ? "ZAR" : ""} off`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>
            {new Date(promotion.start_date).toLocaleDateString()} -{" "}
            {new Date(promotion.end_date).toLocaleDateString()}
          </span>
        </div>
        {promotion.usage_limit && (
          <div>
            <span className="text-gray-600">Usage: </span>
            <span>
              {promotion.used_count} / {promotion.usage_limit}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            isActive
              ? "bg-green-100 text-green-800"
              : isExpired
              ? "bg-red-100 text-red-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {isActive ? "Active" : isExpired ? "Expired" : "Inactive"}
        </span>
        <span className="text-xs text-gray-600 capitalize">
          {promotion.applicable_to}
        </span>
      </div>
    </div>
  );
}

function PromotionModal({
  promotion,
  onClose,
  onSave,
}: {
  promotion: Promotion | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: promotion?.name || "",
    code: promotion?.code || "",
    type: promotion?.type || "percentage",
    value: promotion?.value || 0,
    min_purchase: promotion?.min_purchase || 0,
    max_discount: promotion?.max_discount || 0,
    start_date: promotion?.start_date
      ? new Date(promotion.start_date).toISOString().split("T")[0]
      : "",
    end_date: promotion?.end_date
      ? new Date(promotion.end_date).toISOString().split("T")[0]
      : "",
    usage_limit: promotion?.usage_limit || 0,
    is_active: promotion?.is_active ?? true,
    applicable_to: promotion?.applicable_to || "all",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (promotion) {
        await fetcher.patch(`/api/admin/promotions/${promotion.id}`, formData);
      } else {
        await fetcher.post("/api/admin/promotions", formData);
      }
      toast.success(promotion ? "Promotion updated" : "Promotion created");
      onSave();
    } catch {
      toast.error("Failed to save promotion");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {promotion ? "Edit Promotion" : "Create Promotion"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Promotion Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="code">Promo Code *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value.toUpperCase() })
              }
              required
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Discount Type *</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as any })
                }
                className="w-full p-2 border rounded-md"
                required
              >
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed Amount</option>
              </select>
            </div>
            <div>
              <Label htmlFor="value">Discount Value *</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: parseFloat(e.target.value) })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="min_purchase">Minimum Purchase (ZAR)</Label>
              <Input
                id="min_purchase"
                type="number"
                step="0.01"
                value={formData.min_purchase}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    min_purchase: parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="max_discount">Max Discount (ZAR)</Label>
              <Input
                id="max_discount"
                type="number"
                step="0.01"
                value={formData.max_discount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_discount: parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="usage_limit">Usage Limit (0 = unlimited)</Label>
            <Input
              id="usage_limit"
              type="number"
              value={formData.usage_limit}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  usage_limit: parseInt(e.target.value),
                })
              }
            />
          </div>

          <div>
            <Label htmlFor="applicable_to">Applicable To *</Label>
            <select
              id="applicable_to"
              value={formData.applicable_to}
              onChange={(e) =>
                setFormData({ ...formData, applicable_to: e.target.value as any })
              }
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="all">All Services</option>
              <option value="category">Specific Category</option>
              <option value="provider">Specific Provider</option>
              <option value="service">Specific Service</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : promotion ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
