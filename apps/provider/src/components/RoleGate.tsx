import { useEffect, useMemo, useRef } from "react";
import { DeviceEventEmitter, View, Text, TouchableOpacity } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { Colors } from "@/constants/colors";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import type { UserRole } from "@beautonomi/types";
import { authFlowBreadcrumb, isSentryEnabled, setAuthFlowTags } from "@/lib/sentry";
import { useTranslation } from "@beautonomi/i18n";

/** provider_onboarding: explicit DB role or legacy; same app access as owner/staff until onboarding completes */
const ALLOWED_ROLES: UserRole[] = ["provider_owner", "provider_staff", "provider_onboarding"];

type BlockReason = "network" | "verify" | "role";

interface RoleGateProps {
  children: React.ReactNode;
}

function isNetworkishProfileError(message: string | null): boolean {
  if (!message) return false;
  return /network|timeout|timed out|fetch|connection|econnrefused/i.test(message);
}

export function RoleGate({ children }: RoleGateProps) {
  const { t } = useTranslation();
  const rg = (key: string) => t(`provider.mobile.components.roleGate.${key}`) as string;
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { provider, role, loading, profileLoadError, refresh } = useProvider();
  const lastResolved = useRef<{ loading: boolean; blocked: boolean } | null>(null);

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login" as never);
  }

  const blockReason = useMemo<BlockReason | null>(() => {
    if (!role) {
      // Cached org profile is enough to stay in-app while role catches up on resume.
      if (provider) return null;
      if (isNetworkishProfileError(profileLoadError)) {
        return "network";
      }
      // Missing role after a failed/cancelled fetch — not "wrong account".
      return "verify";
    }
    if (role === "customer" && pathname?.includes("/onboarding")) {
      return null;
    }
    if (!ALLOWED_ROLES.includes(role as UserRole)) {
      return "role";
    }
    return null;
  }, [role, profileLoadError, pathname, provider]);
  const blocked = !loading && blockReason !== null;

  const shouldAutoRetryOnResume = useMemo(() => {
    if (!blocked) return false;
    if (blockReason === "network" || blockReason === "verify") return true;
    // users.role may still be customer until /api/me/role upgrades owner/staff on X-App: provider.
    if (blockReason === "role" && role === "customer") return true;
    return false;
  }, [blocked, blockReason, role]);

  useEffect(() => {
    if (!user?.id || !isSentryEnabled()) return;
    const prev = lastResolved.current;
    const next = { loading, blocked };
    if (prev && prev.loading && !loading) {
      setAuthFlowTags({ guard_name: "role_gate" });
      authFlowBreadcrumb("role_gate", {
        outcome: blocked ? "blocked" : "ok",
        blockReason: blocked ? blockReason : undefined,
      });
    }
    lastResolved.current = next;
  }, [user?.id, loading, blocked, blockReason]);

  // Auto-retry when the app comes to foreground / network recovers.
  useEffect(() => {
    if (!shouldAutoRetryOnResume) return;
    const handler = () => {
      if (!loading) void refresh();
    };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", handler);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", handler);
    return () => {
      subFocus.remove();
      subRecover.remove();
    };
  }, [shouldAutoRetryOnResume, loading, refresh]);

  if (!user) return null;
  if (loading) {
    return <GateLoadingScreen message={rg("checkingAccess")} />;
  }
  if (blocked) {
    const isNetwork = blockReason === "network";
    const isVerify = blockReason === "verify";
    const canRetry = isNetwork || isVerify || (blockReason === "role" && role === "customer");

    const title = isNetwork
      ? rg("cantReachServer")
      : isVerify
        ? rg("couldntVerifyAccess")
        : rg("providerAccessOnly");

    const description = isNetwork
      ? rg("networkBody")
      : isVerify
        ? rg("verifyBody")
        : rg("roleBody");

    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <EmptyState
          icon={isNetwork ? "cloud-offline-outline" : isVerify ? "refresh-outline" : "lock-closed-outline"}
          title={title}
          description={description}
          actionLabel={canRetry ? rg("retry") : rg("signOut")}
          onAction={() => {
            if (canRetry) {
              void refresh();
            } else {
              void handleSignOut();
            }
          }}
        />
        {canRetry && (
          <View style={{ alignItems: "center", paddingBottom: 32 }}>
            <TouchableOpacity
              onPress={() => handleSignOut()}
              accessibilityRole="button"
              accessibilityLabel={rg("signOut")}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: Colors.gray[600], fontSize: 14, fontWeight: "500" }}>
                {rg("signOut")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScreenContainer>
    );
  }
  return <>{children}</>;
}
