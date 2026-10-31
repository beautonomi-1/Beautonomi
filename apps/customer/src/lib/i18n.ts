import {
  buildFormatLocale,
  coerceMobileUiLanguage,
  ensureLocaleResources,
  getLanguageDirection,
  i18n,
  initI18n,
  isReviewedUiLanguage,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguageCode,
  setExtraLocaleLoader,
} from "@beautonomi/i18n";
import { loadNativeLocaleMessages } from "@beautonomi/i18n/load-locale-native";
import { setDefaultMoneyLocale } from "@beautonomi/utils";
import * as Localization from "expo-localization";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSettings, I18nManager } from "react-native";
import { getTenantRegionCode } from "@/lib/config-bundle";

const BOOT_LOCALE = "en";

function syncMoneyLocale(code: string) {
  setDefaultMoneyLocale(buildFormatLocale(code, getTenantRegionCode()));
}

/**
 * Align the native layout direction with `code`.
 * Returns `true` when the desired direction differs from the current native
 * layout — `I18nManager.forceRTL` only takes effect on the next native launch,
 * so callers must reload the app (see `reloadForDirectionChange`).
 */
function syncRtl(code: string): boolean {
  const rtl = getLanguageDirection(code) === "rtl";
  const changed = I18nManager.isRTL !== rtl;
  if (changed) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
  return changed;
}

function applyMobileLanguage(code: string): void {
  const effective = coerceMobileUiLanguage(code);
  if (effective === BOOT_LOCALE) {
    syncMoneyLocale(effective);
    syncRtl(effective);
    return;
  }
  void ensureLocaleResources(i18n, effective).then(() => {
    void i18n.changeLanguage(effective);
    syncMoneyLocale(effective);
    syncRtl(effective);
  });
}

setExtraLocaleLoader(loadNativeLocaleMessages);

initI18n(BOOT_LOCALE);
syncMoneyLocale(BOOT_LOCALE);

AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then(async (saved) => {
    const deviceRaw = Localization.getLocales()[0]?.languageCode || "en";
    const deviceLocale = normalizeLanguageCode(deviceRaw);

    if (saved?.trim()) {
      const savedNorm = normalizeLanguageCode(saved);
      const effective = coerceMobileUiLanguage(savedNorm);
      if (!isReviewedUiLanguage(savedNorm)) {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, effective);
      }
      applyMobileLanguage(effective);
      return;
    }

    if (isReviewedUiLanguage(deviceLocale) && deviceLocale !== BOOT_LOCALE) {
      applyMobileLanguage(deviceLocale);
      return;
    }

    syncRtl(BOOT_LOCALE);
  })
  .catch(() => {
    syncRtl(BOOT_LOCALE);
  });

/** Re-derive the money locale once the tenant config bundle (region) is available. */
export async function resyncLocaleFromBundle() {
  const { i18n } = await import("@beautonomi/i18n");
  syncMoneyLocale(i18n.language || BOOT_LOCALE);
}

export interface ChangeLanguageResult {
  language: string;
  /** `true` when the layout direction flipped — the app must restart to apply it. */
  directionChanged: boolean;
}

export async function changeLanguage(code: string): Promise<ChangeLanguageResult> {
  const { i18n } = await import("@beautonomi/i18n");
  const normalized = coerceMobileUiLanguage(normalizeLanguageCode(code));
  await ensureLocaleResources(i18n, normalized);
  await i18n.changeLanguage(normalized);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  syncMoneyLocale(normalized);
  const directionChanged = syncRtl(normalized);
  return { language: normalized, directionChanged };
}

/**
 * Restart the JS app so `I18nManager.forceRTL` takes effect.
 * Uses `expo-updates` in release builds; falls back to `DevSettings.reload()`
 * in dev or when updates are disabled.
 */
/** Offer a restart when RTL/LTR flipped — `I18nManager.forceRTL` needs a native relaunch. */
export function promptReloadIfDirectionChanged(
  directionChanged: boolean,
  alert: (title: string, message: string, buttons: { text: string; onPress?: () => void }[]) => void,
  copy: { title: string; body: string; reload: string },
): void {
  if (!directionChanged) return;
  alert(copy.title, copy.body, [{ text: copy.reload, onPress: () => void reloadForDirectionChange() }]);
}

export async function reloadForDirectionChange(): Promise<void> {
  if (__DEV__ || Updates.isEnabled === false) {
    try {
      DevSettings.reload();
    } catch {
      // Best effort — the direction applies on the next cold start.
    }
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    try {
      DevSettings.reload();
    } catch {
      // Best effort — the direction applies on the next cold start.
    }
  }
}

export { isReviewedUiLanguage, coerceMobileUiLanguage, REVIEWED_UI_LANGUAGE_CODES } from "@beautonomi/i18n";
