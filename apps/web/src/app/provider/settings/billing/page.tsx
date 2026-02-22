"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, FileText, Loader2, CreditCard, Trash2, Download, Eye, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AddressForm from "@/components/mapbox/AddressForm";

interface BillingData {
  billingAddress: any;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentMethods: any[];
  invoices: any[];
}

export default function BillingSettings() {
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const [billingForm, setBillingForm] = useState({
    email: "",
    phone: "",
    address: null as any,
  });

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load billing settings, payment methods, and invoices in parallel
      const [billingResponse, paymentMethodsResponse, invoicesResponse] = await Promise.all([
        fetcher.get<{ data: BillingData }>("/api/provider/settings/billing"),
        fetcher.get<{ data: any[] }>("/api/provider/payment-methods").catch(() => ({ data: [] })),
        fetcher.get<{ data: { invoices: any[] } }>("/api/provider/invoices").catch(() => ({ data: { invoices: [] } })),
      ]);

      const billingInfo = billingResponse.data;
      const paymentMethods = paymentMethodsResponse.data || [];
      const invoices = invoicesResponse.data?.invoices || [];

      setBillingData({
        ...billingInfo,
        paymentMethods,
        invoices,
      });
      setBillingForm({
        email: billingInfo.billingEmail || "",
        phone: billingInfo.billingPhone || "",
        address: billingInfo.billingAddress,
      });
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load billing information";
      setError(errorMessage);
      console.error("Error loading billing data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBilling = async () => {
    // Validate address if provided (address is optional for billing, but if provided, must be complete)
    if (billingForm.address) {
      if (billingForm.address.address_line1 && (!billingForm.address.city || !billingForm.address.country)) {
        toast.error("Please complete the address (city and country are required if address is provided)");
        return;
      }
    }

    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/billing", {
        billingEmail: billingForm.email || null,
        billingPhone: billingForm.phone || null,
        billingAddress: billingForm.address,
      });
      setShowBillingDialog(false);
      toast.success("Billing information updated successfully");
      loadBillingData();
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to update billing information";
      toast.error(errorMessage);
      console.error("Error saving billing data:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Billing" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Billing details and Invoices"
        subtitle="Manage your billing information and view invoices"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading billing information..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !billingData) {
    return (
      <SettingsDetailLayout
        title="Billing details and Invoices"
        subtitle="Manage your billing information and view invoices"
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title="Failed to load billing information"
          description={error}
          action={{
            label: "Retry",
            onClick: loadBillingData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Billing details and Invoices"
      subtitle="Manage your billing information and view invoices"
      breadcrumbs={breadcrumbs}
    >
      {/* Billing Address */}
      <SectionCard title="Billing Address" className="w-full">
        {billingData?.billingAddress || billingForm.email || billingForm.phone ? (
          <div className="space-y-4">
            {billingForm.email && (
              <div>
                <Label className="text-sm font-medium text-gray-700">Billing Email</Label>
                <p className="text-sm text-gray-600 mt-1">{billingForm.email}</p>
              </div>
            )}
            {billingForm.phone && (
              <div>
                <Label className="text-sm font-medium text-gray-700">Billing Phone</Label>
                <p className="text-sm text-gray-600 mt-1">{billingForm.phone}</p>
              </div>
            )}
            {billingForm.address && (
              <div>
                <Label className="text-sm font-medium text-gray-700">Billing Address</Label>
                <p className="text-sm text-gray-600 mt-1">
                  {billingForm.address.address_line1}
                  {billingForm.address.city && `, ${billingForm.address.city}`}
                  {billingForm.address.country && `, ${billingForm.address.country}`}
                </p>
              </div>
            )}
            <Button
              onClick={() => setShowBillingDialog(true)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Update Billing Details
            </Button>
          </div>
        ) : (
          <Alert className="border-gray-200 bg-gray-50">
            <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-sm text-gray-600">No billing address added</span>
              <Button
                size="sm"
                className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
                onClick={() => setShowBillingDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add billing details
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>

      {/* Default Payment Method */}
      <SectionCard title="Default Payment Method" className="w-full">
        <PaymentMethodsSection
          paymentMethods={billingData?.paymentMethods || []}
          onRefresh={loadBillingData}
        />
      </SectionCard>

      {/* Sales & Fees */}
      <SectionCard title="Sales & Fees" className="w-full">
        <InvoicesSection
          invoices={billingData?.invoices || []}
          onRefresh={loadBillingData}
        />
      </SectionCard>

      {/* Billing Details Dialog */}
      <Dialog open={showBillingDialog} onOpenChange={setShowBillingDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Billing Details</DialogTitle>
            <DialogDescription>
              Update your billing address and contact information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 sm:space-y-6">
            <div>
              <Label htmlFor="billingEmail" className="text-sm sm:text-base">
                Billing Email
              </Label>
              <Input
                id="billingEmail"
                type="email"
                value={billingForm.email}
                onChange={(e) => setBillingForm({ ...billingForm, email: e.target.value })}
                placeholder="billing@example.com"
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label htmlFor="billingPhone" className="text-sm sm:text-base">
                Billing Phone
              </Label>
              <Input
                id="billingPhone"
                type="tel"
                value={billingForm.phone}
                onChange={(e) => setBillingForm({ ...billingForm, phone: e.target.value })}
                placeholder="+27 11 123 4567"
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-sm sm:text-base mb-2 block">Billing Address</Label>
              <AddressForm
                initialAddress={billingForm.address}
                onSave={(address) => setBillingForm({ ...billingForm, address })}
                showLabel={false}
                asForm={false}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBillingDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBilling}
              disabled={isSaving}
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}

// Payment Methods Section Component
function PaymentMethodsSection({ paymentMethods, onRefresh }: { paymentMethods: any[]; onRefresh: () => void }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: "credit_card",
    name: "",
    last4: "",
    expiry_month: "",
    expiry_year: "",
    bank_name: "",
    account_type: "checking",
    is_default: false,
  });

  const handleAddPaymentMethod = async () => {
    try {
      await fetcher.post("/api/provider/payment-methods", formData);
      toast.success("Payment method added successfully");
      setShowAddDialog(false);
      setFormData({
        type: "credit_card",
        name: "",
        last4: "",
        expiry_month: "",
        expiry_year: "",
        bank_name: "",
        account_type: "checking",
        is_default: false,
      });
      onRefresh();
    } catch {
      toast.error("Failed to add payment method");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this payment method?")) return;
    try {
      setIsDeleting(id);
      await fetcher.delete(`/api/provider/payment-methods/${id}`);
      toast.success("Payment method removed");
      onRefresh();
    } catch {
      toast.error("Failed to remove payment method");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetcher.patch(`/api/provider/payment-methods/${id}`, { is_default: true });
      toast.success("Default payment method updated");
      onRefresh();
    } catch {
      toast.error("Failed to update default payment method");
    }
  };

  if (paymentMethods.length === 0) {
    return (
      <Alert className="border-gray-200 bg-gray-50">
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <span className="text-sm text-gray-600">No payment method set</span>
          <Button
            size="sm"
            className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add payment method
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {paymentMethods.length} payment method{paymentMethods.length !== 1 ? "s" : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add payment method
        </Button>
      </div>

      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-gray-400" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{method.name}</p>
                  {method.is_default && (
                    <Badge variant="outline" className="text-xs">Default</Badge>
                  )}
                </div>
                {method.last4 && (
                  <p className="text-xs text-gray-500">•••• {method.last4}</p>
                )}
                {method.expiry_month && method.expiry_year && (
                  <p className="text-xs text-gray-500">
                    Expires {method.expiry_month}/{method.expiry_year}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!method.is_default && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSetDefault(method.id)}
                >
                  Set as default
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(method.id)}
                disabled={isDeleting === method.id}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Payment Method Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Add a payment method for paying platform fees
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="debit_card">Debit Card</SelectItem>
                  <SelectItem value="bank_account">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Visa ending in 1234"
              />
            </div>
            {(formData.type === "credit_card" || formData.type === "debit_card") && (
              <>
                <div>
                  <Label>Last 4 digits</Label>
                  <Input
                    value={formData.last4}
                    onChange={(e) => setFormData({ ...formData, last4: e.target.value })}
                    placeholder="1234"
                    maxLength={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Expiry Month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={formData.expiry_month}
                      onChange={(e) => setFormData({ ...formData, expiry_month: e.target.value })}
                      placeholder="MM"
                    />
                  </div>
                  <div>
                    <Label>Expiry Year</Label>
                    <Input
                      type="number"
                      min={new Date().getFullYear()}
                      value={formData.expiry_year}
                      onChange={(e) => setFormData({ ...formData, expiry_year: e.target.value })}
                      placeholder="YYYY"
                    />
                  </div>
                </div>
              </>
            )}
            {formData.type === "bank_account" && (
              <>
                <div>
                  <Label>Bank Name</Label>
                  <Input
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder="e.g., Standard Bank"
                  />
                </div>
                <div>
                  <Label>Account Type</Label>
                  <Select
                    value={formData.account_type}
                    onValueChange={(value) => setFormData({ ...formData, account_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_default" className="cursor-pointer">
                Set as default payment method
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPaymentMethod}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              Add Payment Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Invoices Section Component
function InvoicesSection({ invoices, onRefresh: _onRefresh }: { invoices: any[]; onRefresh: () => void }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const filteredInvoices = selectedStatus === "all"
    ? invoices
    : invoices.filter((inv) => inv.status === selectedStatus);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; icon: any }> = {
      paid: { variant: "default", icon: CheckCircle2 },
      sent: { variant: "secondary", icon: Clock },
      overdue: { variant: "outline", icon: AlertCircle },
      draft: { variant: "outline", icon: FileText },
      partially_paid: { variant: "secondary", icon: Clock },
    };

    const config = variants[status] || { variant: "outline" as const, icon: FileText };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  if (invoices.length === 0) {
    return (
      <div className="py-8 sm:py-12 text-center">
        <EmptyState
          title="No invoices yet"
          description="Your platform fee invoices will appear here"
          icon={FileText}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-gray-600">
          {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
        </p>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partially_paid">Partially Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {new Date(invoice.period_start).toLocaleDateString()} - {new Date(invoice.period_end).toLocaleDateString()}
                </TableCell>
                <TableCell>{new Date(invoice.issue_date).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{formatCurrency(invoice.total_amount)}</TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/api/provider/invoices/${invoice.id}/download`, "_blank")}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.location.href = `/provider/settings/billing/invoices/${invoice.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
