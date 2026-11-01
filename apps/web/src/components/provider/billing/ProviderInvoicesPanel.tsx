"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetcher, FetchError, providerPortalFetch } from "@/lib/http/fetcher";
import { formatStatusLabel } from "@/lib/locale/status-label";
import { isProviderInvoicePayable } from "@/lib/invoices/provider-invoice-status";
import { Download, Eye, FileText, Loader2 } from "lucide-react";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type?: string;
  issue_date: string;
  due_date: string;
  period_start?: string;
  period_end?: string;
  total_amount: number;
  amount_due?: number;
  amount_paid?: number;
  currency?: string | null;
  status: string;
  effective_status?: string;
};

type BillingObligation = {
  id: string;
  kind: string;
  status: "due" | "paid" | "refunded";
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  pay_action: string;
  entity_id?: string | null;
};

type InvoicesPayload = {
  invoices: InvoiceRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  summary?: {
    paid_amount: number;
    outstanding_amount: number;
    overdue_count: number;
  };
  obligations?: BillingObligation[];
  obligations_summary?: {
    outstanding_total: number;
    due_count: number;
  };
};

function displayStatus(inv: InvoiceRow): string {
  return inv.effective_status ?? inv.status;
}

function rowAmountDue(inv: InvoiceRow): number {
  const stored = Number(inv.amount_due ?? NaN);
  if (Number.isFinite(stored)) return Math.max(0, stored);
  return Math.max(0, Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0));
}

export function ProviderInvoicesPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [data, setData] = useState<InvoicesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(tmr);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      if (debouncedQ) p.set("q", debouncedQ);
      const res = await fetcher.get<{ data: InvoicesPayload }>(
        `/api/provider/invoices?${p.toString()}`,
      );
      setData(res.data);
    } catch (err) {
      const msg =
        err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback");
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedQ, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (debouncedQ) p.set("q", debouncedQ);
    const qs = p.toString();
    return `/api/provider/invoices/export${qs ? `?${qs}` : ""}`;
  }, [status, debouncedQ]);

  const invoices = data?.invoices ?? [];
  const summary = data?.summary;
  const dueObligations = (data?.obligations ?? []).filter((o) => o.status === "due");

  const obligationHref = (o: BillingObligation): string | null => {
    switch (o.pay_action) {
      case "invoice_pay":
        return o.entity_id ? `/provider/settings/billing/invoices/${o.entity_id}` : null;
      case "subscription_pay":
      case "stripe_manage":
      case "apple_manage":
        return "/provider/subscription";
      case "terminal_pay":
        return "/provider/settings/sales/terminal-shop";
      case "payout_offset":
        return "/provider/finance";
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number, currency?: string | null) =>
    formatMoney(amount, currency?.trim() || LAST_RESORT_CURRENCY);

  const downloadInvoicePdf = async (invoiceId: string, invoiceNumber: string) => {
    const response = await providerPortalFetch(`/api/provider/invoices/${invoiceId}/download`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback"));
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const pdfWindow = window.open(url, "_blank");
    if (!pdfWindow) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoiceNumber || invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const response = await providerPortalFetch(exportHref, { credentials: "include" });
      if (!response.ok) {
        throw new Error(t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "provider-invoices.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError(t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback"));
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data && !error) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("web.provider.common.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!loading && invoices.length === 0 && status === "all" && !debouncedQ) {
    return (
      <EmptyState
        title={t("web.provider.settings.pages.billing.noInvoicesYet")}
        description={t("web.provider.settings.pages.billing.noInvoicesDescription")}
        icon={FileText}
      />
    );
  }

  return (
    <div className="space-y-4">
      {dueObligations.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-900">
            {t("web.provider.settings.pages.billing.obligationsDueHeading")}
          </p>
          <p className="text-xs text-gray-600">
            {t("web.provider.settings.pages.billing.obligationsDueHint")}
          </p>
          <ul className="divide-y divide-amber-100/80 rounded-md border border-amber-100 bg-white">
            {dueObligations.map((o) => {
              const href = obligationHref(o);
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{o.title}</p>
                    {o.description ? (
                      <p className="text-xs text-gray-500">{o.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(o.amount, o.currency)}</span>
                    {href ? (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <a href={href}>{t("web.provider.common.view")}</a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-3 text-sm">
            <p className="text-gray-500">{t("web.provider.settings.pages.billing.statOutstanding")}</p>
            <p className="text-lg font-semibold">{formatMoney(summary.outstanding_amount, LAST_RESORT_CURRENCY)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3 text-sm">
            <p className="text-gray-500">{t("web.provider.settings.pages.billing.statPaid")}</p>
            <p className="text-lg font-semibold">{formatMoney(summary.paid_amount, LAST_RESORT_CURRENCY)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3 text-sm">
            <p className="text-gray-500">{t("web.provider.settings.pages.billing.statOverdue")}</p>
            <p className="text-lg font-semibold">{summary.overdue_count}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Input
          className="max-w-md"
          placeholder={t("web.provider.settings.pages.billing.invoiceSearchPlaceholder")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("web.provider.common.allStatuses")}</SelectItem>
              <SelectItem value="open">{t("web.provider.settings.pages.billing.openInvoices")}</SelectItem>
              <SelectItem value="draft">{t("web.provider.settings.pages.billing.draft")}</SelectItem>
              <SelectItem value="sent">{t("web.provider.settings.pages.billing.sent")}</SelectItem>
              <SelectItem value="paid">{t("web.provider.settings.pages.billing.paid")}</SelectItem>
              <SelectItem value="partially_paid">{t("web.provider.settings.pages.billing.partiallyPaid")}</SelectItem>
              <SelectItem value="overdue">{t("web.provider.settings.pages.billing.overdue")}</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" disabled={exporting} onClick={() => void handleExportCsv()}>
            {exporting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="me-2 h-4 w-4" />
            )}
            {t("web.provider.settings.pages.billing.exportCsv")}
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        {t("web.provider.settings.pages.billing.invoiceCount", { count: data?.total ?? invoices.length })}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("web.provider.settings.pages.billing.invoiceNumber")}</TableHead>
              <TableHead>{t("web.provider.settings.pages.billing.issueDate")}</TableHead>
              <TableHead>{t("web.provider.settings.pages.billing.dueDate")}</TableHead>
              <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
              <TableHead className="text-end">{t("web.provider.settings.pages.billing.amountDue")}</TableHead>
              <TableHead className="text-end">{t("web.provider.common.amount")}</TableHead>
              <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const st = displayStatus(invoice);
              const payable = isProviderInvoicePayable(invoice);
              const due = payable ? rowAmountDue(invoice) : 0;
              const open =
                payable &&
                (st === "sent" || st === "partially_paid" || st === "overdue") &&
                due > 0;
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{new Date(invoice.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatusLabel(st)}</Badge>
                  </TableCell>
                  <TableCell className="text-end font-medium">
                    {open ? formatCurrency(due, invoice.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    {formatCurrency(invoice.total_amount, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void downloadInvoicePdf(invoice.id, invoice.invoice_number)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          window.location.href = `/provider/settings/billing/invoices/${invoice.id}`;
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {(data?.total_pages ?? 1) > 1 ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("web.provider.common.previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= (data?.total_pages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("web.provider.common.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
