import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APP_URL,
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
const MARKET_OVERRIDE_KEY = "market_manual_override";
const MARKET_OVERRIDE_TTL_MS = Math.max(
  1,
  Number.isFinite(MARKET_OVERRIDE_TTL_HOURS) ? MARKET_OVERRIDE_TTL_HOURS : 24,
) * 60 * 60 * 1000;

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
    await api.patch("/api/me/profile", { preferred_home_tenant_id: tenantId });
  } catch {
    // best effort only
  }
}

export default function MarketAvailabilityGate() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<AvailabilityStatus>("allowed");
  const [countryCode, setCountryCode] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [defaultMarketTenantId, setDefaultMarketTenantId] = useState<string | null>(null);

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
      if (!isGlobalEntry) return;

      try {
        const base = APP_URL.replace(/\/$/, "");
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
        if (!mounted) return;
        setDefaultMarketTenantId(routing?.defaultMarketTenantId ?? null);

        // Auto-route when confidence is high: allowed country + global entry host context.
        const autoSwitchHost = normalizeHost(routing?.autoSwitchHost);
        if (
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          autoSwitchHost &&
          autoSwitchHost !== activeHost &&
          manualOverrideActive
        ) {
          trackMarketAutoSwitchSuppressed({
            fromHost: activeHost,
            toHost: autoSwitchHost,
            reason: "manual_override",
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
            countryCode: (availability?.countryCode ?? "").toUpperCase(),
          });
        }
        if (
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          autoSwitchHost &&
          autoSwitchHost !== activeHost &&
          !manualOverrideActive
        ) {
          trackMarketAutoSwitch({
            fromHost: activeHost,
            toHost: autoSwitchHost,
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
            countryCode: (availability?.countryCode ?? "").toUpperCase(),
          });
          await setRuntimeMarketHost(autoSwitchHost);
          await persistPreferredHomeTenant(routing?.recommendedTenantId);
          setVisible(false);
          return;
        }

        setStatus(nextStatus);
        setCountryCode((availability?.countryCode ?? "").toUpperCase());
        setReason(availability?.reason ?? null);
        setSupportedCountries(availability?.supportedCountries ?? []);
        if (manualOverrideActive && nextStatus === "unsupported") {
          setVisible(false);
        } else {
          setVisible(nextStatus === "unsupported" || nextStatus === "restricted");
        }
      } catch {
        // best-effort only
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [globalEntryHost]);

  const onSwitchMarket = async () => {
    await setManualOverride(defaultMarketHost);
    trackMarketManualSwitch({
      fromHost: normalizeHost(getRuntimeMarketHost()),
      toHost: defaultMarketHost,
      reason: status === "restricted" ? "restricted" : "unsupported",
      countryCode,
    });
    await setRuntimeMarketHost(defaultMarketHost);
    await persistPreferredHomeTenant(defaultMarketTenantId);
    setVisible(false);
  };

  const onContinueHere = async () => {
    const currentHost = normalizeHost(getRuntimeMarketHost());
    await setManualOverride(currentHost);
    if (status === "unsupported" || status === "restricted") {
      trackMarketSwitchDeclined({
        host: currentHost,
        reason: status,
        countryCode,
      });
    }
    trackMarketManualSwitch({
      fromHost: currentHost,
      toHost: currentHost,
      reason: "manual",
      countryCode,
    });
    setVisible(false);
  };

  const title =
    status === "restricted"
      ? "Access unavailable in your country"
      : "Not available in your country yet";
  const details =
    status === "restricted"
      ? reason || "Access is unavailable due to legal or regulatory restrictions."
      : reason || "Beautonomi is not available in your country yet.";

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "white", borderRadius: 14, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>{title}</Text>
          <Text style={{ color: "#374151", marginBottom: 12 }}>
            {details}
            {countryCode ? ` (${countryCode})` : ""}
          </Text>
          {status === "unsupported" && supportedCountries.length > 0 ? (
            <Text style={{ color: "#6b7280", marginBottom: 16 }}>
              Available markets: {supportedCountries.join(", ")}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
            {status === "unsupported" ? (
              <Pressable onPress={onContinueHere} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: "#374151", fontWeight: "600" }}>Continue</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onSwitchMarket}
              style={{ backgroundColor: "#111827", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Switch market</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
