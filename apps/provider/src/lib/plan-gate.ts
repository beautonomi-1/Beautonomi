import { Alert } from "react-native";
import { router as expoRouter, type Router } from "expo-router";

export const PLAN_GATE_ERROR_CODES = [
  "SUBSCRIPTION_REQUIRED",
  "LIMIT_REACHED",
  "SUBSCRIPTION_LIMIT_EXCEEDED",
  "TERMINAL_LIMIT_REACHED",
] as const;

export type PlanGateErrorCode = (typeof PLAN_GATE_ERROR_CODES)[number];

export function isPlanGateErrorCode(code: string | null | undefined): code is PlanGateErrorCode {
  if (!code) return false;
  return (PLAN_GATE_ERROR_CODES as readonly string[]).includes(code);
}

export const PROVIDER_SUBSCRIPTION_ROUTE = "/(app)/(tabs)/more/settings/subscription" as const;

export function openProviderPlans(router?: Router): void {
  (router ?? expoRouter).push(PROVIDER_SUBSCRIPTION_ROUTE as never);
}

export type PlanGateAlertOptions = {
  title?: string;
  message: string;
  errorCode?: string | null;
  router?: Router;
  onDismiss?: () => void;
};

/**
 * Show an alert with View plans when the API returned a subscription/limit gate.
 * Falls back to a simple error alert otherwise.
 */
export function showPlanGateAlert(options: PlanGateAlertOptions): void {
  const { message, errorCode, router, onDismiss } = options;
  const title =
    options.title ??
    (errorCode === "LIMIT_REACHED" || errorCode === "SUBSCRIPTION_LIMIT_EXCEEDED"
      ? "Plan limit reached"
      : errorCode === "TERMINAL_LIMIT_REACHED"
        ? "Terminal limit reached"
        : "Not included in your plan");

  if (isPlanGateErrorCode(errorCode)) {
    Alert.alert(title, message, [
      { text: "Not now", style: "cancel", onPress: onDismiss },
      {
        text: "View plans",
        onPress: () => {
          openProviderPlans(router);
          onDismiss?.();
        },
      },
    ]);
    return;
  }

  Alert.alert(title, message, [{ text: "OK", onPress: onDismiss }]);
}
