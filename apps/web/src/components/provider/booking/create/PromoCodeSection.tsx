"use client";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [input, setInput] = useState(discountCode);
  const [validating, setValidating] = useState(false);

  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code) {
      toast.error(t("web.promoSection.enterCode"));
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
        toast.error(body?.error?.message || t("web.promoSection.invalid"));
        return;
      }
      const amount = Math.max(0, Number(body?.data?.discount ?? 0));
      onApplied(code, amount);
      toast.success(t("web.promoSection.applied"));
    } catch {
      toast.error(t("web.promoSection.validateFailed"));
    } finally {
      setValidating(false);
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <Tag className="h-4 w-4" />
        {t("web.book.continue.promoCode")}
      </BookingSectionLabel>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder={t("web.book.continue.enterCode")}
          className="rounded-xl min-h-[44px] uppercase"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={validating}
          className="shrink-0 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold min-h-[44px] touch-manipulation disabled:opacity-50"
        >
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.apply")}
        </button>
      </div>
      {discountAmount > 0 && discountCode ? (
        <p className="text-xs text-emerald-700 mt-2">
          {t("web.promoSection.appliedLine", { code: discountCode, amount: discountAmount.toFixed(2) })}
          <button type="button" className="ms-2 underline" onClick={onClear}>
            {t("web.promoSection.remove")}
          </button>
        </p>
      ) : null}
    </BookingSectionCard>
  );
}
