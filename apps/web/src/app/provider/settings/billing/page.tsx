"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { Suspense, useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Loader2,
  CreditCard,
  Trash2,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { NativeAppCheckoutBounce } from "@/components/payments/NativeAppCheckoutBounce";
import { ProviderInvoicesPanel } from "@/components/provider/billing/ProviderInvoicesPanel";
import { ProviderBillingHistoryPanel } from "@/components/provider/billing/ProviderBillingHistoryPanel";

interface BillingData {
  billingAddress: any;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentMethods: any[];
  invoices: any[];
}

export default function BillingSettings() {
  const { t } = useTranslation();
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

      const [billingResponse, paymentMethodsResponse] = await Promise.all([
        fetcher.get<{ data: BillingData }>("/api/provider/settings/billing"),
        fetcher.get<{ data: any[] }>("/api/provider/payment-methods").catch(() => ({ data: [] })),
      ]);

      const billingInfo = billingResponse.data;
      const paymentMethods = paymentMethodsResponse.data || [];

      setBillingData({
        ...billingInfo,
        paymentMethods,
        invoices: [],
      });
      setBillingForm({
        email: billingInfo.billingEmail || "",
        phone: billingInfo.billingPhone || "",
        address: billingInfo.billingAddress,
      });
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback");
      setError(errorMessage);
      console.error("Error loading billing data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBilling = async () => {
    // Validate address if provided (address is optional for billing, but if provided, must be complete)
    if (billingForm.address) {
      if (
        billingForm.address.address_line1 &&
        (!billingForm.address.city || !billingForm.address.country)
      ) {
        toast.error(
t("web.provider.settings.pages.billing.completeAddressRequired")
        );
        return;
      }
    }

    if (billingForm.phone?.trim() && !isCompleteE164(billingForm.phone)) {
      toast.error(t("web.provider.settings.pages.billing.enterAValidPhoneNumberOr"));
      return;
    }

    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/billing", {
        billingEmail: billingForm.email || null,
        billingPhone: billingForm.phone?.trim() || null,
        billingAddress: billingForm.address,
      });
      setShowBillingDialog(false);
      toast.success(t("web.provider.settings.pages.billing.billingInformationUpdatedSuccessfully"));
      loadBillingData();
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : t("web.provider.settings.pages.billing.failedToUpdateBillingInformation");
      toast.error(errorMessage);
      console.error("Error saving billing data:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.billing.billing") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.billing.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.billing.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.billing.loadingBillingInformation")} />
      </SettingsDetailLayout>
    );
  }

  if (error && !billingData) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.billing.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.billing.description")}
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title={t("web.provider.settings.pages.billing.failedToLoadBillingInformation")}
          description={error}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadBillingData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <NativeAppCheckoutBounce />
      </Suspense>
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.billing.billingDetailsAndInvoices")}
      subtitle={t("web.provider.settings.pages.billing.manageYourBillingInformationAndView")}
      breadcrumbs={breadcrumbs}
    >
      {/* Billing Address */}
      <SectionCard title={t("web.provider.settings.pages.billing.billingAddress")} className="w-full">
        {billingData?.billingAddress || billingForm.email || billingForm.phone ? (
          <div className="space-y-4">
            {billingForm.email && (
              <div>
<Label className="text-sm font-medium text-gray-700">{t("web.provider.settings.pages.billing.billingEmail")}</Label>
                <p className="text-sm text-gray-600 mt-1">{billingForm.email}</p>
              </div>
            )}
            {billingForm.phone && (
              <div>
<Label className="text-sm font-medium text-gray-700">{t("web.provider.settings.pages.billing.billingPhone")}</Label>
                <p className="text-sm text-gray-600 mt-1">{billingForm.phone}</p>
              </div>
            )}
            {billingForm.address && (
              <div>
                <Label className="text-sm font-medium text-gray-700">{t("web.provider.settings.pages.billing.billingAddress")}</Label>
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
              <Plus className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.billing.updateBillingDetails")}
            </Button>
          </div>
        ) : (
          <Alert className="border-gray-200 bg-gray-50">
            <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
<span className="text-sm text-gray-600">{t("web.provider.settings.pages.billing.noBillingAddressAdded")}</span>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
                onClick={() => setShowBillingDialog(true)}
              >
                <Plus className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.billing.addBillingDetails")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>

      {/* Default Payment Method */}
      <SectionCard title={t("web.provider.settings.pages.billing.defaultPaymentMethod")} className="w-full">
        <PaymentMethodsSection
          paymentMethods={billingData?.paymentMethods || []}
          onRefresh={loadBillingData}
        />
      </SectionCard>

      <SectionCard title={t("web.provider.settings.pages.billing.subscriptionAdsMarketingBillingHistory")} className="w-full">
        <ProviderBillingHistoryPanel />
      </SectionCard>

      {/* Sales & Fees */}
      <SectionCard title={t("web.provider.settings.pages.billing.salesFees")} className="w-full">
        <ProviderInvoicesPanel />
      </SectionCard>

      {/* Billing Details Dialog */}
      <Dialog open={showBillingDialog} onOpenChange={setShowBillingDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
<DialogTitle>{t("web.provider.settings.pages.billing.billingDetails")}</DialogTitle>
            <DialogDescription>
{t("web.provider.settings.pages.billing.updateBillingAddressAndContact")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 sm:space-y-6">
            <div>
              <Label htmlFor="billingEmail" className="text-sm sm:text-base">
{t("web.provider.settings.pages.billing.billingEmail")}
              </Label>
              <Input
                id="billingEmail"
                type="email"
                value={billingForm.email}
                onChange={(e) => setBillingForm({ ...billingForm, email: e.target.value })}
                placeholder={t("web.provider.settings.pages.billing.billingExampleCom")}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <PhoneInput
                inputId="settings-billing-phone"
label={t("web.provider.settings.pages.billing.billingPhone")}
                value={billingForm.phone}
                onChange={(e164) => setBillingForm({ ...billingForm, phone: e164 })}
                placeholder={t("web.provider.settings.pages.billing.phoneNumber")}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <Label className="text-sm sm:text-base mb-2 block">{t("web.provider.settings.pages.billing.billingAddress")}</Label>
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
{t("web.provider.common.cancel")}
            </Button>
            <Button
              onClick={handleSaveBilling}
              disabled={isSaving}
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
{t("web.provider.common.saving")}
                </>
              ) : (
t("web.provider.settings.common.saveChanges")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
    </>
  );
}

// Payment Methods Section Component
function PaymentMethodsSection({
  paymentMethods,
  onRefresh,
}: {
  paymentMethods: any[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
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
      toast.success(t("web.provider.settings.pages.billing.paymentMethodAddedSuccessfully"));
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
      toast.error(t("web.provider.settings.pages.billing.failedToAddPaymentMethod"));
    }
  };

  const handleDelete = async (id: string) => {
if (!confirm(t("web.provider.settings.pages.billing.removePaymentMethodConfirm"))) return;
    try {
      setIsDeleting(id);
      await fetcher.delete(`/api/provider/payment-methods/${id}`);
      toast.success(t("web.provider.settings.pages.billing.paymentMethodRemoved"));
      onRefresh();
    } catch {
      toast.error(t("web.provider.settings.pages.billing.failedToRemovePaymentMethod"));
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetcher.patch(`/api/provider/payment-methods/${id}`, { is_default: true });
      toast.success(t("web.provider.settings.pages.billing.defaultPaymentMethodUpdated"));
      onRefresh();
    } catch {
      toast.error(t("web.provider.settings.pages.billing.failedToUpdateDefaultPaymentMethod"));
    }
  };

  if (paymentMethods.length === 0) {
    return (
      <Alert className="border-gray-200 bg-gray-50">
        <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
<span className="text-sm text-gray-600">{t("web.provider.settings.pages.billing.noPaymentMethodSet")}</span>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary-hover w-full sm:w-auto"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.billing.addPaymentMethod")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.billing.paymentMethodCount", { count: paymentMethods.length })}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 me-2" />
          {t("web.provider.settings.pages.billing.addPaymentMethod")}
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
                    <Badge variant="outline" className="text-xs">
{t("web.provider.common.default")}
                    </Badge>
                  )}
                </div>
                {method.last4 && <p className="text-xs text-gray-500">•••• {method.last4}</p>}
                {method.expiry_month && method.expiry_year && (
                  <p className="text-xs text-gray-500">
{t("web.provider.settings.pages.billing.expires", { month: method.expiry_month, year: method.expiry_year })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!method.is_default && (
                <Button size="sm" variant="ghost" onClick={() => handleSetDefault(method.id)}>
{t("web.provider.settings.pages.billing.setAsDefault")}
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
<DialogTitle>{t("web.provider.settings.pages.billing.addPaymentMethodTitle")}</DialogTitle>
<DialogDescription>{t("web.provider.settings.pages.billing.addPaymentMethodDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
<Label>{t("web.provider.common.type")}</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
<SelectItem value="credit_card">{t("web.provider.settings.pages.billing.creditCard")}</SelectItem>
<SelectItem value="debit_card">{t("web.provider.settings.pages.billing.debitCard")}</SelectItem>
<SelectItem value="bank_account">{t("web.provider.settings.pages.billing.bankAccount")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
<Label>{t("web.provider.common.name")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.billing.eGVisaEndingIn1234")}
              />
            </div>
            {(formData.type === "credit_card" || formData.type === "debit_card") && (
              <>
                <div>
<Label>{t("web.provider.settings.pages.billing.last4Digits")}</Label>
                  <Input
                    value={formData.last4}
                    onChange={(e) => setFormData({ ...formData, last4: e.target.value })}
                    placeholder={t("web.provider.settings.pages.billing.n1234")}
                    maxLength={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
<Label>{t("web.provider.settings.pages.billing.expiryMonth")}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={formData.expiry_month}
                      onChange={(e) => setFormData({ ...formData, expiry_month: e.target.value })}
                      placeholder={t("web.provider.settings.pages.billing.mm")}
                    />
                  </div>
                  <div>
<Label>{t("web.provider.settings.pages.billing.expiryYear")}</Label>
                    <Input
                      type="number"
                      min={new Date().getFullYear()}
                      value={formData.expiry_year}
                      onChange={(e) => setFormData({ ...formData, expiry_year: e.target.value })}
                      placeholder={t("web.provider.settings.pages.billing.yyyy")}
                    />
                  </div>
                </div>
              </>
            )}
            {formData.type === "bank_account" && (
              <>
                <div>
<Label>{t("web.provider.settings.pages.billing.bankName")}</Label>
                  <Input
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder={t("web.provider.settings.pages.billing.eGStandardBank")}
                  />
                </div>
                <div>
<Label>{t("web.provider.settings.pages.billing.accountType")}</Label>
                  <Select
                    value={formData.account_type}
                    onValueChange={(value) => setFormData({ ...formData, account_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
<SelectItem value="checking">{t("web.provider.settings.pages.billing.checking")}</SelectItem>
<SelectItem value="savings">{t("web.provider.settings.pages.billing.savings")}</SelectItem>
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
{t("web.provider.settings.pages.billing.setAsDefaultPaymentMethod")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
{t("web.provider.common.cancel")}
            </Button>
            <Button onClick={handleAddPaymentMethod} className="bg-primary hover:bg-primary-hover">
{t("web.provider.settings.pages.billing.addPaymentMethodCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
