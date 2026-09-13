"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
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
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  notes: string | null;
  line_items: any[];
  payments: any[];
}

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const locale = useTenantLocaleTag();
  const { bundle } = useConfigBundle();
  const invoiceCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Invoice }>(
        `/api/provider/invoices/${invoiceId}`
      );
      setInvoice(response.data);
    } catch (error) {
      console.error("Error loading invoice:", error);
      toast.error(t("web.provider.settings.pages.billing/invoices/[id].failedToLoadInvoice"));
    } finally {
      setIsLoading(false);
    }
  };

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

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.billing/invoices/[id].invoiceDetails")}
        subtitle={t("web.provider.settings.pages.billing/invoices/[id].viewInvoiceInformation")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.billing/invoices/[id].loadingInvoice")} />
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
          <p className="text-gray-600">{t("web.provider.settings.pages.billing/invoices/[id].notFound")}</p>
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
          <div className="flex items-center gap-4">
            {getStatusBadge(invoice.status)}
            <Button
              variant="outline"
              onClick={() => window.open(`/api/provider/invoices/${invoiceId}/download`, "_blank")}
            >
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.settings.pages.billing/invoices/[id].download")}
            </Button>
          </div>
        </div>

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
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-gray-600">{t("web.provider.settings.pages.billing/invoices/[id].amountPaid")}</span>
                  <span className="text-green-600">{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>{t("web.provider.settings.pages.billing/invoices/[id].amountDue")}</span>
                  <span>{formatCurrency(invoice.amount_due)}</span>
                </div>
              </>
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
