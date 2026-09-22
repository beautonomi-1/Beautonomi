import AsyncStorage from "@react-native-async-storage/async-storage";

export const SHOP_MARKET_STORAGE_KEY = "beautonomi_shop_market";
export const SHOP_MARKET_HEADER = "X-Shop-Market";

export async function getShopMarketCountry(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(SHOP_MARKET_STORAGE_KEY);
    const code = raw?.trim().toUpperCase() ?? "";
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export async function setShopMarketCountry(iso2: string): Promise<void> {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return;
  try {
    await AsyncStorage.setItem(SHOP_MARKET_STORAGE_KEY, code);
  } catch {
    // best effort
  }
}

export async function clearShopMarketCountry(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SHOP_MARKET_STORAGE_KEY);
  } catch {
    // ignore
  }
}

let cachedShopMarket: string | null | undefined;

export function primeShopMarketCache(iso: string | null): void {
  cachedShopMarket = iso;
}

export function getShopMarketHeaderSync(): Record<string, string> {
  if (cachedShopMarket && /^[A-Z]{2}$/.test(cachedShopMarket)) {
    return { [SHOP_MARKET_HEADER]: cachedShopMarket };
  }
  return {};
}

void getShopMarketCountry().then((v) => {
  cachedShopMarket = v;
});
