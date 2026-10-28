"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { verifyWithRetry } from "@/lib/payments/verify-with-retry";
import {
  readHostedCheckoutReturnParams,
  isHostedCheckoutFailureStatus,
} from "@/lib/payments/hosted-checkout-return-params";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher, providerPortalFetch } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { Download, ArrowLeft, CheckCircle2, Clock, AlertCircle, FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  currency?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  effective_status?: string;
  notes: string | null;
  line_items: any[];
  payments: any[];
}

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useTenantLocaleTag();
  const { bundle } = useConfigBundle();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifyingReturn, setVerifyingReturn] = useState(false);
  const [canPay, setCanPay] = useState(false);
  const [showEft, setShowEft] = useState(false);
  const [eftAmount, setEftAmount] = useState("");
  const [eftReference, setEftReference] = useState("");
  const [submittingEft, setSubmittingEft] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoice();
    void (async () => {
      try {
        const perms = await fetcher.get<{
          data: { isOwner?: boolean; permissions?: Record<string, boolean> };
        }>("/api/provider/permissions");
        setCanPay(
          perms.data?.isOwner === true || perms.data?.permissions?.edit_settings === true,
        );
      } catch {
        setCanPay(false);
      }
    })();
  }, [invoiceId]);

  useEffect(() => {
    const paymentSuccess = searchParams.get("payment_success") === "true";
    const paymentCancelled = searchParams.get("payment_cancelled") === "1";
    const hosted = readHostedCheckoutReturnParams(searchParams);
    const reference = hosted.reference;
    const sessionId = hosted.sessionId;
    const flutterwaveTransactionId = hosted.transactionId;
    const hostedStatus = hosted.hostedStatus;

    if (paymentCancelled) {
      router.replace(`/provider/settings/billing/invoices/${invoiceId}`);
      toast.info(t("web.provider.settings.pages.billing/invoices/[id].paymentCancelled"));
      void loadInvoice();
      return;
    }

    if (isHostedCheckoutFailureStatus(hostedStatus)) {
      router.replace(`/provider/settings/billing/invoices/${invoiceId}`);
      toast.info(t("web.provider.settings.pages.billing/invoices/[id].paymentCancelled"));
      void loadInvoice();
      return;
    }

    if (!paymentSuccess || !reference) return;

    void (async () => {
      setVerifyingReturn(true);
      try {
        const verify = await verifyWithRetry(reference, {
          maxAttempts: 5,
          delayMs: 1500,
          sessionId,
          transactionId: flutterwaveTransactionId,
        });
        if (verify.status === "success") {
          toast.success(t("web.provider.settings.pages.billing/invoices/[id].paymentSuccessful"));
        } else if (verify.status === "pending") {
          toast.info(t("web.provider.settings.pages.billing/invoices/[id].paymentPendingTitle"));
        } else if (verify.status === "failed") {
          toast.error(
            verify.errorMessage ??
              t("web.provider.settings.pages.billing/invoices/[id].paymentFailedDefault"),
          );
        }
        await loadInvoice();
      } finally {
        setVerifyingReturn(false);
        router.replace(`/provider/settings/billing/invoices/${invoiceId}`);
      }
    })();
  }, [searchParams, invoiceId, router, t]);

  const loadInvoice = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await fetcher.get<{ data: Invoice }>(
        `/api/provider/invoices/${invoiceId}`
      );
      setInvoice(response.data);
      const due =
        Number(response.data.amount_due ?? NaN) ||
        Math.max(0, Number(response.data.total_amount) - Number(response.data.amount_paid ?? 0));
      setEftAmount(String(due));
    } catch (error) {
      console.error("Error loading invoice:", error);
      const msg =
        error instanceof Error
          ? error.message
          : t("web.provider.settings.pages.billing/invoices/[id].failedToLoadInvoice");
      setLoadError(msg);
      setInvoice(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const response = await providerPortalFetch(`/api/provider/invoices/${invoiceId}/download`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("web.provider.settings.pages.billing/invoices/[id].failedToLoadInvoice"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const pdfWindow = window.open(url, "_blank");
      if (!pdfWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${invoice?.invoice_number ?? invoiceId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast.error(t("web.provider.settings.pages.billing/invoices/[id].failedToLoadInvoice"));
    }
  };

  const invoiceCurrency =
    invoice?.currency?.trim() ||
    bundle?.meta?.tenant_region?.default_currency ||
    LAST_RESORT_CURRENCY;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: invoiceCurrency,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const amountDue = invoice
    ? Math.max(
        0,
        Number(invoice.amount_due ?? NaN) ||
          Number(invoice.total_amount ?? 0) - Number(invoice.amount_paid ?? 0),
      )
    : 0;
  const displayStatus = invoice?.effective_status ?? invoice?.status ?? "";
  const hasPendingEft = Boolean(invoice?.payments?.some((p) => p.status === "pending"));
  const isOpen =
    displayStatus === "sent" ||
    displayStatus === "partially_paid" ||
    displayStatus === "overdue";

  const handlePayInvoice = async () => {
    if (!invoice || amountDue <= 0) return;
    setPaying(true);
    try {
      const returnUrl = `${window.location.origin}/provider/settings/billing/invoices/${invoiceId}?payment_success=true`;
      const res = await fetcher.post<{
        data: { payment_url?: string; authorization_url?: string };
      }>(`/api/provider/invoices/${invoiceId}/initialize-payment`, {
        callback_url: returnUrl,
      });
      const url = res.data?.payment_url ?? res.data?.authorization_url;
      if (!url) {
        toast.error(t("web.provider.settings.pages.billing/invoices/[id].paymentUnavailable"));
        return;
      }
      window.location.href = url;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("web.provider.settings.pages.billing/invoices/[id].paymentStartFailed"),
      );
    } finally {
      setPaying(false);
    }
  };

  const handleSubmitEft = async () => {
    if (!invoice) return;
    const amount = parseFloat(eftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("web.provider.settings.pages.billing/invoices/[id].invalidEftAmount"));
      return;
    }
    setSubmittingEft(true);
    try {
      await fetcher.post(`/api/provider/invoices/${invoiceId}/pay`, {
        amount,
        paymentReference: eftReference.trim() || undefined,
      });
      toast.success(t("web.provider.settings.pages.billing/invoices/[id].eftSubmitted"));
      setShowEft(false);
      await loadInvoice();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("web.provider.settings.pages.billing/invoices/[id].eftFailed"),
      );
    } finally {
      setSubmittingEft(false);
    }
  };

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
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="w-3 h-3" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.billing/invoices/[id].billing"), href: "/provider/settings/billing" },
    { label: t("web.provider.settings.pages.billing/invoices/[id].invoice") },
  ];

  if (isLoading || verifyingReturn) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.billing/invoices/[id].invoiceDetails")}
        subtitle={t("web.provider.settings.pages.billing/invoices/[id].viewInvoiceInformation")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout
          loadingMessage={
            verifyingReturn
              ? t("web.provider.settings.pages.billing/invoices/[id].verifyingPayment")
              : t("web.provider.settings.pages.billing/invoices/[id].loadingInvoice")
          }
        />
      </SettingsDetailLayout>
    );
  }

  if (!invoice) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.billing/invoices/[id].invoiceDetails")}
        subtitle={t("web.provider.settings.pages.billing/invoices/[id].viewInvoiceInformation")}
        breadcrumbs={breadcrumbs}
      >
        <div className="text-center py-12">
          <p className="text-gray-600">
            {loadError ?? t("web.provider.settings.pages.billing/invoices/[id].notFound")}
          </p>
          {loadError ? (
            <Button variant="outline" onClick={() => void loadInvoice()} className="mt-4">
              {t("web.provider.common.retry")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 me-2" />
            {t("web.provider.bookings.detail.goBack")}
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.billing/invoices/[id].invoiceDetails")}
      subtitle={t("web.provider.settings.pages.billing/invoices/[id].invoiceNumber", { number: invoice.invoice_number })}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6">
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <h2 className="text-2xl font-bold text-primary">{invoice.invoice_number}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {formatDate(invoice.issue_date)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {getStatusBadge(displayStatus)}
            {isOpen && amountDue > 0 && canPay && (
              <Button onClick={() => void handlePayInvoice()} disabled={paying}>
                {paying
                  ? t("web.provider.settings.pages.billing/invoices/[id].paying")
                  : t("web.provider.settings.pages.billing/invoices/[id].payOnline")}
              </Button>
            )}
            {isOpen && amountDue > 0 && canPay && !hasPendingEft && (
              <Button variant="secondary" onClick={() => setShowEft((v) => !v)}>
                {t("web.provider.settings.pages.billing/invoices/[id].submitEft")}
              </Button>
            )}
            {isOpen && amountDue > 0 && !canPay && (
              <p className="text-xs text-gray-500">
                {t("web.provider.settings.pages.billing/invoices/[id].ownerPaysOnly")}
              </p>
            )}
            {hasPendingEft && (
              <p className="text-xs text-amber-700">
                {t("web.provider.settings.pages.billing/invoices/[id].eftPending")}
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => void handleDownloadPdf()}
            >
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.settings.pages.billing/invoices/[id].download")}
            </Button>
          </div>
        </div>

        {showEft && canPay && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div>
              <Label>{t("web.provider.settings.pages.billing/invoices/[id].eftAmount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={eftAmount}
                onChange={(e) => setEftAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("web.provider.settings.pages.billing/invoices/[id].eftReference")}</Label>
              <Input value={eftReference} onChange={(e) => setEftReference(e.target.value)} />
            </div>
            <Button onClick={() => void handleSubmitEft()} disabled={submittingEft}>
              {submittingEft
                ? t("web.provider.settings.pages.billing/invoices/[id].submittingEft")
                : t("web.provider.settings.pages.billing/invoices/[id].confirmEft")}
            </Button>
          </div>
        )}

        {/* Invoice Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">{t("web.provider.settings.pages.billing/invoices/[id].billingPeriod")}</h3>
            <p className="text-sm">
              {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">{t("web.provider.settings.pages.billing.dueDate")}</h3>
            <p className="text-sm">{formatDate(invoice.due_date)}</p>
          </div>
        </div>

        {/* Line Items */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("web.provider.common.description")}</TableHead>
                <TableHead className="text-end">{t("web.provider.settings.pages.billing/invoices/[id].quantity")}</TableHead>
                <TableHead className="text-end">{t("web.provider.settings.pages.billing/invoices/[id].unitPrice")}</TableHead>
                <TableHead className="text-end">{t("web.provider.bookings.groupFinancials.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.line_items || []).map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-end">{item.quantity}</TableCell>
                  <TableCell className="text-end">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-end font-medium">
                    {formatCurrency(item.total_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full md:w-96 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t("web.provider.settings.pages.billing/invoices/[id].subtotal")}</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t("web.provider.settings.pages.billing/invoices/[id].taxRate", { rate: invoice.tax_rate })}</span>
              <span>{formatCurrency(invoice.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>{t("web.provider.settings.pages.billing/invoices/[id].total")}</span>
              <span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            {Number(invoice.amount_paid) > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-gray-600">{t("web.provider.settings.pages.billing/invoices/[id].amountPaid")}</span>
                <span className="text-green-600">{formatCurrency(invoice.amount_paid)}</span>
              </div>
            )}
            {amountDue > 0 && (
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>{t("web.provider.settings.pages.billing/invoices/[id].amountDue")}</span>
                <span>{formatCurrency(amountDue)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payments */}
        {invoice.payments && invoice.payments.length > 0 && (
          <div>
            <h3 className="font-semibold mb-4">{t("web.provider.settings.pages.billing/invoices/[id].paymentHistory")}</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("web.provider.common.date")}</TableHead>
                    <TableHead>{t("web.provider.common.amount")}</TableHead>
                    <TableHead>{t("web.provider.settings.pages.billing/invoices/[id].reference")}</TableHead>
                    <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.payment_reference || t("web.provider.common.hyphen")}</TableCell>
                      <TableCell>
                        <Badge variant={payment.status === "completed" ? "default" : "outline"}>
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">{t("web.provider.common.notes")}</h3>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}

        {/* Back Button */}
        <div className="flex justify-start">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.billing/invoices/[id].backToBilling")}
          </Button>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
