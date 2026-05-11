"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar4 from "@/components/global/Navbar4";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { toast } from "sonner";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import LoginModal from "@/components/global/login-modal";
import { useAuth } from "@/providers/AuthProvider";

type GiftCardTemplate = {
  id: string;
  name: string;
  description?: string;
  image_url: string;
  denominations: number[];
  category?: string;
  currency?: string;
  custom_amount?: { min: number; max: number };
};

function unwrapTemplatesPayload(res: unknown): GiftCardTemplate[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const inner = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : r;
  return Array.isArray(inner.templates) ? (inner.templates as GiftCardTemplate[]) : [];
}

export default function GiftCardPurchasePage() {
  const { currencyCode, format: fmt } = useReportCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [amount, setAmount] = useState("500");
  const [quantity, setQuantity] = useState("1");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [templates, setTemplates] = useState<GiftCardTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const { enabled: giftCardsEnabled, loading: flagsLoading } = useFeatureFlag("gift_cards");

  // Check if coming from bulk purchase link
  useEffect(() => {
    if (searchParams.get("bulk") === "true") {
      setIsBulkMode(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      try {
        setTemplatesLoading(true);
        const raw = await fetcher.get<unknown>("/api/public/gift-cards/marketplace", { staleTimeMs: 300000 });
        if (cancelled) return;
        const nextTemplates = unwrapTemplatesPayload(raw);
        setTemplates(nextTemplates);
        const initialTemplate =
          nextTemplates.find((t) => t.id === searchParams.get("template_id")) ||
          nextTemplates[0] ||
          null;
        setSelectedTemplateId(initialTemplate?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof FetchError ? error.message : "Failed to load gift card designs");
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? templates[0] ?? null;
  const selectedCurrency = selectedTemplate?.currency || currencyCode;
  const denominations = selectedTemplate?.denominations ?? [];
  const hasCustomAmount = Boolean(selectedTemplate?.custom_amount);

  useEffect(() => {
    if (!selectedTemplate) return;
    const firstDenomination = selectedTemplate.denominations[0];
    const minCustomAmount = selectedTemplate.custom_amount?.min;
    const nextAmount = firstDenomination ?? minCustomAmount;
    if (typeof nextAmount === "number" && Number.isFinite(nextAmount)) {
      setAmount(String(nextAmount));
    }
  }, [selectedTemplate?.id]);

  const submit = async () => {
    if (authLoading) return;
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    const amt = Number(amount);
    const qty = Number(quantity);
    
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const customAmount = selectedTemplate?.custom_amount;
    const matchesPreset = denominations.includes(amt);
    if (customAmount && !matchesPreset && (amt < customAmount.min || amt > customAmount.max)) {
      toast.error(`Enter an amount between ${fmt(customAmount.min)} and ${fmt(customAmount.max)}`);
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
        template_id: selectedTemplate?.id || undefined,
        template_name: selectedTemplate?.name || undefined,
        template_image_url: selectedTemplate?.image_url || undefined,
        source: isBulkMode ? "gift_card_bulk_purchase" : "gift_card_purchase",
        campaign_id: searchParams.get("campaign_id") || undefined,
        utm_source: searchParams.get("utm_source") || undefined,
        utm_medium: searchParams.get("utm_medium") || undefined,
        utm_campaign: searchParams.get("utm_campaign") || undefined,
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
            : "Choose a design, pick an amount, pay securely, then receive a gift card code."}
        </p>

        <div className="border rounded-lg p-6 space-y-4">
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Choose a design</h2>
              <p className="text-xs text-gray-500">Designs and values are managed in the gift card CMS.</p>
            </div>
            {templatesLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2].map((item) => (
                  <div key={item} className="h-36 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : templates.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((template) => {
                  const selected = template.id === selectedTemplate?.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        selected ? "border-gray-900 ring-2 ring-gray-900" : "border-gray-200 hover:border-gray-400"
                      }`}
                      aria-pressed={selected}
                    >
                      <div className="relative aspect-[3/2] bg-gray-100">
                        <Image
                          src={template.image_url}
                          alt={template.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-gray-900">{template.name}</p>
                        {template.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{template.description}</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Gift card designs are not configured yet. You can still choose an amount below.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <Label htmlFor="amount" className="text-sm font-semibold text-gray-900">
              Amount per card ({selectedCurrency})
            </Label>
            {denominations.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {denominations.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(String(value))}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      Number(amount) === value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-800 hover:border-gray-900"
                    }`}
                  >
                    {fmt(value)}
                  </button>
                ))}
              </div>
            ) : null}
            {hasCustomAmount || denominations.length === 0 ? (
              <div>
                <Input
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 500"
                />
                {selectedTemplate?.custom_amount ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Custom amount: {fmt(selectedTemplate.custom_amount.min)} to {fmt(selectedTemplate.custom_amount.max)}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
          
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
                  {fmt(totalAmount)}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {quantity} cards × {fmt(Number(amount))} = {fmt(totalAmount)}
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

          <Button onClick={submit} disabled={authLoading || templatesLoading || isSubmitting} className="w-full bg-gray-900 text-white">
            {authLoading
              ? "Checking account..."
              : templatesLoading
                ? "Loading designs..."
              : isSubmitting
                ? "Redirecting..."
                : `Continue to payment${isBulkMode && Number(quantity) > 1 ? ` (${fmt(totalAmount)})` : ""}`}
          </Button>
        </div>
      </div>
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
        redirectContext="customer"
        onAuthSuccess={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}

