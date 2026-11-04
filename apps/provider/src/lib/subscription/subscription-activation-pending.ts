import AsyncStorage from "@react-native-async-storage/async-storage";

export const SUBSCRIPTION_ACTIVATION_PENDING_KEY = "beautonomi_subscription_activation_pending";

export async function setSubscriptionActivationPending(): Promise<void> {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_ACTIVATION_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function clearSubscriptionActivationPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUBSCRIPTION_ACTIVATION_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export async function readSubscriptionActivationPending(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIPTION_ACTIVATION_PENDING_KEY);
    return Boolean(raw?.trim());
  } catch {
    return false;
  }
}
