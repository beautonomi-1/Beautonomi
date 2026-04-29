"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Printer, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/** Normalize `/api/bookings/.../receipt` JSON (flat `{ receipt }` vs `{ data: { receipt } }`). */
function unwrapReceiptResponse(body: unknown): Receipt | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if ("receipt" in o && o.receipt && typeof o.receipt === "object") {
    return o.receipt as Receipt;
  }
  const data = o.data;
  if (data && typeof data === "object" && "receipt" in (data as object)) {
    return (data as { receipt: Receipt }).receipt;
  }
  if ("booking_number" in o) {
    return o as unknown as Receipt;
  }
  return null;
}

interface Receipt {
  booking_number: string;
  booking_date: string;
  service_date: string;
  customer: {
    full_name: string | null;
    email: string;
  };
  provider: {
    business_name: string;
    owner_email: string | null;
    address: { line1?: string; line2?: string; city?: string; state?: string; country?: string; postal_code?: string } | null;
  };
  services: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  addons?: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  products: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  tax_rate?: number;
  /** Platform / service fee */
  fees: number;
  travel_fee?: number;
  tip_amount?: number;
  cancellation_fee?: number;
  discount: number;
  discount_reason?: string | null;
  total: number;
  currency?: string;
  payment_status: string;
  amount_paid?: number;
  balance_due?: number;
  deposit_required?: boolean;
  deposit_amount?: number;
  deposit_percentage?: number;
  payment_option?: string;
  additional_charges?: Array<{
    id: string;
    description: string;
    amount: number;
    status: string;
    paid_at?: string | null;
  }>;
  receipt_header?: string | null;
  receipt_footer?: string | null;
}

export default function ReceiptPage() {
  const params = useParams();
  const bookingId = params.id as string;
  const locale = useTenantLocaleTag();
  const { bundle } = useConfigBundle();
  const tenantCurrencyFallback =
    bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadReceipt();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount when bookingId changes

  const loadReceipt = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      // staleTimeMs: 0 — never reuse a cached GET; receipt + auth must be fresh.
      const response = await fetcher.get<unknown>(`/api/bookings/${bookingId}/receipt`, {
        cache: "no-store",
        staleTimeMs: 0,
      });
      const receiptData = unwrapReceiptResponse(response);
      setReceipt(receiptData?.booking_number ? receiptData : null);
    } catch (error) {
      console.error("Failed to load receipt:", error);
      if (error instanceof FetchError) {
        if (error.status === 403) {
          setErrorMessage("You don't have permission to view this receipt.");
          toast.error("Access denied");
        } else if (error.status === 404) {
          setErrorMessage("Receipt not found. The booking may not exist or has been removed.");
          toast.error("Receipt not found");
        } else {
          setErrorMessage(error.message || "Something went wrong loading the receipt.");
          toast.error("Failed to load receipt");
        }
      } else {
        setErrorMessage("An unexpected error occurred. Please try again.");
        toast.error("Failed to load receipt");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || receipt?.currency || tenantCurrencyFallback,
    }).format(amount);
  };

  const handleDownload = async () => {
    if (!receipt) return;
    try {
      const response = await fetch(`/api/bookings/${bookingId}/receipt/pdf`);
      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${receipt.booking_number || bookingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("PDF receipt downloaded.");
    } catch (error) {
      console.error("Failed to download PDF:", error);
      toast.error("Failed to download receipt. Please try again.");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading receipt..." />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-500">{errorMessage || "Receipt not found"}</p>
          <Link href={`/account-settings/bookings/${bookingId}`}>
            <Button variant="outline" className="mt-4">
              Back to Booking
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/60 via-white to-slate-50 px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="container mx-auto max-w-4xl print:max-w-none print:p-0">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <Link href={`/account-settings/bookings/${bookingId}`}>
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Booking
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white/95 shadow-xl shadow-rose-100/40 print:rounded-none print:border-0 print:bg-white print:shadow-none">
          <CardHeader className="border-b border-slate-100 bg-slate-950 px-8 py-8 text-white print:bg-white print:px-0 print:py-3 print:text-slate-950">
            {receipt.receipt_header && (
              <p className="mx-auto mb-5 max-w-2xl whitespace-pre-line text-center text-sm text-slate-300 print:text-slate-500">{receipt.receipt_header}</p>
            )}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between print:flex-row print:items-end print:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-300 print:text-rose-700">Beautonomi</p>
                <CardTitle className="text-4xl font-semibold tracking-tight print:text-3xl">Receipt</CardTitle>
                <p className="text-sm text-slate-300 print:text-slate-600">Booking #{receipt.booking_number}</p>
              </div>
              <Badge
                className={
                  receipt.payment_status === "paid"
                    ? "w-fit border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800"
                    : receipt.payment_status === "pending"
                    ? "w-fit border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800"
                    : "w-fit border border-red-200 bg-red-50 px-3 py-1 text-red-800"
                }
              >
                {receipt.payment_status === "paid" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {(receipt.payment_status || "pending").charAt(0).toUpperCase() +
                  (receipt.payment_status || "pending").slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-7 p-8 print:p-0 print:pt-5">
            <div className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 print:rounded-lg print:bg-white">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</h3>
                <p className="text-sm font-semibold text-slate-950">{receipt.customer?.full_name || "N/A"}</p>
                <p className="text-sm text-slate-600">{receipt.customer?.email || ""}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 print:rounded-lg print:bg-white">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</h3>
                <p className="text-sm font-semibold text-slate-950">{receipt.provider?.business_name || "Provider"}</p>
                {receipt.provider?.owner_email && (
                  <p className="text-sm text-slate-600">{receipt.provider.owner_email}</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 print:rounded-lg print:bg-white">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dates</h3>
                <p className="text-sm text-slate-600">Booked <span className="font-semibold text-slate-950">{formatDate(receipt.booking_date)}</span></p>
                <p className="text-sm text-slate-600">Service <span className="font-semibold text-slate-950">{formatDate(receipt.service_date)}</span></p>
              </div>
            </div>

            {(receipt.services.length > 0 || (receipt.addons?.length ?? 0) > 0 || receipt.products.length > 0) && (
              <div className="rounded-2xl border border-slate-200 print:rounded-lg">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 print:bg-white">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Items</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {receipt.services.map((service, index) => (
                    <div key={index} className="flex items-start justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-medium text-slate-950">{service.name}</p>
                        <p className="text-sm text-slate-500">
                          Quantity: {service.quantity} × {formatCurrency(service.price)}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-950">{formatCurrency(service.total)}</p>
                    </div>
                  ))}
                  {(receipt.addons ?? []).map((addon, index) => (
                    <div key={`addon-${index}`} className="flex items-start justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-medium text-slate-950">Add-on: {addon.name}</p>
                        <p className="text-sm text-slate-500">
                          Quantity: {addon.quantity} × {formatCurrency(addon.price)}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-950">{formatCurrency(addon.total)}</p>
                    </div>
                  ))}
                  {receipt.products.map((product, index) => (
                    <div key={index} className="flex items-start justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-medium text-slate-950">{product.name}</p>
                        <p className="text-sm text-slate-500">
                          Quantity: {product.quantity} × {formatCurrency(product.price)}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-950">{formatCurrency(product.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ml-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:rounded-lg print:shadow-none">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span>{formatCurrency(receipt.subtotal)}</span>
              </div>
              {(receipt.travel_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Travel fee</span>
                  <span>{formatCurrency(receipt.travel_fee!)}</span>
                </div>
              )}
              {receipt.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax{receipt.tax_rate ? ` (${receipt.tax_rate}%)` : ""}</span>
                  <span>{formatCurrency(receipt.tax)}</span>
                </div>
              )}
              {(receipt.fees ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Service / platform fee</span>
                  <span>{formatCurrency(receipt.fees)}</span>
                </div>
              )}
              {(receipt.tip_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tip</span>
                  <span>{formatCurrency(receipt.tip_amount!)}</span>
                </div>
              )}
              {(receipt.cancellation_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-amber-800">
                  <span>Cancellation fee (retained)</span>
                  <span>{formatCurrency(receipt.cancellation_fee!)}</span>
                </div>
              )}
              {receipt.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount{receipt.discount_reason ? ` (${receipt.discount_reason})` : ""}</span>
                  <span>-{formatCurrency(receipt.discount)}</span>
                </div>
              )}
              <div className="mt-3 flex justify-between border-t pt-3 text-lg font-bold text-slate-950">
                <span>Total</span>
                <span>{formatCurrency(receipt.total)}</span>
              </div>
              {receipt.deposit_required && receipt.payment_option === "deposit" && (
                <div className="pt-2 border-t border-dashed space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Deposit{receipt.deposit_percentage ? ` (${receipt.deposit_percentage}%)` : ""}</span>
                    <span>{formatCurrency(receipt.deposit_amount || 0)}</span>
                  </div>
                </div>
              )}
              {(receipt.amount_paid ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(receipt.amount_paid!)}</span>
                </div>
              )}
              {(receipt.balance_due ?? 0) > 0 && (
                <div className="flex justify-between text-sm font-semibold text-red-700">
                  <span>Balance Due</span>
                  <span>{formatCurrency(receipt.balance_due!)}</span>
                </div>
              )}
            </div>

            {(receipt.additional_charges?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-slate-200 p-5 print:rounded-lg">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Additional Charges</h3>
                <div className="space-y-3">
                  {receipt.additional_charges!.map((charge) => (
                    <div key={charge.id}>
                      <div className="flex justify-between gap-4 text-sm">
                        <span>{charge.description}</span>
                        <div className="flex items-center gap-2">
                          <span>{formatCurrency(charge.amount)}</span>
                          <Badge variant="outline" className={`text-xs ${charge.status === "paid" ? "bg-green-50 text-green-700 border-green-200" : ""}`}>
                            {charge.status}
                          </Badge>
                        </div>
                      </div>
                      {charge.paid_at && (
                        <p className="text-xs text-gray-500 mt-0.5">Paid on {new Date(charge.paid_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm text-rose-950 print:rounded-lg print:bg-white">
              This receipt is generated from Beautonomi booking and payment records. Keep it for your personal payment history.
            </div>
          </CardContent>
          {receipt.receipt_footer && (
            <div className="border-t border-slate-100 bg-slate-50 px-8 py-5 text-center text-xs text-slate-500 whitespace-pre-line print:bg-white">
              {receipt.receipt_footer}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
