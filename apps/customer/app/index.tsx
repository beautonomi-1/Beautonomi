import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { WrongAppScreen } from "@/components/WrongAppScreen";
import { APP_URL, isScreenshotMode } from "@/config/public-env";
import { getCachedPortal, setCachedPortal, clearPortalCache } from "@/lib/portal-cache";

const PORTAL_CHECK_DELAY_MS = 400;
const PORTAL_TIMEOUT_MS = 12 * 1000;
const PROFILE_COMPLETION_DELAY_MS = 300;
const PROFILE_COMPLETION_TIMEOUT_MS = 8000;

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

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [wrongPortal, setWrongPortal] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "loading" | "complete" | "incomplete" | "error">("idle");
  const [profileCompletionData, setProfileCompletionData] = useState<ProfileCompletion | null>(null);
  /** null = still checking; false = must complete customer onboarding wizard */
  const [customerOnboardingDone, setCustomerOnboardingDone] = useState<boolean | null>(null);

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

    api
      .get<{ completed?: boolean }>("/api/me/onboarding/complete")
      .then((res) => {
        if (cancelled) return;
        if (res.error) setCustomerOnboardingDone(true);
        else setCustomerOnboardingDone(res.data?.completed === true);
      })
      .catch(() => {
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

  // Profile completion loading
  if (portalState === "customer" && (profileState === "idle" || profileState === "loading")) {
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
