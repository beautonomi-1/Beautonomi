/**
 * PaystackReturnScreen — shared full-screen component for every Paystack
 * deep-link / cold-start return target in the customer app.
 *
 * Responsibilities:
 *  - Parse `reference` and `cancelled` from URL params.
 *  - Run the cooperative `isReferenceProcessing` guard so parent-owned
 *    verify flows don't race with this screen.
 *  - Drive the `ReturnMode` state machine: verifying → success/pending/failed.
 *  - Auto-navigate to the resolved route once verification settles.
 *  - Always render a primary action button so the customer can leave
 *    manually at any point, even while the spinner is running.
 *  - Show a "taking longer than expected" hint after `SLOW_HINT_MS` ms of
 *    active verification.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import {
  clearReferenceProcessing,
  isReferenceProcessing,
  markReferenceProcessing,
} from "@/lib/paystack-verify-guard";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReturnMode =
  | "verifying"
  | "returning"
  | "success"
  | "pending"
  | "failed"
  | "cancelled";

export interface PaystackReturnScreenLabels {
  /** Headline shown while actively verifying. */
  verifying: string;
  /** Headline shown when there is no reference and we are redirecting. */
  returning: string;
  /** CTA label when no specific destination is resolved (error / fallback). */
  fallbackCta: string;
  /** CTA label when a specific destination is resolved (success / pending). */
  continueCta: string;
}

export interface PaystackReturnScreenProps {
  /**
   * Maps the raw verify payload to the in-app route to navigate to on
   * success / pending.  Return `null` to fall back to `fallbackRoute`.
   */
  resolveTarget: (verifyData: unknown) => RouteTarget | null;
  /** Where to navigate after a cancelled payment. */
  cancelledRoute: RouteTarget;
  /** Where to navigate when no specific target can be resolved. */
  fallbackRoute: RouteTarget;
  /**
   * Optional side-effect that fires immediately on `status === "success"`,
   * before navigation (e.g. `emitCartUpdated` for shop orders).
   */
  onSuccess?: () => void;
  /** Overrides the verify endpoint (default: `/api/paystack/verify`). */
  verifyEndpoint?: string;
  labels: PaystackReturnScreenLabels;
  /**
   * Custom "taking longer than expected" text.
   * Shown after `SLOW_HINT_MS` ms while still in the `verifying` state.
   */
  slowHint?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long before we surface the "taking longer" hint (ms). */
const SLOW_HINT_MS = 7_000;

/** Auto-redirect delay after resolved states (mirrors existing screens). */
const AUTO_REDIRECT_MS_SUCCESS = 1_500;
const AUTO_REDIRECT_MS_PENDING = 1_500;
const AUTO_REDIRECT_MS_FAILED = 2_000;
const AUTO_REDIRECT_MS_CANCELLED = 800;
const AUTO_REDIRECT_MS_PROCESSING = 5_000; // cooperative branch

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

function pickRef(params: Record<string, string | string[] | undefined>): string {
  return pickStr(params.reference) || pickStr(params.trxref);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaystackReturnScreen({
  resolveTarget,
  cancelledRoute,
  fallbackRoute,
  onSuccess,
  verifyEndpoint,
  labels,
  slowHint,
}: PaystackReturnScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Keep router in a ref so the `navigate` callback stays stable across
  // renders without listing `router` as a dependency (avoids effect re-runs
  // when the router object reference changes, e.g. in test environments).
  const routerRef = useRef(router);
  routerRef.current = router;

  const reference = pickRef(params as Record<string, string | string[] | undefined>);
  const cancelled = pickStr((params as Record<string, string | string[] | undefined>).cancelled);

  const [mode, setMode] = useState<ReturnMode>(reference ? "verifying" : "returning");
  const [resolvedTarget, setResolvedTarget] = useState<RouteTarget | null>(null);
  const [slow, setSlow] = useState(false);

  /**
   * Guards against double-navigation: once either the auto-timer or the
   * manual button triggers navigation, this ref prevents the other path
   * from firing a second `router.replace`.
   */
  const navigatedRef = useRef(false);

  /**
   * Stable navigate function — safe to include in effect deps without
   * triggering re-runs on every render.
   */
  const navigate = useCallback((target: RouteTarget) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    routerRef.current.replace(target as never);
  }, []);

  // ── Verify state machine ────────────────────────────────────────────────────
  useEffect(() => {
    let aborted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const addTimer = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { if (!aborted) fn(); }, ms);
      timers.push(t);
      return t;
    };

    const cleanup = () => {
      aborted = true;
      timers.forEach(clearTimeout);
    };

    // ── Cancelled ─────────────────────────────────────────────────────────────
    if (cancelled === "1") {
      setMode("cancelled");
      addTimer(() => navigate(cancelledRoute), AUTO_REDIRECT_MS_CANCELLED);
      return cleanup;
    }

    // ── Cooperative branch: parent screen owns verification ───────────────────
    // The parent already called markReferenceProcessing. We step aside and
    // let it own navigation, but still show the button so the user can leave.
    if (reference && isReferenceProcessing(reference)) {
      clearReferenceProcessing(reference);
      addTimer(() => navigate(fallbackRoute), AUTO_REDIRECT_MS_PROCESSING);
      return cleanup;
    }

    // ── No reference: redirect immediately ───────────────────────────────────
    if (!reference) {
      setMode("returning");
      addTimer(() => navigate(fallbackRoute), 200);
      return cleanup;
    }

    // ── Primary verify path ───────────────────────────────────────────────────
    markReferenceProcessing(reference);

    // Slow hint timer — fires only while still verifying.
    const slowTimer = setTimeout(() => {
      if (!aborted) setSlow(true);
    }, SLOW_HINT_MS);
    timers.push(slowTimer);

    void (async () => {
      const result = await verifyPaystackWithRetry(reference, {
        endpoint: verifyEndpoint,
      });
      if (aborted) return;
      clearTimeout(slowTimer);
      setSlow(false);

      const target = resolveTarget(result.data);
      setResolvedTarget(target);

      if (result.status === "success") {
        onSuccess?.();
        setMode("success");
        addTimer(() => navigate(target ?? fallbackRoute), AUTO_REDIRECT_MS_SUCCESS);
        return;
      }

      if (result.status === "failed") {
        setMode("failed");
        addTimer(() => navigate(fallbackRoute), AUTO_REDIRECT_MS_FAILED);
        return;
      }

      // pending or unknown — optimistic: webhook will land soon.
      setMode("pending");
      addTimer(() => navigate(target ?? fallbackRoute), AUTO_REDIRECT_MS_PENDING);
    })();

    return cleanup;
  }, [
    reference,
    cancelled,
    navigate,
    cancelledRoute,
    fallbackRoute,
    resolveTarget,
    onSuccess,
    verifyEndpoint,
  ]);

  // ── Derived display values ─────────────────────────────────────────────────

  const headline = (() => {
    switch (mode) {
      case "success":  return "Payment confirmed";
      case "failed":   return "Payment could not be confirmed";
      case "pending":  return "Your payment is being confirmed";
      case "cancelled": return "Payment cancelled";
      case "verifying": return labels.verifying;
      default:         return labels.returning;
    }
  })();

  const subtext = (() => {
    if (mode === "pending") {
      return "We'll update your account within a few minutes. You can keep using the app while we confirm with your bank.";
    }
    if (mode === "failed") {
      return "If you were charged, your booking will still be confirmed once the payment lands. Please check your Bookings tab.";
    }
    return null;
  })();

  const isSpinning = mode === "verifying" || mode === "returning";

  const iconConfig = (() => {
    switch (mode) {
      case "success":  return { name: "checkmark-circle" as const, color: Colors.success, bg: "#F0FDF4" };
      case "pending":  return { name: "time-outline" as const,      color: "#D97706",     bg: "#FFFBEB" };
      case "failed":   return { name: "close-circle" as const,      color: Colors.error,  bg: "#FEF2F2" };
      case "cancelled": return { name: "close-circle-outline" as const, color: Colors.gray[400], bg: Colors.gray[100] };
      default:         return null;
    }
  })();

  // Button destination: specific target when resolved, otherwise fallback/cancelled.
  const buttonTarget: RouteTarget = (() => {
    if (mode === "cancelled") return cancelledRoute;
    return resolvedTarget ?? fallbackRoute;
  })();

  const hasSpecificTarget = resolvedTarget != null && (mode === "success" || mode === "pending");
  const ctaLabel = hasSpecificTarget ? labels.continueCta : labels.fallbackCta;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>

          {/* ── Icon area ─────────────────────────────────────────────── */}
          <View style={styles.iconArea}>
            {isSpinning ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : iconConfig ? (
              <View style={[styles.iconCircle, { backgroundColor: iconConfig.bg }]}>
                <Ionicons name={iconConfig.name} size={52} color={iconConfig.color} />
              </View>
            ) : null}
          </View>

          {/* ── Headline ──────────────────────────────────────────────── */}
          <Text style={styles.headline}>{headline}</Text>

          {/* ── Subtext (pending / failed) ────────────────────────────── */}
          {subtext ? (
            <Text style={[styles.subtext, mode === "pending" && styles.subtextPending]}>
              {subtext}
            </Text>
          ) : null}

          {/* ── Slow hint ─────────────────────────────────────────────── */}
          {slow && mode === "verifying" ? (
            <View style={styles.slowBanner}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#92400E"
                style={styles.slowIcon}
              />
              <Text style={styles.slowText}>
                {slowHint ??
                  "This is taking longer than expected. You can keep using the app while we confirm with your bank."}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Action button — always visible ────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => navigate(buttonTarget)}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconArea: {
    height: 88,
    width: 88,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headline: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.gray[900],
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 30,
  },
  subtext: {
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
    maxWidth: 300,
  },
  subtextPending: {
    backgroundColor: "#FFFBEB",
    color: "#92400E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: "hidden",
  },
  slowBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
    maxWidth: 320,
  },
  slowIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  slowText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaPressed: {
    opacity: 0.8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
