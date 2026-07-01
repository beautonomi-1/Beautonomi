/**
 * Cancellation Policy Copy Builder
 *
 * Single source of truth for all customer-facing cancellation policy text.
 * Framework-agnostic: accepts a translation function + currency formatter,
 * returns typed lines that each surface renders with its own styling.
 *
 * All refund copy is explicit about wallet / store credit, matching the actual
 * enforced behaviour in refund-processing.ts: refunds are always credited to the
 * customer's Beautonomi wallet, capped at amounts already paid.
 */

/** Client-facing cancellation policy shape (maps from the booking-holds API or cancellation-policy API). */
export interface CancellationPolicyView {
  /** Hours before appointment within which free cancellation is allowed (null = no free window). */
  cancellationWindowHours?: number | null;
  /** Minutes after booking was placed during which cancel is always free (grace period). */
  graceWindowMinutes?: number | null;
  /**
   * Percentage (0–100) of the booking total that will be credited to the wallet on late cancel.
   * 0 = no refund. 100 = full refund (same as free window, but triggered in late window).
   * null / undefined = treat as 100 (no material policy).
   */
  lateRefundPercentage?: number | null;
  /** True when the provider has a no-show fee configured. */
  noShowFeeEnabled?: boolean | null;
  /** Amount charged as a no-show fee (only meaningful when noShowFeeEnabled is true). */
  noShowFeeAmount?: number | null;
  /** Currency code for formatting monetary amounts. */
  currency?: string | null;
  /** Raw provider-configured policy text (shown as a secondary note, not used for ack gating). */
  policyText?: string | null;
}

export type PolicyLineTone = "good" | "warn" | "info";

export interface CancellationPolicyLine {
  id: string;
  tone: PolicyLineTone;
  text: string;
}

export interface CancellationPolicyContent {
  /** Ordered lines describing the policy (grace, window, late, no-show). */
  lines: CancellationPolicyLine[];
  /** Whether the customer must explicitly acknowledge this policy before booking. */
  requiresAck: boolean;
  /** Checkbox label the customer must agree to. */
  ackText: string;
  /** Small footer note: "enforced automatically…" */
  footerText: string;
  /** Disclosure note about wallet/store-credit refunds. */
  storeCreditNote: string;
}

type TFunc = (key: string, opts?: Record<string, string | number>) => string;
type FormatCurrencyFunc = (amount: number, currency: string) => string;

function defaultFmt(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * Returns true when the policy has material terms the customer must acknowledge.
 * Mirrors the logic in apps/web/src/app/book/continue/page.tsx `cancellationPolicyRequiresCustomerAck`.
 * Intentionally ignores policyText (a duplicate of structured fields that caused spurious ack gates).
 */
export function cancellationRequiresAck(view: CancellationPolicyView | null | undefined): boolean {
  if (!view) return false;
  const latePct = view.lateRefundPercentage;
  const showLateLine =
    latePct !== undefined &&
    latePct !== null &&
    !Number.isNaN(Number(latePct)) &&
    Number(latePct) < 100;
  const noShowFee =
    Boolean(view.noShowFeeEnabled) &&
    view.noShowFeeAmount != null &&
    Number(view.noShowFeeAmount) > 0;
  return !!(
    view.cancellationWindowHours ||
    (view.graceWindowMinutes != null && view.graceWindowMinutes > 0) ||
    noShowFee ||
    showLateLine
  );
}

/**
 * Builds all customer-facing cancellation policy copy from a `CancellationPolicyView`.
 *
 * @param view   - The normalised policy view (from hold API or cancellation-policy API).
 * @param opts.t - i18next `t` function scoped to the translation namespace.
 * @param opts.formatCurrency - Currency formatter (e.g. `formatCurrency(amount, currency)`).
 */
export function buildCancellationPolicyLines(
  view: CancellationPolicyView | null | undefined,
  opts?: {
    t?: TFunc;
    formatCurrency?: FormatCurrencyFunc;
  }
): CancellationPolicyContent {
  const t = opts?.t ?? ((key: string) => key);
  const fmt = opts?.formatCurrency ?? defaultFmt;
  const lines: CancellationPolicyLine[] = [];

  const empty: CancellationPolicyContent = {
    lines,
    requiresAck: false,
    ackText: "",
    footerText: "",
    storeCreditNote: "",
  };

  if (!view) return empty;

  const graceMin = view.graceWindowMinutes;
  const windowHrs = view.cancellationWindowHours;
  const latePct = view.lateRefundPercentage;
  const currency = view.currency ?? "ZAR";

  // ── Grace period ──────────────────────────────────────────────────────────
  if (graceMin != null && graceMin > 0) {
    lines.push({
      id: "grace",
      tone: "good",
      text: t("checkout.graceCancellation", { count: graceMin }),
    });
  }

  // ── Free cancellation window ──────────────────────────────────────────────
  if (windowHrs != null && windowHrs > 0) {
    const hourWord = windowHrs === 1 ? t("checkout.hour") : t("checkout.hours");
    lines.push({
      id: "window",
      tone: "good",
      text: t("checkout.freeCancellation", { count: windowHrs, hourWord }),
    });
  }

  // ── Late cancellation refund ──────────────────────────────────────────────
  const showLateLine =
    latePct !== undefined &&
    latePct !== null &&
    !Number.isNaN(Number(latePct)) &&
    Number(latePct) < 100;

  if (showLateLine) {
    const pct = Math.round(Number(latePct));
    const hrs = windowHrs;
    const hourWord =
      hrs != null && hrs > 0 ? (hrs === 1 ? t("checkout.hour") : t("checkout.hours")) : "";

    let lateText: string;
    if (hrs != null && hrs > 0) {
      lateText =
        pct <= 0
          ? t("checkout.lateCancellationWithinWindowNoRefund", { hours: hrs, hourWord })
          : t("checkout.lateCancellationWithinWindowRefund", { hours: hrs, hourWord, percent: pct });
    } else {
      lateText =
        pct <= 0
          ? t("checkout.noRefundOnCancellation")
          : t("checkout.lateCancellationRefund", { percent: pct });
    }

    lines.push({ id: "late", tone: "warn", text: lateText });
  }

  // ── No-show fee ───────────────────────────────────────────────────────────
  const noShowFee =
    Boolean(view.noShowFeeEnabled) &&
    view.noShowFeeAmount != null &&
    Number(view.noShowFeeAmount) > 0;

  if (noShowFee) {
    lines.push({
      id: "no-show",
      tone: "warn",
      text: t("checkout.noShowFeeApplies", {
        amount: fmt(view.noShowFeeAmount!, currency),
      }),
    });
  }

  return {
    lines,
    requiresAck: cancellationRequiresAck(view),
    ackText: t("checkout.acceptCancellationPolicy"),
    footerText: t("checkout.policyEnforcedAutomatically"),
    storeCreditNote: t("checkout.refundsStoreCreditNote"),
  };
}
