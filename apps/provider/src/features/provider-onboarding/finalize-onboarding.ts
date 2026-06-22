import type { Router } from "expo-router";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { clearPortalCache, setCachedPortal } from "@/lib/portal-cache";
import { getBackendUrl } from "@/config/public-env";
import type { OnboardingFormData } from "./types";
import { setBiometricPromptPending } from "@/lib/biometric-setup-prompt";

const LOCAL_DRAFT_KEY = "beautonomi_provider_onboarding_draft_local";

export interface OnboardingCompletionData {
  message?: string;
  subscription_endpoint?: string | null;
  selected_plan_id?: string | null;
  selected_plan_is_free?: boolean;
  requires_checkout?: boolean;
  checkout_path?: string | null;
  already_completed?: boolean;
  subscription_active?: boolean;
}

type PlanRow = { id: string; is_free?: boolean };

function requiresCheckoutFromCompletion(data: OnboardingCompletionData | null | undefined): boolean {
  if (!data) return false;
  return data.requires_checkout ?? Boolean(data.subscription_endpoint);
}

async function refreshProviderPortal(userId: string | undefined): Promise<void> {
  if (!userId?.trim()) return;
  const portalRes = await api.get<{ portal?: string; role?: string; provider_status?: string }>(
    "/api/me/portal",
  );
  const portal = portalRes.data?.portal?.trim();
  if (portal === "provider" || portal === "admin") {
    setCachedPortal(userId, portal);
    return;
  }
  const role = portalRes.data?.role;
  const status = portalRes.data?.provider_status;
  if (
    role === "provider_owner" ||
    role === "provider_staff" ||
    (role === "provider_onboarding" && (status === "active" || status === "pending_approval"))
  ) {
    setCachedPortal(userId, "provider");
  }
}

/**
 * When the server body is unavailable (timeout), infer checkout need without
 * opening checkout for free plans.
 */
export async function resolveCheckoutFlagsForRecovery(
  formData: Partial<OnboardingFormData>,
): Promise<Pick<OnboardingCompletionData, "requires_checkout" | "selected_plan_id" | "selected_plan_is_free">> {
  const selectedPlanId = formData.selected_plan_id ?? null;

  const subRes = await api.get<{ subscription?: { status?: string } | null; is_free?: boolean }>(
    "/api/provider/subscription",
  );
  if (!subRes.error && subRes.data?.subscription?.status === "active") {
    return {
      selected_plan_id: selectedPlanId,
      selected_plan_is_free: subRes.data.is_free ?? false,
      requires_checkout: false,
    };
  }

  if (selectedPlanId) {
    const plansRes = await api.get<PlanRow[] | { plans?: PlanRow[] }>("/api/public/pricing/plans");
    const raw = plansRes.data;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { plans?: PlanRow[] }).plans)
        ? (raw as { plans: PlanRow[] }).plans
        : [];
    const match = list.find((p) => p.id === selectedPlanId);
    if (match?.is_free) {
      return {
        selected_plan_id: selectedPlanId,
        selected_plan_is_free: true,
        requires_checkout: false,
      };
    }
    if (match && !match.is_free) {
      return {
        selected_plan_id: selectedPlanId,
        selected_plan_is_free: false,
        requires_checkout: true,
      };
    }
  }

  return {
    selected_plan_id: selectedPlanId,
    selected_plan_is_free: false,
    requires_checkout: false,
  };
}

export async function finalizeOnboardingSuccess(options: {
  data: OnboardingCompletionData | null;
  formData: Partial<OnboardingFormData>;
  router: Router;
  refreshProvider: () => Promise<void>;
  userId?: string | null;
  showSuccessAlert?: boolean;
}): Promise<void> {
  const { data, formData, router, refreshProvider, userId, showSuccessAlert = true } = options;

  try {
    await AsyncStorage.removeItem(LOCAL_DRAFT_KEY);
  } catch {
    /* ignore */
  }

  clearPortalCache();
  await refreshProvider();
  await refreshProviderPortal(userId ?? undefined);

  const requiresCheckout = requiresCheckoutFromCompletion(data);
  const planId = data?.selected_plan_id ?? formData.selected_plan_id;

  if (userId?.trim()) {
    await setBiometricPromptPending(userId.trim());
  }

  if (planId && requiresCheckout) {
    const base = (getBackendUrl() || "").replace(/\/$/, "");
    if (!base) {
      Alert.alert(
        "Couldn't open payment page",
        "We saved your profile, but we can't open the secure payment page from this build. Please open Beautonomi in your browser to complete payment, or contact support.",
        [
          {
            text: "Open subscription settings",
            onPress: () => {
              router.replace("/(app)/(tabs)/more/settings/subscription" as never);
            },
          },
        ],
      );
      return;
    }

    const checkoutPath =
      data?.checkout_path ||
      `/provider/subscription-checkout?planId=${encodeURIComponent(planId)}`;
    const separator = checkoutPath.includes("?") ? "&" : "?";
    const url = `${base}${checkoutPath}${separator}in_app=1&return_to=dashboard`;
    router.replace({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: {
        url: encodeURIComponent(url),
        title: "Complete subscription",
        returnTo: "verify-identity",
      },
    } as never);
    return;
  }

  if (showSuccessAlert && data?.selected_plan_is_free && formData.selected_plan_name) {
    Alert.alert(
      "You're all set",
      `You're on ${formData.selected_plan_name} — ready to go.`,
      [{ text: "Continue", onPress: () => router.replace("/(app)/onboarding/verify-identity" as never) }],
    );
    return;
  }

  router.replace("/(app)/onboarding/verify-identity" as never);
}

export async function probeProviderProfileExists(): Promise<boolean> {
  const profileRes = await api.get<{ id?: string }>("/api/provider/profile");
  if (profileRes.error) {
    const status = (profileRes.error as { status?: number }).status;
    if (status === 404) return false;
    return false;
  }
  return Boolean(profileRes.data?.id);
}
