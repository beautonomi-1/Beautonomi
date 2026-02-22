"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Settings,
  Edit,
  CheckCircle,
  XCircle,
  Plus,
  Info,
} from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface FeeConfig {
  id: string;
  gateway_name: string;
  fee_type: "percentage" | "fixed" | "tiered";
  fee_percentage: number;
  fee_fixed_amount: number;
  fee_tiered_config: any;
  currency: string;
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  description: string | null;
}

interface FeeAdjustment {
  id: string;
  payment_transaction_id: string | null;
  finance_transaction_id: string | null;
  original_fee_amount: number;
  adjusted_fee_amount: number;
  adjustment_reason: string;
  adjustment_type: string;
  notes: string | null;
  reconciled: boolean;
  created_at: string;
  payment_transaction?: {
    id: string;
    reference: string;
    amount: number;
    fees: number;
    provider: string;
  };
  finance_transaction?: {
    id: string;
    transaction_type: string;
    amount: number;
    fees: number;
  };
}

interface Reconciliation {
  id: string;
  reconciliation_date: string;
  gateway_name: string;
  expected_fees: number;
  actual_fees: number;
  variance: number;
  status: "pending" | "reviewed" | "resolved" | "disputed";
  notes: string | null;
  statement_reference: string | null;
  created_at: string;
}

export default function AdminFees() {
  const [activeTab, setActiveTab] = useState("configs");

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-start gap-2 mb-2">
            <h1 className="text-2xl sm:text-3xl font-semibold">Fee Management</h1>
            <Popover>
              <PopoverTrigger asChild>
                <button className="mt-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <Info className="w-5 h-5" />
                </button>
              </PopoverTrigger>
          <PopoverContent className="w-80 sm:w-96 max-h-[80vh] overflow-y-auto">
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">About Fee Management</h3>
                <p className="text-xs text-gray-600">
                  This section helps you manage payment gateway fees across your platform. Payment gateways 
                  (like Paystack, Stripe, etc.) charge fees on each transaction. This system helps you:
                </p>
                <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 mt-2">
                  <li><strong>Configure</strong> expected fee rates for each gateway</li>
                  <li><strong>Adjust</strong> fees when discrepancies occur</li>
                  <li><strong>Reconcile</strong> expected vs actual fees from gateway statements</li>
                </ul>
                
                <div className="border-t pt-2 mt-2">
                  <h4 className="font-medium text-xs mb-1">How Fees Affect Revenue:</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p><strong>Gross Revenue:</strong> Total amount customers pay</p>
                    <p><strong>Gateway Fees:</strong> Deducted from platform revenue (not provider earnings)</p>
                    <p><strong>Net Revenue:</strong> Gross - Gateway Fees</p>
                    <p><strong>Platform Take:</strong> Commission - Gateway Fees</p>
                    <p className="text-gray-500 italic mt-1">
                      Gateway fees reduce your platform revenue, not the provider's share. 
                      Accurate fee tracking ensures correct revenue calculations.
                    </p>
                  </div>
                </div>
              </div>
            </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            Configure payment gateway fees, adjust fees, and reconcile fee discrepancies
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 sm:mb-6 flex-wrap">
            <TabsTrigger value="configs" className="text-xs sm:text-sm">
              <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Fee Configurations</span>
              <span className="sm:hidden">Configs</span>
            </TabsTrigger>
            <TabsTrigger value="adjustments" className="text-xs sm:text-sm">
              <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Fee Adjustments</span>
              <span className="sm:hidden">Adjustments</span>
            </TabsTrigger>
            <TabsTrigger value="reconciliations" className="text-xs sm:text-sm">
              <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Reconciliations</span>
              <span className="sm:hidden">Reconcile</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configs">
            <FeeConfigsTab />
          </TabsContent>

          <TabsContent value="adjustments">
            <FeeAdjustmentsTab />
          </TabsContent>

          <TabsContent value="reconciliations">
            <ReconciliationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}

function FeeConfigsTab() {
  const [configs, setConfigs] = useState<FeeConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FeeConfig | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: FeeConfig[] }>(
        "/api/admin/fees/configs?active_only=false"
      );
      setConfigs(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load fee configurations";
      setError(errorMessage);
      console.error("Error loading configs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (configData: Partial<FeeConfig>) => {
    try {
      if (editingConfig) {
        await fetcher.patch("/api/admin/fees/configs", {
          id: editingConfig.id,
          ...configData,
        });
        toast.success("Fee configuration updated");
      } else {
        await fetcher.post("/api/admin/fees/configs", configData);
        toast.success("Fee configuration created");
      }
      setShowModal(false);
      setEditingConfig(null);
      loadConfigs();
    } catch (err) {
      toast.error("Failed to save fee configuration");
      console.error("Error saving config:", err);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading fee configurations..." />;
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load configurations"
        description={error}
        action={{ label: "Retry", onClick: loadConfigs }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Payment Gateway Fee Configurations</h2>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Fee Configurations</h3>
                <p className="text-xs text-gray-600">
                  Configure the expected fee structure for each payment gateway. These configurations 
                  determine how fees are calculated for transactions.
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <strong className="text-xs">Percentage Fees:</strong>
                    <p className="text-xs text-gray-600">
                      Fee is calculated as a percentage of the transaction amount (e.g., 1.5% = 0.015)
                    </p>
                  </div>
                  <div>
                    <strong className="text-xs">Fixed Fees:</strong>
                    <p className="text-xs text-gray-600">
                      A fixed amount charged per transaction regardless of transaction size
                    </p>
                  </div>
                  <div>
                    <strong className="text-xs">Tiered Fees:</strong>
                    <p className="text-xs text-gray-600">
                      Different fee rates based on transaction amount tiers (advanced configuration)
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Tip:</strong> Set effective dates to manage fee changes over time. Only one 
                  active configuration per gateway/currency combination is used at a time.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => {
          setEditingConfig(null);
          setShowModal(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Configuration
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">Quick Guide:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Each gateway can have multiple configurations with different effective dates</li>
              <li>Only one active configuration per gateway/currency is used at a time</li>
              <li>Set "Effective Until" to automatically expire old configurations</li>
              <li>Use descriptions to document why a configuration was created</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Gateway
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600">
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <p className="text-xs text-gray-600">
                          The payment gateway provider (e.g., Paystack, Stripe, Yoco). Each gateway 
                          can have separate fee configurations.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective From</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {configs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No fee configurations found
                  </td>
                </tr>
              ) : (
                configs.map((config) => (
                  <tr key={config.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm font-medium">{config.gateway_name}</td>
                    <td className="px-4 py-4 text-sm capitalize">{config.fee_type}</td>
                    <td className="px-4 py-4 text-sm">
                      {config.fee_type === "percentage"
                        ? `${(config.fee_percentage * 100).toFixed(2)}%`
                        : `ZAR ${config.fee_fixed_amount.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-4 text-sm">{config.currency}</td>
                    <td className="px-4 py-4 text-sm">
                      {config.is_active ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-gray-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {new Date(config.effective_from).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingConfig(config);
                          setShowModal(true);
                        }}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <FeeConfigModal
          config={editingConfig}
          onClose={() => {
            setShowModal(false);
            setEditingConfig(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function FeeConfigModal({
  config,
  onClose,
  onSave,
}: {
  config: FeeConfig | null;
  onClose: () => void;
  onSave: (data: Partial<FeeConfig>) => void;
}) {
  const [formData, setFormData] = useState({
    gateway_name: config?.gateway_name || "",
    fee_type: config?.fee_type || "percentage",
    fee_percentage: config?.fee_percentage || 0,
    fee_fixed_amount: config?.fee_fixed_amount || 0,
    currency: config?.currency || "ZAR",
    is_active: config?.is_active !== false,
    effective_from: config?.effective_from
      ? new Date(config.effective_from).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    effective_until: config?.effective_until
      ? new Date(config.effective_until).toISOString().split("T")[0]
      : "",
    description: config?.description || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {config ? "Edit" : "Create"} Fee Configuration
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="gateway_name">Gateway Name *</Label>
              <Input
                id="gateway_name"
                value={formData.gateway_name}
                onChange={(e) =>
                  setFormData({ ...formData, gateway_name: e.target.value })
                }
                required
                placeholder="paystack, stripe, yoco"
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="fee_type">Fee Type *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="text-gray-400 hover:text-gray-600 transition-colors">
                      <Info className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-xs">Fee Type Options</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>Percentage:</strong> Fee calculated as % of transaction (e.g., 1.5% = 0.015)</p>
                        <p><strong>Fixed:</strong> Same fee amount regardless of transaction size</p>
                        <p><strong>Tiered:</strong> Different rates based on transaction amount ranges</p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <select
                id="fee_type"
                value={formData.fee_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fee_type: e.target.value as "percentage" | "fixed" | "tiered",
                  })
                }
                className="w-full p-2 border rounded-md"
                required
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
                <option value="tiered">Tiered</option>
              </select>
            </div>

            {formData.fee_type === "percentage" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="fee_percentage">Fee Percentage *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600 transition-colors">
                        <Info className="w-3 h-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-xs">Percentage Fee</h4>
                        <p className="text-xs text-gray-600">
                          Enter as a decimal (e.g., 0.015 for 1.5%). The system will calculate the fee 
                          by multiplying this percentage by the transaction amount.
                        </p>
                        <p className="text-xs text-gray-600 mt-2">
                          <strong>Example:</strong> For a 1.5% fee on a R100 transaction, enter 0.015, 
                          which results in a R1.50 fee.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="fee_percentage"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={formData.fee_percentage}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        fee_percentage: parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                  <span className="text-sm text-gray-600">
                    ({(formData.fee_percentage * 100).toFixed(4)}%)
                  </span>
                </div>
              </div>
            )}

            {formData.fee_type === "fixed" && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="fee_fixed_amount">Fixed Fee Amount *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-gray-400 hover:text-gray-600 transition-colors">
                        <Info className="w-3 h-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-xs">Fixed Fee</h4>
                        <p className="text-xs text-gray-600">
                          Enter the exact fee amount that will be charged per transaction, regardless 
                          of the transaction size. This is useful when gateways charge a flat fee.
                        </p>
                        <p className="text-xs text-gray-600 mt-2">
                          <strong>Example:</strong> If the gateway charges R2.50 per transaction, 
                          enter 2.50 here.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  id="fee_fixed_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fee_fixed_amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fee_fixed_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="currency">Currency *</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value.toUpperCase() })
                }
                required
                maxLength={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="w-4 h-4"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="effective_from">Effective From *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="text-gray-400 hover:text-gray-600 transition-colors">
                      <Info className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-xs">Effective Dates</h4>
                      <p className="text-xs text-gray-600">
                        <strong>Effective From:</strong> When this fee configuration starts applying. 
                        Use this to manage fee changes over time.
                      </p>
                      <p className="text-xs text-gray-600">
                        <strong>Effective Until:</strong> When this configuration expires (optional). 
                        Leave empty if it should remain active indefinitely.
                      </p>
                      <p className="text-xs text-gray-600 mt-2">
                        <strong>Tip:</strong> Only one active configuration per gateway/currency is used 
                        at any time. The system automatically selects the most recent active configuration.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Input
                id="effective_from"
                type="date"
                value={formData.effective_from}
                onChange={(e) =>
                  setFormData({ ...formData, effective_from: e.target.value })
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="effective_until">Effective Until (Optional)</Label>
              <Input
                id="effective_until"
                type="date"
                value={formData.effective_until}
                onChange={(e) =>
                  setFormData({ ...formData, effective_until: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full p-2 border rounded-md"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FeeAdjustmentsTab() {
  const [adjustments, setAdjustments] = useState<FeeAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadAdjustments();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps -- load when page changes

  const loadAdjustments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{
        data: FeeAdjustment[];
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/fees/adjustments?page=${page}&limit=${limit}`);
      setAdjustments(response.data || []);
      if (response.meta) {
        setTotal(response.meta.total);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load fee adjustments";
      setError(errorMessage);
      console.error("Error loading adjustments:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading fee adjustments..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Fee Adjustments</h2>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Fee Adjustments</h3>
                <p className="text-xs text-gray-600">
                  Manually adjust fees for specific transactions when the actual gateway fee differs 
                  from the expected fee. This is useful for:
                </p>
                <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 mt-2">
                  <li><strong>Corrections:</strong> Fix errors in fee calculations</li>
                  <li><strong>Waivers:</strong> Remove fees for special cases (refunds, disputes)</li>
                  <li><strong>Increases:</strong> Account for additional charges not in the base rate</li>
                  <li><strong>Reconciliation:</strong> Align with actual gateway statement amounts</li>
                </ul>
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Important:</strong> Adjustments update the transaction fee and net amount 
                  immediately. Always provide a clear reason for audit purposes.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Adjustment
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">When to Create Adjustments:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Gateway charged a different fee than expected</li>
              <li>Special circumstances require fee waiver or modification</li>
              <li>Reconciling with gateway statements shows discrepancies</li>
              <li>Correcting errors in original fee calculations</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original Fee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adjusted Fee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Reconciled
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600">
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <p className="text-xs text-gray-600">
                          Indicates if this adjustment has been verified and reconciled with the 
                          gateway statement. Check this when you've confirmed the adjustment matches 
                          your records.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No fee adjustments found
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm">
                      {new Date(adj.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {adj.payment_transaction?.reference ||
                        adj.finance_transaction?.id ||
                        "N/A"}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      ZAR {adj.original_fee_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium">
                      ZAR {adj.adjusted_fee_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm capitalize">
                      {adj.adjustment_type}
                    </td>
                    <td className="px-4 py-4 text-sm">{adj.adjustment_reason}</td>
                    <td className="px-4 py-4 text-sm">
                      {adj.reconciled ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-400" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={total <= page * limit}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReconciliationsTab() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadReconciliations();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps -- load when page changes

  const loadReconciliations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{
        data: Reconciliation[];
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/fees/reconciliations?page=${page}&limit=${limit}`);
      setReconciliations(response.data || []);
      if (response.meta) {
        setTotal(response.meta.total);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load reconciliations";
      setError(errorMessage);
      console.error("Error loading reconciliations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading reconciliations..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Fee Reconciliations</h2>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Fee Reconciliations</h3>
                <p className="text-xs text-gray-600">
                  Reconcile expected fees (calculated from your configurations) against actual fees 
                  from payment gateway statements. This helps identify discrepancies and ensures 
                  accurate financial reporting.
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <strong className="text-xs">Expected Fees:</strong>
                    <p className="text-xs text-gray-600">
                      Sum of all fees calculated based on your fee configurations for the period
                    </p>
                  </div>
                  <div>
                    <strong className="text-xs">Actual Fees:</strong>
                    <p className="text-xs text-gray-600">
                      Total fees from the payment gateway statement for the same period
                    </p>
                  </div>
                  <div>
                    <strong className="text-xs">Variance:</strong>
                    <p className="text-xs text-gray-600">
                      Difference between actual and expected (positive = you paid more, negative = you paid less)
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <strong>Workflow:</strong> Create a reconciliation record when you receive a gateway 
                  statement. Review variances and mark as resolved once discrepancies are addressed.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Reconciliation
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800">
            <p className="font-medium mb-1">Reconciliation Process:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Download fee statement from your payment gateway</li>
              <li>Calculate expected fees from your configurations for the same period</li>
              <li>Create a reconciliation record with both amounts</li>
              <li>Review variance and create adjustments if needed</li>
              <li>Mark as resolved once discrepancies are addressed</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gateway</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Expected
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600">
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <p className="text-xs text-gray-600">
                          Total fees calculated based on your fee configurations for all transactions 
                          in this period. This is what you expect to pay based on your settings.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Actual
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600">
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <p className="text-xs text-gray-600">
                          Total fees from the payment gateway statement for this period. This is what 
                          the gateway actually charged you.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center gap-1">
                    Variance
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600">
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64">
                        <p className="text-xs text-gray-600">
                          Difference between actual and expected fees. Positive (green) means you paid 
                          more than expected. Negative (red) means you paid less. Zero variance means 
                          perfect alignment.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reconciliations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No reconciliations found
                  </td>
                </tr>
              ) : (
                reconciliations.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm">
                      {new Date(rec.reconciliation_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium">
                      {rec.gateway_name}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      ZAR {rec.expected_fees.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      ZAR {rec.actual_fees.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-4 text-sm font-medium ${
                        rec.variance >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {rec.variance >= 0 ? "+" : ""}
                      {rec.variance.toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          rec.status === "resolved"
                            ? "bg-green-100 text-green-800"
                            : rec.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : rec.status === "disputed"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {rec.statement_reference || "N/A"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-4 py-3 border-t flex justify-between items-center">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={total <= page * limit}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
