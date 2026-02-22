"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Trash2,
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { PAYOUT_COUNTRIES, getCurrencyForCountry } from "@/lib/payments/payout-countries";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BankAccount {
  id: string;
  recipient_code: string;
  account_name: string;
  account_number_last4: string;
  bank_name: string | null;
  bank_code: string;
  currency: string;
  active: boolean;
  created_at: string;
}

interface Bank {
  code: string;
  name: string;
  country: string;
  currency: string;
  type: string;
}

export default function PayoutAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    country: "ZA",
    account_number: "",
    bank_code: "",
    account_name: "",
    email: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(null);

  const loadBanks = useCallback(async (country: string) => {
    try {
      setIsLoadingBanks(true);
      const response = await fetcher.get<{ data: Bank[] }>(`/api/public/banks?country=${encodeURIComponent(country)}`);
      setBanks(response.data || []);
    } catch (err) {
      console.error("Error loading banks:", err);
      toast.error("Failed to load bank list");
    } finally {
      setIsLoadingBanks(false);
    }
  }, []);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: BankAccount[] }>("/api/provider/payout-accounts");
      setAccounts(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to load payout accounts";
      setError(errorMessage);
      console.error("Error loading accounts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (showAddDialog) {
      loadBanks(formData.country);
    }
  }, [showAddDialog, formData.country, loadBanks]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.account_number.trim()) {
      errors.account_number = "Account number is required";
    } else if (formData.account_number.length < 8 || formData.account_number.length > 15) {
      errors.account_number = "Account number must be between 8 and 15 digits";
    } else if (!/^\d+$/.test(formData.account_number)) {
      errors.account_number = "Account number must contain only digits";
    }

    if (!formData.country) {
      errors.country = "Country is required";
    }

    if (!formData.bank_code) {
      errors.bank_code = "Bank is required";
    }

    if (!formData.account_name.trim()) {
      errors.account_name = "Account name is required";
    } else if (formData.account_name.length < 2) {
      errors.account_name = "Account name must be at least 2 characters";
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email address";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleVerifyAccount = async () => {
    if (!formData.account_number.trim() || !formData.bank_code) {
      setFormErrors({
        ...formErrors,
        account_number: !formData.account_number ? "Enter account number to verify" : "",
        bank_code: !formData.bank_code ? "Select bank to verify" : "",
      });
      return;
    }
    if (formData.account_number.length < 8 || formData.account_number.length > 15) {
      setFormErrors({ ...formErrors, account_number: "Account number must be 8-15 digits" });
      return;
    }
    try {
      setIsVerifying(true);
      setVerifiedAccountName(null);
      const response = await fetcher.post<{ data: { account_name: string } }>(
        "/api/provider/payout-accounts/verify",
        {
          account_number: formData.account_number,
          bank_code: formData.bank_code,
        }
      );
      const name = response.data?.account_name;
      if (name) {
        setFormData((prev) => ({ ...prev, account_name: name }));
        setVerifiedAccountName(name);
        setFormErrors((prev) => ({ ...prev, account_name: "" }));
        toast.success("Account verified");
      }
    } catch (err: any) {
      const msg =
        err instanceof FetchError ? err.message : err?.details?.[0]?.message || "Verification failed";
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddAccount = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      const currency = getCurrencyForCountry(formData.country);
      await fetcher.post<{ data: BankAccount }>("/api/provider/payout-accounts", {
        type: "nuban",
        country: formData.country,
        account_number: formData.account_number,
        bank_code: formData.bank_code,
        account_name: formData.account_name,
        currency,
        ...(verifiedAccountName ? { verified_account_name: verifiedAccountName } : {}),
        email: formData.email || undefined,
        description: formData.description || undefined,
      });

      invalidateSetupStatusCache();
      toast.success("Bank account added successfully");
      setShowAddDialog(false);
      setFormData({
        country: "ZA",
        account_number: "",
        bank_code: "",
        account_name: "",
        email: "",
        description: "",
      });
      setFormErrors({});
      setVerifiedAccountName(null);
      loadAccounts();
    } catch (err: any) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : err?.details?.[0]?.message || "Failed to add bank account";
      toast.error(errorMessage);
      console.error("Error adding account:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this bank account? This action cannot be undone.")) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/payout-accounts/${id}`);
      toast.success("Bank account removed");
      loadAccounts();
    } catch {
      toast.error("Failed to remove bank account");
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await fetcher.patch(`/api/provider/payout-accounts/${id}`, { active: true });
      invalidateSetupStatusCache();
      toast.success("Bank account activated");
      loadAccounts();
    } catch {
      toast.error("Failed to update bank account");
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Payout Accounts" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Payout Accounts"
        subtitle="Manage your bank accounts for receiving payouts"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading payout accounts..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Payout Accounts"
      subtitle="Add and manage bank accounts where you'll receive payouts"
      breadcrumbs={breadcrumbs}
    >
      <SectionCard title="Bank Accounts" className="w-full">
        {error && !accounts.length ? (
          <EmptyState
            title="Failed to load accounts"
            description={error}
            action={{
              label: "Retry",
              onClick: loadAccounts,
            }}
          />
        ) : accounts.length === 0 ? (
          <Alert className="border-gray-200 bg-gray-50">
            <AlertCircle className="w-4 h-4 text-gray-600" />
            <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">No bank accounts added</p>
                <p className="text-sm text-gray-600">
                  Add a bank account to receive payouts from your earnings
                </p>
              </div>
              <Button
                size="sm"
                className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Bank Account
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                {accounts.length} bank account{accounts.length !== 1 ? "s" : ""}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Bank Account
              </Button>
            </div>

            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`p-4 border rounded-lg ${
                    account.active
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{account.account_name}</p>
                            {account.active ? (
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-100 text-gray-600">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {account.bank_name || "Bank"} • •••• {account.account_number_last4}
                          </p>
                          <p className="text-xs text-gray-500">
                            {account.currency} • Added {new Date(account.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!account.active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetActive(account.id)}
                        >
                          Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(account.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Add Bank Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>
              Add a bank account to receive payouts. Your account will be verified with Paystack.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="country">
                Country <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.country}
                onValueChange={(value) => {
                  setFormData((prev) => ({
                    ...prev,
                    country: value,
                    bank_code: "",
                  }));
                  setFormErrors((prev) => ({ ...prev, country: "", bank_code: "" }));
                  setVerifiedAccountName(null);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.country && (
                <p className="text-xs text-red-600 mt-1">{formErrors.country}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Select your bank account country for correct bank list
              </p>
            </div>

            <div>
              <Label htmlFor="bank_code">
                Bank <span className="text-red-500">*</span>
              </Label>
              {isLoadingBanks ? (
                <div className="mt-1 p-3 border rounded-md text-sm text-gray-500">
                  Loading banks...
                </div>
              ) : (
                <Select
                  value={formData.bank_code}
                  onValueChange={(value) => {
                    setFormData((prev) => ({ ...prev, bank_code: value }));
                    setFormErrors((prev) => ({ ...prev, bank_code: "" }));
                    setVerifiedAccountName(null);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem key={bank.code} value={bank.code}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formErrors.bank_code && (
                <p className="text-xs text-red-600 mt-1">{formErrors.bank_code}</p>
              )}
            </div>

            <div>
              <Label htmlFor="account_number">
                Account Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="account_number"
                type="text"
                value={formData.account_number}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, ""); // Only digits
                  setFormData({ ...formData, account_number: value });
                  setFormErrors({ ...formErrors, account_number: "" });
                  setVerifiedAccountName(null);
                }}
                placeholder="Enter account number"
                className="mt-1"
                maxLength={15}
              />
              {formErrors.account_number && (
                <p className="text-xs text-red-600 mt-1">{formErrors.account_number}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Enter your bank account number (8-15 digits)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleVerifyAccount}
                disabled={
                  isVerifying ||
                  !formData.account_number ||
                  formData.account_number.length < 8 ||
                  !formData.bank_code
                }
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : verifiedAccountName ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                    Verified
                  </>
                ) : (
                  "Verify Account"
                )}
              </Button>
            </div>

            <div>
              <Label htmlFor="account_name">
                Account Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="account_name"
                type="text"
                value={formData.account_name}
                onChange={(e) => {
                  setFormData({ ...formData, account_name: e.target.value });
                  setFormErrors({ ...formErrors, account_name: "" });
                }}
                placeholder="Enter account holder name"
                className="mt-1"
              />
              {formErrors.account_name && (
                <p className="text-xs text-red-600 mt-1">{formErrors.account_name}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Name as it appears on your bank account
              </p>
            </div>

            <div>
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setFormErrors({ ...formErrors, email: "" });
                }}
                placeholder="your@email.com"
                className="mt-1"
              />
              {formErrors.email && (
                <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Email for payout notifications (optional)
              </p>
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Main business account"
                className="mt-1"
              />
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                Your account will be verified with Paystack. Make sure the account name matches
                exactly as it appears on your bank statement.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setFormData({
                  country: "ZA",
                  account_number: "",
                  bank_code: "",
                  account_name: "",
                  email: "",
                  description: "",
                });
                setFormErrors({});
                setVerifiedAccountName(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddAccount}
              disabled={isSubmitting}
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
