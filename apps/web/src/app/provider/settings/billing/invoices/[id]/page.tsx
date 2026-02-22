"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
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
  const params = useParams();
  const router = useRouter();
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
      toast.error("Failed to load invoice");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-ZA", {
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
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Billing", href: "/provider/settings/billing" },
    { label: "Invoice" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Invoice Details"
        subtitle="View invoice information"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading invoice..." />
      </SettingsDetailLayout>
    );
  }

  if (!invoice) {
    return (
      <SettingsDetailLayout
        title="Invoice Details"
        subtitle="View invoice information"
        breadcrumbs={breadcrumbs}
      >
        <div className="text-center py-12">
          <p className="text-gray-600">Invoice not found</p>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Invoice Details"
      subtitle={`Invoice ${invoice.invoice_number}`}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-6">
        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <h2 className="text-2xl font-bold text-[#FF0077]">{invoice.invoice_number}</h2>
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
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">Billing Period</h3>
            <p className="text-sm">
              {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">Due Date</h3>
            <p className="text-sm">{formatDate(invoice.due_date)}</p>
          </div>
        </div>

        {/* Line Items */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoice.line_items || []).map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">
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
              <span className="text-gray-600">Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax ({invoice.tax_rate}%):</span>
              <span>{formatCurrency(invoice.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total:</span>
              <span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-gray-600">Amount Paid:</span>
                  <span className="text-green-600">{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Amount Due:</span>
                  <span>{formatCurrency(invoice.amount_due)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payments */}
        {invoice.payments && invoice.payments.length > 0 && (
          <div>
            <h3 className="font-semibold mb-4">Payment History</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.payment_date)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.payment_reference || "-"}</TableCell>
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
            <h3 className="font-semibold text-sm text-gray-600 mb-2">Notes</h3>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}

        {/* Back Button */}
        <div className="flex justify-start">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Billing
          </Button>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
