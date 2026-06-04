import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  APP_URL,
  getBackendUrl,
  DEFAULT_MARKET_HOST,
  GLOBAL_ENTRY_HOST,
  MARKET_OVERRIDE_TTL_HOURS,
  getRuntimeMarketHost,
  isScreenshotMode,
  setRuntimeMarketHost,
  withWebApiTenantHeaders,
} from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import {
  trackMarketAutoSwitch,
  trackMarketAutoSwitchSuppressed,
  trackMarketManualSwitch,
  trackMarketSwitchDeclined,
} from "@/lib/analytics";
import { api } from "@/lib/api-client";

type AvailabilityStatus = "allowed" | "unsupported" | "restricted";
type Panel = null | "restricted" | "za_suggest" | "unsupported_global" | "regional_foreign";

const MARKET_OVERRIDE_KEY = "market_manual_override";
const ZA_SUGGEST_DISMISS_KEY = "beautonomi_market_banner_za_suggest_v1";
const MARKET_OVERRIDE_TTL_MS = Math.max(
  1,
  Number.isFinite(MARKET_OVERRIDE_TTL_HOURS) ? MARKET_OVERRIDE_TTL_HOURS : 24,
) * 60 * 60 * 1000;

const ZA_BANNER_LONG_DISMISS_MS = 90 * 24 * 60 * 60 * 1000;

function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim().toLowerCase();
  if (!v) return "";
  const withProtocol = v.includes("://") ? v : `https://${v}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return v.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  }
}

function isZaMarketHost(activeHost: string, zaHost: string): boolean {
  const z = normalizeHost(zaHost);
  const h = normalizeHost(activeHost);
  return h === z || h === `www.${z}`;
}

interface TenantContextResponse {
  data?: {
    availability?: {
      status?: AvailabilityStatus;
      countryCode?: string;
      reason?: string | null;
      supportedCountries?: string[];
    };
    routing?: {
      currentHost?: string;
      marketSource?: "query" | "host" | "header_hint" | "geo_header" | "default" | "user_preference";
      confidence?: "high" | "medium" | "low";
      recommendedHost?: string | null;
      recommendedTenantId?: string | null;
      defaultMarketTenantId?: string | null;
      autoSwitchHost?: string | null;
      shouldAutoSwitch?: boolean;
    };
  };
}

async function readTimedDismiss(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { until?: number };
    if (typeof parsed?.until !== "number" || Date.now() >= parsed.until) {
      await AsyncStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function writeTimedDismiss(key: string, ttlMs: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ until: Date.now() + ttlMs }));
  } catch {
    // ignore
  }
}

async function setManualOverride(host: string): Promise<void> {
  try {
    const until = Date.now() + MARKET_OVERRIDE_TTL_MS;
    await AsyncStorage.setItem(
      MARKET_OVERRIDE_KEY,
      JSON.stringify({ host: normalizeHost(host), until }),
    );
  } catch {
    // best effort only
  }
}

async function hasActiveManualOverride(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(MARKET_OVERRIDE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { until?: number };
    if (typeof parsed?.until !== "number") return false;
    if (Date.now() >= parsed.until) {
      await AsyncStorage.removeItem(MARKET_OVERRIDE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function persistPreferredHomeTenant(tenantId: string | null | undefined): Promise<void> {
  if (!tenantId) return;
  try {
    const res = await api.patch("/api/me/profile", { preferred_home_tenant_id: tenantId });
    if (res.error && __DEV__) {
      console.warn("[MarketGate] Failed to persist preferred tenant:", res.error);
    }
  } catch {
    // best effort only
  }
}

export default function MarketAvailabilityGate() {
  const insets = useSafeAreaInsets();
  const sessionDismiss = useRef({ za: false, unsupportedG: false, regional: false });

  const [panel, setPanel] = useState<Panel>(null);
  const [countryCode, setCountryCode] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [defaultMarketTenantId, setDefaultMarketTenantId] = useState<string | null>(null);
  const [recommendedTenantId, setRecommendedTenantId] = useState<string | null>(null);
  const [targetZaHost, setTargetZaHost] = useState<string | null>(null);

  const globalEntryHost = useMemo(() => {
    const configured = normalizeHost(GLOBAL_ENTRY_HOST);
    if (configured) return configured;
    return normalizeHost(APP_URL);
  }, []);

  const defaultMarketHost = useMemo(() => {
    const configured = normalizeHost(DEFAULT_MARKET_HOST);
    if (configured) return configured;
    const fromGlobal = normalizeHost(GLOBAL_ENTRY_HOST);
    if (fromGlobal) return fromGlobal;
    return normalizeHost("beautonomi.co.za");
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (isScreenshotMode()) return;
      const activeHost = normalizeHost(getRuntimeMarketHost());
      if (!activeHost || !globalEntryHost) return;

      const isGlobalEntry =
        activeHost === globalEntryHost || activeHost === `www.${globalEntryHost}`;
      const onRegionalZa = isZaMarketHost(activeHost, defaultMarketHost);

      if (!isGlobalEntry && !onRegionalZa) return;

      try {
        const base = getBackendUrl().replace(/\/$/, "");
        if (!base) return;
        const response = await fetch(
          `${base}/api/public/tenant-context`,
          withWebApiTenantHeaders({
            headers: { "X-Active-Market-Country": getDeviceRegionCountryIso() },
          }),
        );
        const body = (await response.json()) as TenantContextResponse;
        const availability = body?.data?.availability;
        const routing = body?.data?.routing;
        const nextStatus = availability?.status ?? "allowed";
        const manualOverrideActive = await hasActiveManualOverride();

        const switchHost = routing?.autoSwitchHost ? normalizeHost(routing.autoSwitchHost) : null;
        const zaHost = switchHost || defaultMarketHost;

        const dismissZaLong = await readTimedDismiss(ZA_SUGGEST_DISMISS_KEY);

        if (!mounted) return;
        setDefaultMarketTenantId(routing?.defaultMarketTenantId ?? null);
        setRecommendedTenantId(routing?.recommendedTenantId ?? null);
        setTargetZaHost(zaHost);
        setCountryCode((availability?.countryCode ?? "").toUpperCase());
        setReason(availability?.reason ?? null);
        setSupportedCountries(availability?.supportedCountries ?? []);

        setPanel(null);

        if (nextStatus === "restricted") {
          setPanel("restricted");
          return;
        }

        if (
          isGlobalEntry &&
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          switchHost &&
          switchHost !== activeHost &&
          manualOverrideActive
        ) {
          trackMarketAutoSwitchSuppressed({
            fromHost: activeHost,
            toHost: switchHost,
            reason: "manual_override",
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
            countryCode: (availability?.countryCode ?? "").toUpperCase(),
          });
        }

        if (
          isGlobalEntry &&
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          switchHost &&
          switchHost !== activeHost &&
          !manualOverrideActive &&
          !dismissZaLong &&
          !sessionDismiss.current.za
        ) {
          // Auto-switch silently to the recommended host
          trackMarketAutoSwitch({
            fromHost: activeHost,
            toHost: switchHost,
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
            countryCode: (availability?.countryCode ?? "").toUpperCase(),
          });
          await persistPreferredHomeTenant(routing.recommendedTenantId ?? routing.defaultMarketTenantId);
          await setRuntimeMarketHost(switchHost);
          return;
        }

        if (
          isGlobalEntry &&
          nextStatus === "unsupported" &&
          !manualOverrideActive &&
          !sessionDismiss.current.unsupportedG
        ) {
          // Auto switch to default market
          await setManualOverride(defaultMarketHost);
          trackMarketAutoSwitch({
            fromHost: activeHost,
            toHost: defaultMarketHost,
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
            countryCode: (availability?.countryCode ?? "").toUpperCase(),
          });
          await persistPreferredHomeTenant(routing?.defaultMarketTenantId);
          await setRuntimeMarketHost(defaultMarketHost);
          return;
        }

        if (
          onRegionalZa &&
          !isGlobalEntry &&
          nextStatus === "unsupported" &&
          !sessionDismiss.current.regional
        ) {
          // Let them be or redirect to global? Just silently continue
          return;
        }
      } catch {
        // best-effort only
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [globalEntryHost, defaultMarketHost]);

  const goToZaMarket = async () => {
    const za = targetZaHost || defaultMarketHost;
    trackMarketManualSwitch({
      fromHost: normalizeHost(getRuntimeMarketHost()),
      toHost: za,
      reason: "za_banner",
      countryCode,
    });
    await persistPreferredHomeTenant(recommendedTenantId ?? defaultMarketTenantId);
    await setRuntimeMarketHost(za);
    setPanel(null);
  };

  const stayOnGlobalEntry = async () => {
    const currentHost = normalizeHost(getRuntimeMarketHost());
    await setManualOverride(currentHost);
    trackMarketSwitchDeclined({
      host: currentHost,
      reason: "za_banner_stay",
      countryCode,
    });
    trackMarketManualSwitch({
      fromHost: currentHost,
      toHost: currentHost,
      reason: "manual",
      countryCode,
    });
    setPanel(null);
  };

  const dismissZaLater = () => {
    sessionDismiss.current.za = true;
    setPanel(null);
  };

  const dismissZaLong = async () => {
    await writeTimedDismiss(ZA_SUGGEST_DISMISS_KEY, ZA_BANNER_LONG_DISMISS_MS);
    await setManualOverride(globalEntryHost);
    sessionDismiss.current.za = true;
    setPanel(null);
  };

  const switchToDefaultMarket = async () => {
    await setManualOverride(defaultMarketHost);
    trackMarketManualSwitch({
      fromHost: normalizeHost(getRuntimeMarketHost()),
      toHost: defaultMarketHost,
      reason: "unsupported",
      countryCode,
    });
    await persistPreferredHomeTenant(defaultMarketTenantId);
    await setRuntimeMarketHost(defaultMarketHost);
    setPanel(null);
  };

  const dismissUnsupportedGlobal = () => {
    sessionDismiss.current.unsupportedG = true;
    setPanel(null);
  };

  const dismissRegional = () => {
    sessionDismiss.current.regional = true;
    setPanel(null);
  };

  const openInternationalSite = () => {
    const url = `https://${globalEntryHost}`;
    void Linking.openURL(url);
    dismissRegional();
  };

  const restrictedTitle = "Access unavailable in your country";
  const restrictedDetails =
    reason || "Access is unavailable due to legal or regulatory restrictions.";

  const topPad = Platform.OS === "ios" ? insets.top + 8 : insets.top + 4;

  const bannerModal = (children: React.ReactNode, onBackdrop: () => void) => (
    <Modal transparent visible animationType="fade" onRequestClose={onBackdrop}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-start" }}
        onPress={onBackdrop}
      >
        <View style={{ paddingTop: topPad, paddingHorizontal: 12 }} pointerEvents="box-none">
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <>
      {panel === "restricted" ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPanel(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
            <View style={{ backgroundColor: "white", borderRadius: 14, padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>{restrictedTitle}</Text>
              <Text style={{ color: "#374151", marginBottom: 12 }}>
                {restrictedDetails}
                {countryCode ? ` (${countryCode})` : ""}
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <Pressable onPress={() => setPanel(null)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: "#374151", fontWeight: "600" }}>Close</Text>
                </Pressable>
                <Pressable
                  onPress={() => void switchToDefaultMarket()}
                  style={{ backgroundColor: "#111827", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Switch market</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {panel === "za_suggest"
        ? bannerModal(
            <View style={{ backgroundColor: "#1e1b4b", borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 8 }}>
                🇿🇦 South Africa detected
              </Text>
              <Text style={{ color: "#c7d2fe", marginBottom: 14, lineHeight: 20 }}>
                For ZAR pricing and local checkout, open the South Africa storefront ({targetZaHost || defaultMarketHost}
                ).
              </Text>
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => void goToZaMarket()}
                  style={{ backgroundColor: "#fff", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#1e1b4b", fontWeight: "700" }}>Go to {targetZaHost || defaultMarketHost}</Text>
                </Pressable>
                <Pressable onPress={() => void stayOnGlobalEntry()} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#e0e7ff", fontWeight: "600" }}>Stay on {globalEntryHost}</Text>
                </Pressable>
                <Pressable onPress={dismissZaLater} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#a5b4fc", fontWeight: "600" }}>Later</Text>
                </Pressable>
                <Pressable onPress={() => void dismissZaLong()} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#a5b4fc", fontWeight: "600" }}>Don&apos;t show again</Text>
                </Pressable>
              </View>
            </View>,
            dismissZaLater,
          )
        : null}

      {panel === "unsupported_global"
        ? bannerModal(
            <View style={{ backgroundColor: "#78350f", borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 8 }}>
                Not available in your country yet
              </Text>
              <Text style={{ color: "#fde68a", marginBottom: 8, lineHeight: 20 }}>
                {reason || "Beautonomi is not available in your country yet."}
                {countryCode ? ` (${countryCode})` : ""}
              </Text>
              {supportedCountries.length > 0 ? (
                <Text style={{ color: "#fcd34d", marginBottom: 14 }}>
                  Available markets: {supportedCountries.join(", ")}
                </Text>
              ) : null}
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => void switchToDefaultMarket()}
                  style={{ backgroundColor: "#fff", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#78350f", fontWeight: "700" }}>Switch to ZA site</Text>
                </Pressable>
                <Pressable onPress={() => void stayOnGlobalEntry()} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#fef3c7", fontWeight: "600" }}>Continue browsing</Text>
                </Pressable>
              </View>
            </View>,
            dismissUnsupportedGlobal,
          )
        : null}

      {panel === "regional_foreign"
        ? bannerModal(
            <View style={{ backgroundColor: "#0c4a6e", borderRadius: 14, padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 8 }}>
                South Africa storefront
              </Text>
              <Text style={{ color: "#bae6fd", marginBottom: 14, lineHeight: 20 }}>
                You&apos;re on {defaultMarketHost} (ZAR).{" "}
                {countryCode
                  ? `Your device region suggests ${countryCode} — we may not be live there yet.`
                  : ""}
              </Text>
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={openInternationalSite}
                  style={{ backgroundColor: "#fff", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#0c4a6e", fontWeight: "700" }}>Open international site</Text>
                </Pressable>
                <Pressable onPress={dismissRegional} style={{ paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: "#e0f2fe", fontWeight: "600" }}>Continue here</Text>
                </Pressable>
              </View>
            </View>,
            dismissRegional,
          )
        : null}
    </>
  );
}
