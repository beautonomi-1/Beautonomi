import { useEffect, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";
import {
  authFlowBreadcrumb,
  captureAuthMessage,
  isSentryEnabled,
  setAuthFlowTags,
  setAuthGateContext,
} from "@/lib/sentry";

const IDX = "customer_index";
const PORTAL_CHECK_DELAY_MS = 400;
const PORTAL_TIMEOUT_MS = 12 * 1000;
const PROFILE_COMPLETION_DELAY_MS = 300;
const PROFILE_COMPLETION_TIMEOUT_MS = 8000;
const ONBOARDING_STATUS_WARN_MS = 25_000;

type PortalState = "idle" | "loading" | "customer" | "wrong_app";

/** Profile completion API response (GET /api/me/profile-completion) */
type ProfileCompletionItem = { id: string; completed: boolean; required?: boolean };
type ProfileCompletion = {
  checklistItems?: ProfileCompletionItem[];
  percentage?: number;
};

function hasIncompleteRequired(data: ProfileCompletion | null): boolean {
  const items = data?.checklistItems ?? [];
  return items.some((item) => item.required === true && !item.completed);
}

/** First incomplete required item id → route for that screen */
function getIncompleteRedirectRoute(data: ProfileCompletion | null): string {
  const items = data?.checklistItems ?? [];
  const first = items.find((item) => item.required === true && !item.completed);
  if (first?.id === "address") return "/(app)/account-settings/addresses";
  return "/(app)/account-settings/personal-info";
}

/** Single derived “gate” label for redirect / loading branches (matches render order). */
function computeGatePhase(args: {
  loading: boolean;
  hasSession: boolean;
  portalState: PortalState;
  customerOnboardingDone: boolean | null;
  profileState: "idle" | "loading" | "complete" | "incomplete" | "error";
  screenshot: boolean;
}): string {
  const { loading, hasSession, portalState, customerOnboardingDone, profileState, screenshot } = args;
  if (loading || (hasSession && portalState === "idle") || portalState === "loading") {
    return "loading_portal";
  }
  if (!hasSession) return "redirect_login";
  if (portalState === "wrong_app") return "screen_wrong_app";
  if (portalState === "customer" && screenshot) return "redirect_home_screenshot";
  if (portalState === "customer" && customerOnboardingDone === false) return "redirect_onboarding";
  if (portalState === "customer" && customerOnboardingDone === null && !screenshot) {
    return "loading_onboarding_status";
  }
  if (portalState === "customer" && (profileState === "idle" || profileState === "loading")) {
    return "loading_profile_completion";
  }
  if (portalState === "customer" && profileState === "error") return "redirect_home_profile_error";
  if (portalState === "customer" && profileState === "incomplete") return "redirect_profile_incomplete";
  return "redirect_home";
}

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "loading" | "complete" | "incomplete" | "error">("idle");
  const [profileCompletionData, setProfileCompletionData] = useState<ProfileCompletion | null>(null);
  /** null = still checking; false = must complete customer onboarding wizard */
  const [customerOnboardingDone, setCustomerOnboardingDone] = useState<boolean | null>(null);
  const onboardingHangReported = useRef(false);

  const prevAuthLoading = useRef<boolean | undefined>(undefined);
  const prevPortalState = useRef<PortalState | undefined>(undefined);
  const prevProfileState = useRef<string | undefined>(undefined);
  const prevGatePhase = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    authFlowBreadcrumb(`${IDX}.route_mount`, {});
    setAuthFlowTags({ route_group: "root_index" });
  }, []);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevAuthLoading.current === loading) return;
    prevAuthLoading.current = loading;
    authFlowBreadcrumb(`${IDX}.auth_loading`, { loading });
  }, [loading]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevPortalState.current === portalState) return;
    const from = prevPortalState.current ?? "init";
    prevPortalState.current = portalState;
    authFlowBreadcrumb(`${IDX}.portal_state`, { from, to: portalState });
  }, [portalState]);

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevProfileState.current === profileState) return;
    const from = prevProfileState.current ?? "init";
    prevProfileState.current = profileState;
    authFlowBreadcrumb(`${IDX}.profile_state`, { from, to: profileState });
  }, [profileState]);

  const gatePhase = computeGatePhase({
    loading,
    hasSession: !!session,
    portalState,
    customerOnboardingDone,
    profileState,
    screenshot: isScreenshotMode(),
  });

  useEffect(() => {
    if (!isSentryEnabled()) return;
    if (prevGatePhase.current === gatePhase) return;
    prevGatePhase.current = gatePhase;
    authFlowBreadcrumb(`${IDX}.gate_phase`, { phase: gatePhase });
    setAuthGateContext("customer_index", {
      phase: gatePhase,
      authLoading: loading,
      hasSession: !!session,
      portalState,
      customerOnboardingDone,
      profileState,
    });
  }, [gatePhase, loading, session, portalState, customerOnboardingDone, profileState]);

  useEffect(() => {
    if (loading || !session) {
      return;
    }

    if (!APP_URL?.trim()) {
      setPortalState("customer");
      return;
    }

    const uid = session.user.id;
    const cached = getCachedPortal(uid);
    if (cached === "customer") {
      setPortalState("customer");
      return;
    }
    if (cached === "provider" || cached === "admin") {
      setPortalState("wrong_app");
      setWrongPortal(cached);
      return;
    }

    let cancelled = false;
    let portalTimedOut = false;
    setPortalState("loading");

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      portalTimedOut = true;
      setPortalState("customer");
    }, PORTAL_TIMEOUT_MS);

    const applyPortal = (portal: string) => {
      setCachedPortal(uid, portal);
      if (portal === "provider" || portal === "admin") {
        setWrongPortal(portal);
        setPortalState("wrong_app");
      } else {
        setPortalState("customer");
      }
    };

    const fetchPortal = (attempt: number) => {
      api
        .get<{ portal?: string }>("/api/me/portal")
        .then((res) => {
          if (cancelled || portalTimedOut) return;
          if (res.error) {
            const status = (res.error as { status?: number }).status;
            if ((status === 401 || status === 403) && attempt < 4) {
              setTimeout(() => fetchPortal(attempt + 1), 350 * (attempt + 1));
              return;
            }
            setPortalState("customer");
            return;
          }
          const portal = res.data?.portal ?? "customer";
          applyPortal(portal);
        })
        .catch(() => {
          if (!cancelled && !portalTimedOut) setPortalState("customer");
        });
    };

    const t = setTimeout(() => {
      if (cancelled) return;
      fetchPortal(0);
    }, PORTAL_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
    };
  }, [loading, session?.user?.id]);

  // Customer onboarding (web + native): server is source of truth before sending users home.
  useEffect(() => {
    if (portalState !== "customer" || !session?.user?.id) {
      setCustomerOnboardingDone(null);
      return;
    }
    if (!APP_URL?.trim()) {
      setCustomerOnboardingDone(true);
      return;
    }
    if (isScreenshotMode()) {
      setCustomerOnboardingDone(true);
      return;
    }

    let cancelled = false;
    setCustomerOnboardingDone(null);

    if (isSentryEnabled()) {
      authFlowBreadcrumb(`${IDX}.onboarding_fetch_start`, {});
    }

    api
      .get<{ completed?: boolean }>("/api/me/onboarding/complete")
      .then((res) => {
        if (cancelled) return;
        if (isSentryEnabled()) {
          if (res.error) {
            authFlowBreadcrumb(`${IDX}.onboarding_fetch_error`, {
              kind: "api_error",
            });
          } else {
            authFlowBreadcrumb(`${IDX}.onboarding_fetch_success`, {
              completed: res.data?.completed === true,
            });
          }
        }
        if (res.error) setCustomerOnboardingDone(true);
        else setCustomerOnboardingDone(res.data?.completed === true);
      })
      .catch((e) => {
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${IDX}.onboarding_fetch_error`, {
            kind: "throw",
            message: e instanceof Error ? e.message : String(e),
          });
        }
        if (!cancelled) setCustomerOnboardingDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [portalState, session?.user?.id]);

  // Phase 2: profile completion (only when portal is customer and onboarding finished)
  useEffect(() => {
    if (portalState !== "customer" || !session?.user?.id || !APP_URL?.trim()) return;
    if (customerOnboardingDone !== true) return;

    let cancelled = false;
    setProfileCompletionData(null);
    setProfileState("loading");

    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setProfileState("error");
    }, PROFILE_COMPLETION_TIMEOUT_MS);

    const t = setTimeout(() => {
      api
        .get<ProfileCompletion>("/api/me/profile-completion")
        .then((res) => {
          if (cancelled) return;
          if (res.error) {
            setProfileState("error");
            return;
          }
          const data = res.data ?? null;
          setProfileCompletionData(data);
          setProfileState(hasIncompleteRequired(data) ? "incomplete" : "complete");
        })
        .catch(() => {
          if (!cancelled) setProfileState("error");
        });
    }, PROFILE_COMPLETION_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(timeoutId);
    };
  }, [portalState, session?.user?.id, customerOnboardingDone]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[customer index] route gate state", {
      authLoading: loading,
      hasSession: !!session,
      portalState,
      customerOnboardingDone,
      profileState,
    });
  }, [loading, session?.user?.id, portalState, customerOnboardingDone, profileState]);

  useEffect(() => {
    if (!session?.user?.id || portalState !== "customer") {
      onboardingHangReported.current = false;
      return;
    }
    if (customerOnboardingDone !== null || isScreenshotMode() || !APP_URL?.trim()) return;
    const t = setTimeout(() => {
      if (customerOnboardingDone === null && !onboardingHangReported.current) {
        onboardingHangReported.current = true;
        if (isSentryEnabled()) {
          authFlowBreadcrumb(`${IDX}.onboarding_fetch_timeout`, { waitedMs: ONBOARDING_STATUS_WARN_MS });
          captureAuthMessage(`${IDX}_onboarding_pending`, "warning", {
            waitedMs: ONBOARDING_STATUS_WARN_MS,
          });
        }
      }
    }, ONBOARDING_STATUS_WARN_MS);
    return () => clearTimeout(t);
  }, [session?.user?.id, portalState, customerOnboardingDone]);

  if (loading || (session && portalState === "idle") || portalState === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          minHeight: 400,
        }}
      >
        <ActivityIndicator size="large" color="#4B5563" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#4B5563" }}>Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (portalState === "wrong_app" && wrongPortal) {
    return (
      <WrongAppScreen
        portal={wrongPortal}
        onSignOut={() => {
          clearPortalCache();
          signOut();
        }}
      />
    );
  }

  if (portalState === "customer" && session && isScreenshotMode()) {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  if (portalState === "customer" && session && customerOnboardingDone === false) {
    return <Redirect href="/(app)/onboarding" />;
  }

  // Onboarding status loading
  if (portalState === "customer" && session && customerOnboardingDone === null && !isScreenshotMode()) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          minHeight: 400,
        }}
      >
        <ActivityIndicator size="large" color="#4B5563" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#4B5563" }}>Loading…</Text>
      </View>
    );
  }

  // Profile completion loading (only blocks when APP_URL is set; without it the effect
  // returns early and profileState stays "idle" — skip the spinner to avoid stuck loading).
  if (portalState === "customer" && APP_URL?.trim() && (profileState === "idle" || profileState === "loading")) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
          minHeight: 400,
        }}
      >
        <ActivityIndicator size="large" color="#4B5563" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#4B5563" }}>Loading…</Text>
      </View>
    );
  }

  // Profile completion error: don't block, go to home; user can complete from profile
  if (portalState === "customer" && profileState === "error") {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  // Required profile items incomplete → redirect to the right screen (address → addresses, else personal-info)
  if (portalState === "customer" && profileState === "incomplete") {
    const href = getIncompleteRedirectRoute(profileCompletionData);
    return <Redirect href={href as any} />;
  }

  return <Redirect href="/(app)/(tabs)/home" />;
}
