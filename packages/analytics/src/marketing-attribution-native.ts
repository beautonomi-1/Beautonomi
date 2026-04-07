import AsyncStorage from "@react-native-async-storage/async-storage";

const MARKETING_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "twclid",
  "li_fat_id",
] as const;

const LS_FIRST = "beautonomi_mkt_first_v1";
const SS_SESSION = "beautonomi_mkt_session_v1";

function parseParamsFromUrl(url: string): Record<string, string> {
  const q = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const found: Record<string, string> = {};
  try {
    const params = new URLSearchParams(q);
    for (const k of MARKETING_PARAM_KEYS) {
      const v = params.get(k);
      if (v?.trim()) found[k] = v.trim().slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return found;
}

let cachedEvents: Record<string, string> = {};
let cachedFirstIdentify: Record<string, string> = {};

function buildEventProps(first: Record<string, string>, session: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of MARKETING_PARAM_KEYS) {
    if (first[k]) out[`mkt_first_${k}`] = first[k];
    if (session[k]) out[`mkt_session_${k}`] = session[k];
  }
  return out;
}

function buildFirstTouchIdentify(first: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const map: Record<string, string> = {
    utm_source: "first_touch_utm_source",
    utm_medium: "first_touch_utm_medium",
    utm_campaign: "first_touch_utm_campaign",
    utm_term: "first_touch_utm_term",
    utm_content: "first_touch_utm_content",
    gclid: "first_touch_gclid",
    fbclid: "first_touch_fbclid",
    msclkid: "first_touch_msclkid",
  };
  for (const [src, dest] of Object.entries(map)) {
    if (first[src]) out[dest] = first[src].slice(0, 500);
  }
  return out;
}

/**
 * Persist UTM / click IDs from a deep link (initial or in-app).
 */
export async function captureMarketingAttributionFromUrl(url: string | null | undefined): Promise<void> {
  if (!url || typeof url !== "string") return;
  const found = parseParamsFromUrl(url);
  if (Object.keys(found).length === 0) return;
  try {
    await AsyncStorage.setItem(SS_SESSION, JSON.stringify(found));
    const firstRaw = await AsyncStorage.getItem(LS_FIRST);
    if (!firstRaw || firstRaw === "{}") {
      await AsyncStorage.setItem(LS_FIRST, JSON.stringify(found));
    }
    await refreshMarketingAttributionCache();
  } catch {
    /* ignore */
  }
}

export async function refreshMarketingAttributionCache(): Promise<void> {
  try {
    const first = JSON.parse((await AsyncStorage.getItem(LS_FIRST)) || "{}") as Record<string, string>;
    const session = JSON.parse((await AsyncStorage.getItem(SS_SESSION)) || "{}") as Record<string, string>;
    cachedEvents = buildEventProps(first, session);
    cachedFirstIdentify = buildFirstTouchIdentify(first);
  } catch {
    cachedEvents = {};
    cachedFirstIdentify = {};
  }
}

export function getCachedMarketingForEvents(): Record<string, string> {
  return { ...cachedEvents };
}

export function getCachedFirstTouchForIdentify(): Record<string, string> {
  return { ...cachedFirstIdentify };
}
