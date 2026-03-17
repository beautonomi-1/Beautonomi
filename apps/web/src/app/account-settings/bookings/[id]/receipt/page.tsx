"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Printer, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import AuthGuard from "@/components/auth/auth-guard";

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
  products: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  fees: number;
  discount: number;
  total: number;
  currency?: string;
  payment_status: string;
}

export default function ReceiptPage() {
  const params = useParams();
  const bookingId = params.id as string;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReceipt();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount when bookingId changes

  const loadReceipt = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ receipt: Receipt }>(
        `/api/bookings/${bookingId}/receipt`,
        { cache: "no-store" }
      );
      setReceipt(response.receipt);
    } catch (error) {
      console.error("Failed to load receipt:", error);
      toast.error("Failed to load receipt");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency || receipt?.currency || "ZAR",
    }).format(amount);
  };

  const handleDownload = () => {
    if (!receipt) return;
    const currency = receipt.currency || "ZAR";
    const fmt = (n: number) =>
      new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(n);
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    const items = [
      ...receipt.services.map((s) => ({ name: s.name, qty: s.quantity, price: s.price, total: s.total })),
      ...receipt.products.map((p) => ({ name: p.name, qty: p.quantity, price: p.price, total: p.total })),
    ];
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt #${receipt.booking_number}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333; }
    .header { border-bottom: 2px solid #FF0077; padding-bottom: 12px; margin-bottom: 20px; }
    .section { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 0; text-align: left; border-bottom: 1px solid #eee; }
    .text-right { text-align: right; }
    .total { font-weight: bold; font-size: 1.1em; margin-top: 12px; padding-top: 8px; border-top: 2px solid #333; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; color: #FF0077;">Receipt</h1>
    <p style="margin: 4px 0 0;">Booking #${receipt.booking_number}</p>
  </div>
  <div class="section">
    <p><strong>Customer:</strong> ${receipt.customer.full_name || "—"}<br>
    <strong>Provider:</strong> ${receipt.provider.business_name}</p>
    <p>Booking date: ${fmtDate(receipt.booking_date)}<br>Service date: ${fmtDate(receipt.service_date)}</p>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
    <tbody>
      ${items.map((i) => `<tr><td>${i.name}</td><td class="text-right">${i.qty}</td><td class="text-right">${fmt(i.price)}</td><td class="text-right">${fmt(i.total)}</td></tr>`).join("")}
    </tbody>
  </table>
  <div class="section">
    <p>Subtotal: ${fmt(receipt.subtotal)}</p>
    ${receipt.tax > 0 ? `<p>Tax: ${fmt(receipt.tax)}</p>` : ""}
    ${receipt.fees > 0 ? `<p>Platform fee: ${fmt(receipt.fees)}</p>` : ""}
    ${receipt.discount > 0 ? `<p>Discount: -${fmt(receipt.discount)}</p>` : ""}
    <p class="total">Total: ${fmt(receipt.total)}</p>
    <p>Payment status: ${receipt.payment_status}</p>
  </div>
  <div class="footer">
    <p>You can print this page or use your browser’s Print → Save as PDF.</p>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${receipt.booking_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded. Open the file or use Print → Save as PDF.");
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
          <p className="text-gray-500">Receipt not found</p>
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
    <AuthGuard>
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
              Download receipt
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <Card className="print:shadow-none print:border-0">
          <CardHeader className="text-center border-b pb-4">
            <CardTitle className="text-3xl">Receipt</CardTitle>
            <p className="text-gray-600 mt-2">Booking #{receipt.booking_number}</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Customer</h3>
                <p className="text-sm">{receipt.customer.full_name || "N/A"}</p>
                <p className="text-sm text-gray-600">{receipt.customer.email}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Provider</h3>
                <p className="text-sm">{receipt.provider.business_name}</p>
                {receipt.provider.owner_email && (
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

            {(receipt.services.length > 0 || receipt.products.length > 0) && (
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
                  <span>Tax</span>
                  <span>{formatCurrency(receipt.tax)}</span>
                </div>
              )}
              {receipt.fees > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Platform Fee</span>
                  <span>{formatCurrency(receipt.fees)}</span>
                </div>
              )}
              {receipt.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(receipt.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatCurrency(receipt.total)}</span>
              </div>
            </div>

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
                  {receipt.payment_status.charAt(0).toUpperCase() +
                    receipt.payment_status.slice(1)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}
