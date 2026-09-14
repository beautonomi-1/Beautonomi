"use client";

import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  FileText,
  Loader2,
  CreditCard,
  Trash2,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
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
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { formatStatusLabel } from "@/lib/locale/status-label";

interface BillingData {
  billingAddress: any;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentMethods: any[];
  invoices: any[];
  billingHistory: BillingHistoryItem[];
}

interface BillingHistoryItem {
  id: string;
  amount: number;
  currency?: string | null;
  status: string;
  type?: "subscription" | "ads" | "marketing_credit" | string;
  description?: string | null;
  created_at: string;
  invoice_url?: string | null;
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

      // Load billing settings, payment methods, invoices, and subscription/ads payments in parallel.
      const [billingResponse, paymentMethodsResponse, invoicesResponse, billingHistoryResponse] =
        await Promise.all([
          fetcher.get<{ data: BillingData }>("/api/provider/settings/billing"),
          fetcher.get<{ data: any[] }>("/api/provider/payment-methods").catch(() => ({ data: [] })),
          fetcher
            .get<{ data: { invoices: any[] } }>("/api/provider/invoices?limit=100")
            .catch(() => ({ data: { invoices: [] } })),
          fetcher
            .get<{ data: { items?: BillingHistoryItem[] } | BillingHistoryItem[] }>(
              "/api/provider/billing-history",
            )
            .catch(() => ({ data: { items: [] } })),
        ]);

      const billingInfo = billingResponse.data;
      const paymentMethods = paymentMethodsResponse.data || [];
      const invoices = invoicesResponse.data?.invoices || [];
      // The API returns `{ items, total, limit, has_more }`; tolerate a bare
      // array too so the list never silently renders empty on shape drift.
      const rawBillingHistory = billingHistoryResponse.data;
      const billingHistory = Array.isArray(rawBillingHistory)
        ? rawBillingHistory
        : (rawBillingHistory?.items ?? []);

      setBillingData({
        ...billingInfo,
        paymentMethods,
        invoices,
        billingHistory,
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
        <BillingHistorySection items={billingData?.billingHistory || []} />
      </SectionCard>

      {/* Sales & Fees */}
      <SectionCard title={t("web.provider.settings.pages.billing.salesFees")} className="w-full">
        <InvoicesSection invoices={billingData?.invoices || []} onRefresh={loadBillingData} />
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

function BillingHistorySection({ items }: { items: BillingHistoryItem[] }) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const fallbackCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;

  const formatCurrency = (amount: number, currency?: string | null) => {
    return formatMoney(Number(amount || 0), currency || fallbackCurrency);
  };

  if (items.length === 0) {
    return (
      <div className="py-8 sm:py-12 text-center">
        <EmptyState
          title={t("web.provider.settings.pages.billing.noSubscriptionAdsOrMarketingPayments")}
description={t("web.provider.settings.pages.billing.noHistoryDescription")}
          icon={CreditCard}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isAds = item.type === "ads";
        const isMarketing = item.type === "marketing_credit";
const typeLabel = isMarketing ? t("web.provider.settings.pages.billing.marketingCredits") : isAds ? t("web.provider.settings.pages.billing.ads") : t("web.provider.settings.pages.billing.subscription");
        const fallbackLabel = isMarketing
          ? t("web.provider.settings.pages.billing.marketingCreditTopUp")
          : isAds
            ? t("web.provider.settings.pages.billing.adsCampaignPayment")
            : t("web.provider.settings.pages.billing.subscriptionPayment");
        const iconClasses = isMarketing
          ? "bg-emerald-50 text-emerald-700"
          : isAds
            ? "bg-amber-50 text-amber-700"
            : "bg-indigo-50 text-indigo-700";
        return (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClasses}`}
              >
                {isAds ? <CreditCard className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{item.description || fallbackLabel}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleDateString()} · {typeLabel}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="font-semibold text-slate-900">
                {formatCurrency(item.amount, item.currency)}
              </span>
              <Badge variant="secondary">
                {formatStatusLabel(item.status)}
              </Badge>
              {item.invoice_url ? (
                <a
                  href={item.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
<FileText className="h-3.5 w-3.5" /> {t("web.provider.settings.pages.billing.receipt")}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Invoices Section Component
function InvoicesSection({
  invoices,
  onRefresh: _onRefresh,
}: {
  invoices: any[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const invoiceCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const filteredInvoices =
    selectedStatus === "all" ? invoices : invoices.filter((inv) => inv.status === selectedStatus);

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
        {formatStatusLabel(status)}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, invoiceCurrency);
  };

  if (invoices.length === 0) {
    return (
      <div className="py-8 sm:py-12 text-center">
        <EmptyState
          title={t("web.provider.settings.pages.billing.noInvoicesYet")}
description={t("web.provider.settings.pages.billing.noInvoicesDescription")}
          icon={FileText}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.billing.invoiceCount", { count: invoices.length })}
        </p>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
<SelectItem value="all">{t("web.provider.common.allStatuses")}</SelectItem>
<SelectItem value="draft">{t("web.provider.settings.pages.billing.draft")}</SelectItem>
<SelectItem value="sent">{t("web.provider.settings.pages.billing.sent")}</SelectItem>
<SelectItem value="paid">{t("web.provider.settings.pages.billing.paid")}</SelectItem>
<SelectItem value="partially_paid">{t("web.provider.settings.pages.billing.partiallyPaid")}</SelectItem>
<SelectItem value="overdue">{t("web.provider.settings.pages.billing.overdue")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {filteredInvoices.map((invoice) => (
          <div key={invoice.id} className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">{invoice.invoice_number}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(invoice.period_start).toLocaleDateString()} –{" "}
                  {new Date(invoice.period_end).toLocaleDateString()}
                </p>
              </div>
              {getStatusBadge(invoice.status)}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
<span className="text-xs text-gray-500">{t("web.provider.settings.pages.billing.issueDate")}</span>
                <p className="text-gray-900">{new Date(invoice.issue_date).toLocaleDateString()}</p>
              </div>
              <div>
<span className="text-xs text-gray-500">{t("web.provider.settings.pages.billing.dueDate")}</span>
                <p className="text-gray-900">{new Date(invoice.due_date).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t">
              <p className="font-semibold">{formatCurrency(invoice.total_amount)}</p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() =>
                    window.open(`/api/provider/invoices/${invoice.id}/download`, "_blank")
                  }
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() =>
                    (window.location.href = `/provider/settings/billing/invoices/${invoice.id}`)
                  }
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block border border-gray-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
<TableHead>{t("web.provider.settings.pages.billing.invoiceNumber")}</TableHead>
<TableHead>{t("web.provider.settings.pages.billing.period")}</TableHead>
<TableHead>{t("web.provider.settings.pages.billing.issueDate")}</TableHead>
<TableHead>{t("web.provider.settings.pages.billing.dueDate")}</TableHead>
<TableHead>{t("web.provider.common.amount")}</TableHead>
<TableHead>{t("web.provider.common.statusLabel")}</TableHead>
<TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {new Date(invoice.period_start).toLocaleDateString()} -{" "}
                  {new Date(invoice.period_end).toLocaleDateString()}
                </TableCell>
                <TableCell>{new Date(invoice.issue_date).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(invoice.total_amount)}
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.open(`/api/provider/invoices/${invoice.id}/download`, "_blank")
                      }
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        (window.location.href = `/provider/settings/billing/invoices/${invoice.id}`)
                      }
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
