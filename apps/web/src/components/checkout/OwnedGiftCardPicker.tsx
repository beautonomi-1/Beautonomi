"use client";

import { formatMoney } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import type { GiftCardListRow } from "@/lib/checkout/filter-usable-gift-cards";

type Props = {
  cards: GiftCardListRow[];
  disabled?: boolean;
  currency: string;
  onSelect: (code: string) => void;
};

export function OwnedGiftCardPicker({ cards, disabled, currency, onSelect }: Props) {
  const { t } = useTranslation();
  if (cards.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">
        {t("checkout.yourGiftCredit")}
      </p>
      {cards.map((gc) => (
        <button
          key={gc.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(gc.code!.trim().toUpperCase())}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm hover:border-gray-300 disabled:opacity-60"
        >
          <span className="font-mono text-gray-900">{gc.code}</span>
          <span className="font-semibold text-primary">
            {formatMoney(Number(gc.balance ?? 0), gc.currency || currency)} ·{" "}
            {t("checkout.apply")}
          </span>
        </button>
      ))}
    </div>
  );
}
