import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Router } from "expo-router";

export const MORE_TAB_HREF = "/(app)/(tabs)/more" as const;
export const TRANSACTIONS_HUB_HREF = "/(app)/(tabs)/more/transactions-hub" as const;
export const FROM_TRANSACTIONS_HUB = "transactions-hub" as const;
export const HUB_RETURN_SUFFIX = `?from=${FROM_TRANSACTIONS_HUB}` as const;

/** Explicit back targets when tab switches or deep links leave no stack history. */
export const FROM_RETURN_ROUTES: Record<string, string> = {
  [FROM_TRANSACTIONS_HUB]: TRANSACTIONS_HUB_HREF,
  dashboard: "/(app)/(tabs)/dashboard",
  bookings: "/(app)/(tabs)/bookings",
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

export function isMoreTabMenuHub(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  const normalized = pathname.replace(/\/$/, "");
  if (normalized === "/more" || normalized.endsWith("/more")) return true;
  if (normalized.endsWith("/more/index")) return true;
  return false;
}

/** True when the URL is a nested screen inside the More stack (not the menu hub). */
export function isMoreTabNestedScreen(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (!pathname.includes("/more")) return false;
  return !isMoreTabMenuHub(pathname);
}

export function navigateToMoreHub(router: Router): void {
  router.replace(MORE_TAB_HREF as never);
}

export function navigateToTransactionsHub(router: Router): void {
  router.replace(TRANSACTIONS_HUB_HREF as never);
}

/**
 * Prefer stack pop when history exists; otherwise replace to an explicit return
 * target or the More menu hub.
 */
export function performProviderStackBack(
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
  navigateToMoreHub(router);
}

export function useFromTransactionsHub(): boolean {
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  return matchesFromParam(fromParam, FROM_TRANSACTIONS_HUB);
}

export function useFromReturnHref(): string | undefined {
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  return resolveFromReturnHref(fromParam);
}

/** Back handler for ScreenHeader on nested More / cross-tab screens. */
export function useProviderStackBack(explicitReturnHref?: string) {
  const router = useRouter();
  const fromReturnHref = useFromReturnHref();
  const returnHref = explicitReturnHref ?? fromReturnHref;

  const handleBack = useCallback(() => {
    performProviderStackBack(router, returnHref);
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

/**
 * Open a screen in the More tab and activate that tab (avoids showing a More
 * route while another tab stays selected).
 */
export function navigateToMoreScreen(
  router: Router,
  pathname: string,
  params?: Record<string, string | undefined>,
): void {
  router.navigate({ pathname, params } as never);
}
