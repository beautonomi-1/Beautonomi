"use client";

import { useState } from "react";
import { Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

interface PromoCodeSectionProps {
  subtotal: number;
  discountCode: string;
  discountAmount: number;
  onApplied: (code: string, amount: number) => void;
  onClear: () => void;
}

export function PromoCodeSection({
  subtotal,
  discountCode,
  discountAmount,
  onApplied,
  onClear,
}: PromoCodeSectionProps) {
  const [input, setInput] = useState(discountCode);
  const [validating, setValidating] = useState(false);

  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code) {
      toast.error("Enter a promo code");
      return;
    }
    setValidating(true);
    try {
      const res = await providerPortalFetch(
        `/api/provider/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`,
      );
      const body = (await res.json().catch(() => null)) as {
        data?: { discount?: number; valid?: boolean };
        error?: { message?: string };
      } | null;
      if (!res.ok || body?.data?.valid === false) {
        toast.error(body?.error?.message || "Invalid promo code");
        return;
      }
      const amount = Math.max(0, Number(body?.data?.discount ?? 0));
      onApplied(code, amount);
      toast.success("Promo applied");
    } catch {
      toast.error("Could not validate promo code");
    } finally {
      setValidating(false);
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <Tag className="h-4 w-4" />
        Promo code
      </BookingSectionLabel>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Enter code"
          className="rounded-xl min-h-[44px] uppercase"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={validating}
          className="shrink-0 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold min-h-[44px] touch-manipulation disabled:opacity-50"
        >
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
        </button>
      </div>
      {discountAmount > 0 && discountCode ? (
        <p className="text-xs text-emerald-700 mt-2">
          {discountCode} applied (−{discountAmount.toFixed(2)})
          <button type="button" className="ml-2 underline" onClick={onClear}>
            Remove
          </button>
        </p>
      ) : null}
    </BookingSectionCard>
  );
}
