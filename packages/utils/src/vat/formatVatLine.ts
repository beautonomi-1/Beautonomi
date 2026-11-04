export type FormatVatLineInput = {
  amount: number;
  ratePercent: number;
  inclusive: boolean;
  registered: boolean;
  /** When inclusive unknown (legacy booking). */
  inclusiveUnknown?: boolean;
};

export type FormatVatLineResult = {
  show: boolean;
  labelKey: "vat.inclusive" | "vat.exclusive" | "vat.plain";
  ratePercent: number;
  amount: number;
};

/**
 * UI-neutral VAT line descriptor — apps map labelKey to i18n.
 */
export function formatVatLine(input: FormatVatLineInput): FormatVatLineResult {
  const amount = Math.max(0, Number(input.amount) || 0);
  const ratePercent = Math.max(0, Number(input.ratePercent) || 0);

  if (!input.registered || amount <= 0 || ratePercent <= 0) {
    return { show: false, labelKey: "vat.plain", ratePercent: 0, amount: 0 };
  }

  if (input.inclusiveUnknown) {
    return { show: true, labelKey: "vat.plain", ratePercent, amount };
  }

  if (input.inclusive) {
    return { show: true, labelKey: "vat.inclusive", ratePercent, amount };
  }

  return { show: true, labelKey: "vat.exclusive", ratePercent, amount };
}
