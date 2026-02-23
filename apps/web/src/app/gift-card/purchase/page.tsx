"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar4 from "@/components/global/Navbar4";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { toast } from "sonner";

export default function GiftCardPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState("500");
  const [quantity, setQuantity] = useState("1");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { enabled: giftCardsEnabled, loading: flagsLoading } = useFeatureFlag("gift_cards");

  // Check if coming from bulk purchase link
  useEffect(() => {
    if (searchParams.get("bulk") === "true") {
      setIsBulkMode(true);
    }
  }, [searchParams]);

  const submit = async () => {
    const amt = Number(amount);
    const qty = Number(quantity);
    
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) {
      toast.error("Enter a valid quantity (1-1000)");
      return;
    }
    
    try {
      setIsSubmitting(true);
      const res = await fetcher.post<{ data: { payment_url: string }; error: null }>(`/api/public/gift-cards/purchase`, {
        amount: amt,
        quantity: qty,
        recipient_email: recipientEmail.trim() ? recipientEmail.trim() : null,
      });
      const url = res?.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.success("Purchase started. Check your Payments & Gift Cards.");
      router.push("/account-settings/payments");
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to start purchase");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const totalAmount = Number(amount) * Number(quantity) || 0;

  if (!flagsLoading && !giftCardsEnabled) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar4 />
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Gift cards are currently unavailable</h2>
            <p className="text-gray-600 mb-4">This feature is temporarily disabled. Please check back later.</p>
            <Button asChild variant="outline">
              <Link href="/">Return home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar4 />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-semibold">
            {isBulkMode ? "Buy gift cards in bulk" : "Buy a gift card"}
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkMode(!isBulkMode)}
            className="text-sm"
          >
            {isBulkMode ? "Single purchase" : "Bulk purchase"}
          </Button>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          {isBulkMode 
            ? "Purchase multiple gift cards at once. Perfect for businesses and bulk orders."
            : "Pay securely, then you'll receive a gift card code."}
        </p>

        <div className="border rounded-lg p-6 space-y-4">
          <div>
            <Label htmlFor="amount" className="text-sm font-medium mb-1 block">
              Amount per card (ZAR)
            </Label>
            <Input 
              id="amount"
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              inputMode="decimal" 
              placeholder="e.g. 500" 
            />
          </div>
          
          {isBulkMode && (
            <div>
              <Label htmlFor="quantity" className="text-sm font-medium mb-1 block">
                Quantity
              </Label>
              <Input 
                id="quantity"
                type="number"
                min="1"
                max="1000"
                value={quantity} 
                onChange={(e) => setQuantity(e.target.value)} 
                placeholder="e.g. 10" 
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum 1000 cards per order. For larger orders, contact sales.
              </p>
            </div>
          )}
          
          {isBulkMode && Number(quantity) > 1 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total amount:</span>
                <span className="text-lg font-bold text-gray-900">
                  ZAR {totalAmount.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {quantity} cards × ZAR {Number(amount).toLocaleString()} = ZAR {totalAmount.toLocaleString()}
              </p>
            </div>
          )}
          
          <div>
            <Label htmlFor="recipient" className="text-sm font-medium mb-1 block">
              Recipient email {isBulkMode ? "(optional - for single recipient)" : "(optional)"}
            </Label>
            <Input 
              id="recipient"
              type="email"
              value={recipientEmail} 
              onChange={(e) => setRecipientEmail(e.target.value)} 
              placeholder="friend@example.com" 
            />
            {isBulkMode && (
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to receive all gift card codes yourself, or enter an email to send codes to a single recipient.
              </p>
            )}
          </div>

          <Button onClick={submit} disabled={isSubmitting} className="w-full bg-gray-900 text-white">
            {isSubmitting ? "Redirecting..." : `Continue to payment${isBulkMode && Number(quantity) > 1 ? ` (ZAR ${totalAmount.toLocaleString()})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

