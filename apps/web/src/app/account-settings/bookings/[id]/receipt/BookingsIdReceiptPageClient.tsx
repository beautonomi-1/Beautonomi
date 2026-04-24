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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
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

        <Card className="print:shadow-none print:border-0">
          <CardHeader className="text-center border-b pb-4">
            {receipt.receipt_header && (
              <p className="text-sm text-gray-500 whitespace-pre-line mb-2">{receipt.receipt_header}</p>
            )}
            <CardTitle className="text-3xl">Receipt</CardTitle>
            <p className="text-gray-600 mt-2">Booking #{receipt.booking_number}</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Customer</h3>
                <p className="text-sm">{receipt.customer?.full_name || "N/A"}</p>
                <p className="text-sm text-gray-600">{receipt.customer?.email || ""}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Provider</h3>
                <p className="text-sm">{receipt.provider?.business_name || "Provider"}</p>
                {receipt.provider?.owner_email && (
                  <p className="text-sm text-gray-600">{receipt.provider.owner_email}</p>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Booking Date:</span>
                  <p className="font-medium">{formatDate(receipt.booking_date)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Service Date:</span>
                  <p className="font-medium">{formatDate(receipt.service_date)}</p>
                </div>
              </div>
            </div>

            {(receipt.services.length > 0 || (receipt.addons?.length ?? 0) > 0 || receipt.products.length > 0) && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Items</h3>
                <div className="space-y-4">
                  {receipt.services.map((service, index) => (
                    <div key={index} className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-sm text-gray-600">
                          Quantity: {service.quantity} × {formatCurrency(service.price)}
                        </p>
                      </div>
                      <p className="font-medium">{formatCurrency(service.total)}</p>
                    </div>
                  ))}
                  {(receipt.addons ?? []).map((addon, index) => (
                    <div key={`addon-${index}`} className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">Add-on: {addon.name}</p>
                        <p className="text-sm text-gray-600">
                          Quantity: {addon.quantity} × {formatCurrency(addon.price)}
                        </p>
                      </div>
                      <p className="font-medium">{formatCurrency(addon.total)}</p>
                    </div>
                  ))}
                  {receipt.products.map((product, index) => (
                    <div key={index} className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-gray-600">
                          Quantity: {product.quantity} × {formatCurrency(product.price)}
                        </p>
                      </div>
                      <p className="font-medium">{formatCurrency(product.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatCurrency(receipt.subtotal)}</span>
              </div>
              {receipt.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tax{receipt.tax_rate ? ` (${receipt.tax_rate}%)` : ""}</span>
                  <span>{formatCurrency(receipt.tax)}</span>
                </div>
              )}
              {(receipt.fees ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Service / platform fee</span>
                  <span>{formatCurrency(receipt.fees)}</span>
                </div>
              )}
              {(receipt.travel_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Travel fee</span>
                  <span>{formatCurrency(receipt.travel_fee!)}</span>
                </div>
              )}
              {(receipt.tip_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tip</span>
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
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
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
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2 text-sm">Additional Charges</h3>
                <div className="space-y-2">
                  {receipt.additional_charges!.map((charge) => (
                    <div key={charge.id}>
                      <div className="flex justify-between text-sm">
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

            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Payment Status:</span>
                <Badge
                  className={
                    receipt.payment_status === "paid"
                      ? "bg-green-100 text-green-800"
                      : receipt.payment_status === "pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }
                >
                  {receipt.payment_status === "paid" && (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  )}
                  {(receipt.payment_status || "pending").charAt(0).toUpperCase() +
                    (receipt.payment_status || "pending").slice(1)}
                </Badge>
              </div>
            </div>
          </CardContent>
          {receipt.receipt_footer && (
            <div className="border-t px-6 py-4 text-center text-xs text-gray-500 whitespace-pre-line">
              {receipt.receipt_footer}
            </div>
          )}
        </Card>
      </div>
  );
}
