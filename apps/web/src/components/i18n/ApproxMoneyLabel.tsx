"use client";

import { useTranslation } from "@beautonomi/i18n";
import { useDisplayMoney } from "@/hooks/useDisplayMoney";

type ApproxMoneyLabelProps = {
  amount: number;
  chargeCurrency?: string;
  displayCurrency?: string | null;
  className?: string;
  /** When true, show charge amount as primary and display as secondary ≈ line */
  showBoth?: boolean;
};

/** Browse-only indicative price with ≈ prefix when currencies differ. */
export function ApproxMoneyLabel({
  amount,
  chargeCurrency,
  displayCurrency,
  className,
  showBoth = true,
}: ApproxMoneyLabelProps) {
  const { t } = useTranslation();
  const { formattedCharge, formattedDisplay, approxLabel, loading, stale, chargeCurrency: charge, displayCurrency: display } =
    useDisplayMoney(amount, chargeCurrency, displayCurrency);

  const same = charge === display;

  if (same || !showBoth) {
    return <span className={className}>{formattedCharge}</span>;
  }

  return (
    <span className={className}>
      <span>{formattedCharge}</span>
      {!loading && formattedDisplay && approxLabel ? (
        <span className="text-muted-foreground text-sm ms-1" dir="ltr">
          ({approxLabel} {formattedDisplay})
          {stale ? <span className="text-amber-500 ms-1" title={t("web.ui.approxMoney.staleRate")}>⚠</span> : null}
        </span>
      ) : null}
    </span>
  );
}
