import { normalizeCurrencyCode } from "@beautonomi/utils";
import {
  DISPLAY_CURRENCY_STORAGE_KEY,
  displayCurrencyCookieHeader,
} from "@/lib/locale/display-currency-cookie";

/** Persist guest display currency in localStorage + bt_display_currency cookie. */
export function persistClientDisplayCurrency(currency: string): string {
  const code = normalizeCurrencyCode(currency);
  if (typeof window === "undefined") return code;
  localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, code);
  document.cookie = displayCurrencyCookieHeader(code);
  window.dispatchEvent(
    new CustomEvent("beautonomi:preferred-display-currency-changed", { detail: { currency: code } }),
  );
  return code;
}
