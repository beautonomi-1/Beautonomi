import {
  buildFormatLocale,
  ensureLocaleResources,
  getLanguageDirection,
  i18n,
  initI18n,
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

// Device locale bootstraps i18next synchronously so `t()` works immediately.
// RTL is deliberately NOT synced here: the persisted preference wins, and
// syncing twice (device → saved) would toggle native RTL on and then off.
setExtraLocaleLoader(loadNativeLocaleMessages);

const deviceLocale = normalizeLanguageCode(Localization.getLocales()[0]?.languageCode || "en");
initI18n(deviceLocale);
void ensureLocaleResources(i18n, deviceLocale).then(() => {
  if (normalizeLanguageCode(i18n.language) !== deviceLocale) {
    void i18n.changeLanguage(deviceLocale);
  }
});
syncMoneyLocale(deviceLocale);

AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((saved) => {
    const effective = saved ? normalizeLanguageCode(saved) : deviceLocale;
    if (effective !== deviceLocale) {
      return import("@beautonomi/i18n").then(({ i18n }) => {
        void ensureLocaleResources(i18n, effective).then(() => i18n.changeLanguage(effective));
        syncMoneyLocale(effective);
        syncRtl(effective);
      });
    }
    syncRtl(effective);
  })
  .catch(() => {
    syncRtl(deviceLocale);
  });

/** Re-derive the money locale once the tenant config bundle (region) is available. */
export async function resyncLocaleFromBundle() {
  const { i18n } = await import("@beautonomi/i18n");
  syncMoneyLocale(i18n.language || deviceLocale);
}

export interface ChangeLanguageResult {
  language: string;
  /** `true` when the layout direction flipped — the app must restart to apply it. */
  directionChanged: boolean;
}

export async function changeLanguage(code: string): Promise<ChangeLanguageResult> {
  const { i18n } = await import("@beautonomi/i18n");
  const normalized = normalizeLanguageCode(code);
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
