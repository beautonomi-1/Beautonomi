import AsyncStorage from "@react-native-async-storage/async-storage";

export const CUSTOMER_EULA_VERSION = "2026-10-31";
const STORAGE_KEY = "@beautonomi/customer_eula_acceptance";
const SYNCED_KEY = "@beautonomi/customer_eula_server_synced";

export type StoredLegalAcceptance = {
  version: string;
  acceptedAt: string;
};

export async function getStoredCustomerEulaAcceptance(): Promise<StoredLegalAcceptance | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLegalAcceptance;
    if (!parsed?.version || !parsed?.acceptedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function hasAcceptedCurrentCustomerEula(): Promise<boolean> {
  const stored = await getStoredCustomerEulaAcceptance();
  return stored?.version === CUSTOMER_EULA_VERSION;
}

export async function storeCustomerEulaAcceptance(): Promise<StoredLegalAcceptance> {
  const record: StoredLegalAcceptance = {
    version: CUSTOMER_EULA_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

export async function clearCustomerEulaAcceptance(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY, SYNCED_KEY]);
}

function syncedMarker(userId: string): string {
  return `${userId}:${CUSTOMER_EULA_VERSION}`;
}

export async function isCustomerEulaSyncedForUser(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SYNCED_KEY)) === syncedMarker(userId);
  } catch {
    return false;
  }
}

export async function markCustomerEulaSyncedForUser(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNCED_KEY, syncedMarker(userId));
  } catch {
    // Best effort: the next launch simply re-syncs.
  }
}
