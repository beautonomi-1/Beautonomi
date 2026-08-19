import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Router } from "expo-router";

export const SAFETY_HUB_HREF = "/(app)/safety" as const;
export const FROM_SAFETY_HUB = "safety" as const;
export const PROFILE_HREF = "/(app)/(tabs)/profile" as const;

/** Explicit back targets when tab switches or deep links leave no stack history. */
export const FROM_RETURN_ROUTES: Record<string, string> = {
  [FROM_SAFETY_HUB]: SAFETY_HUB_HREF,
  profile: PROFILE_HREF,
};

export function normalizeSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

export function matchesFromParam(
  fromParam: string | string[] | undefined,
  expected: string,
): boolean {
  return normalizeSearchParam(fromParam) === expected;
}

export function resolveFromReturnHref(fromParam: string | string[] | undefined): string | undefined {
  const key = normalizeSearchParam(fromParam);
  if (!key) return undefined;
  return FROM_RETURN_ROUTES[key];
}

export function performCustomerStackBack(
  router: Router,
  returnHref?: string,
): void {
  if (returnHref) {
    router.replace(returnHref as never);
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(PROFILE_HREF as never);
}

export function useFromSafetyHub(): boolean {
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  return matchesFromParam(fromParam, FROM_SAFETY_HUB);
}

/** Push from Trust & Safety hub — child screens return via useSafetyStackBack. */
export function navigateFromSafetyHub(
  router: Router,
  pathname: string,
  params?: Record<string, string | undefined>,
): void {
  router.push({
    pathname,
    params: { ...params, from: FROM_SAFETY_HUB },
  } as never);
}

export function useFromReturnHref(): string | undefined {
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  return resolveFromReturnHref(fromParam);
}

/** Back handler for trust child screens and account-settings routes. */
export function useCustomerStackBack(explicitReturnHref?: string) {
  const router = useRouter();
  const fromReturnHref = useFromReturnHref();
  const returnHref = explicitReturnHref ?? fromReturnHref;

  const handleBack = useCallback(() => {
    performCustomerStackBack(router, returnHref);
  }, [router, returnHref]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  return handleBack;
}

/** Back to Safety hub when opened with from=safety; else normal stack back. */
export function useSafetyStackBack() {
  const fromSafety = useFromSafetyHub();
  return useCustomerStackBack(fromSafety ? SAFETY_HUB_HREF : undefined);
}
