"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TaxRate {
  id: string;
  code: string;
  name: string;
  description: string;
  display_order: number;
  metadata: {
    rate: number;
    included: boolean;
  };
}

interface ProviderTaxRate {
  provider_id: string;
  provider_name: string;
  tax_rate_percent: number;
}

interface TaxStatistics {
  total_tax_collected: number;
  total_revenue: number;
  tax_percentage: number;
  total_bookings: number;
}

export default function AdminTaxes() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [_providerTaxRates, setProviderTaxRates] = useState<ProviderTaxRate[]>([]);
  void _providerTaxRates;
  const [statistics, setStatistics] = useState<TaxStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    rate: 0,
    included: false,
    display_order: 999,
  });

  useEffect(() => {
    loadTaxData();
  }, []);

  const loadTaxData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{
        tax_rates: TaxRate[];
        provider_tax_rate: ProviderTaxRate | null;
        statistics: TaxStatistics;
      }>("/api/admin/taxes");

      setTaxRates(response.tax_rates || []);
      if (response.provider_tax_rate) {
        setProviderTaxRates([response.provider_tax_rate]);
      }
      setStatistics(response.statistics);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load tax data";
      setError(errorMessage);
      console.error("Error loading tax data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRate(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      rate: 0,
      included: false,
      display_order: 999,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setFormData({
      code: rate.code,
      name: rate.name,
      description: rate.description,
      rate: rate.metadata.rate,
      included: rate.metadata.included,
      display_order: rate.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingRate) {
        // Update existing rate
        await fetcher.patch(`/api/admin/taxes/${editingRate.id}`, formData);
        toast.success("Tax rate updated");
      } else {
        // Create new rate
        await fetcher.post("/api/admin/taxes", formData);
        toast.success("Tax rate created");
      }
      setIsDialogOpen(false);
      loadTaxData();
    } catch (error: any) {
      toast.error(error.message || "Failed to save tax rate");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading tax data..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">Tax Management</h1>
          <p className="text-gray-600">Manage tax rates and configurations</p>
        </div>

        {/* Statistics */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Tax Collected</p>
              <p className="text-2xl font-semibold">
                ZAR {statistics.total_tax_collected.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
              <p className="text-2xl font-semibold">
                ZAR {statistics.total_revenue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Tax Percentage</p>
              <p className="text-2xl font-semibold">
                {statistics.tax_percentage.toFixed(2)}%
              </p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Completed Bookings</p>
              <p className="text-2xl font-semibold">{statistics.total_bookings}</p>
            </div>
          </div>
        )}

        {/* Tax Rates */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Tax Rates</h2>
            <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#E6006A]">
              <Plus className="w-4 h-4 mr-2" />
              Add Tax Rate
            </Button>
          </div>

          {error ? (
            <EmptyState
              title="Failed to load tax rates"
              description={error}
              action={{ label: "Retry", onClick: loadTaxData }}
            />
          ) : taxRates.length === 0 ? (
            <EmptyState
              title="No tax rates found"
              description="Create your first tax rate to get started"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.code}</TableCell>
                    <TableCell>{rate.name}</TableCell>
                    <TableCell>{rate.metadata.rate}%</TableCell>
                    <TableCell>
                      <Badge variant={rate.metadata.included ? "default" : "outline"}>
                        {rate.metadata.included ? "Included" : "Excluded"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rate)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingRate ? "Edit Tax Rate" : "Create Tax Rate"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., 15"
                />
              </div>

              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Standard Tax (15%)"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., South African VAT"
                />
              </div>

              <div>
                <Label htmlFor="rate">Rate (%) *</Label>
                <Input
                  id="rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="included"
                  checked={formData.included}
                  onChange={(e) => setFormData({ ...formData, included: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="included">Tax included in price</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-[#FF0077] hover:bg-[#E6006A]">
                {editingRate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
