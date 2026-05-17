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

/** provider_onboarding: explicit DB role or legacy; same app access as owner/staff until onboarding completes */
const ALLOWED_ROLES: UserRole[] = ["provider_owner", "provider_staff", "provider_onboarding"];

type BlockReason = "network" | "role" | "api";

interface RoleGateProps {
  children: React.ReactNode;
}

export function RoleGate({ children }: RoleGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { role, loading, profileLoadError, refresh } = useProvider();
  const lastResolved = useRef<{ loading: boolean; blocked: boolean } | null>(null);

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login" as never);
  }

  const blockReason = useMemo<BlockReason | null>(() => {
    if (!role) {
      if (profileLoadError && /network|timeout|timed out|fetch/i.test(profileLoadError)) {
        return "network";
      }
      return "api";
    }
    if (role === "customer" && pathname?.includes("/onboarding")) {
      return null;
    }
    if (!ALLOWED_ROLES.includes(role as UserRole)) {
      return "role";
    }
    return null;
  }, [role, profileLoadError, pathname]);
  const blocked = !loading && blockReason !== null;

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

  // Auto-retry when the app comes to foreground / network recovers so the
  // network-error block screen heals itself without any manual tap.
  useEffect(() => {
    if (!blocked || blockReason !== "network") return;
    const handler = () => { if (!loading) void refresh(); };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", handler);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", handler);
    return () => { subFocus.remove(); subRecover.remove(); };
  }, [blocked, blockReason, loading, refresh]);

  if (!user) return null;
  if (loading) {
    // §Provider-audit 2026-04 (loading-polish): use the branded gate so role
    // checks look consistent with auth / portal / profile-completion gates.
    return <GateLoadingScreen message="Checking access…" />;
  }
  if (blocked) {
    const isNetwork = blockReason === "network";
    return (
      // §provider-setup-seamless-ux 2026-05: use shared ScreenContainer +
      // EmptyState so the blocked screens match the rest of the app's chrome
      // (safe-area handling, tablet content clamp, brand background).
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <EmptyState
          icon={isNetwork ? "cloud-offline-outline" : "lock-closed-outline"}
          title={isNetwork ? "Can't reach server" : "Provider access only"}
          description={
            isNetwork
              ? "Start the backend (e.g. pnpm dev in apps/web). Set EXPO_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 for emulator, or your machine IP for a device). Then tap Retry."
              : "Your account is not set up for the provider app. Please use the customer app or contact support."
          }
          actionLabel={isNetwork ? "Retry" : "Sign out"}
          onAction={() => {
            if (isNetwork) {
              void refresh();
            } else {
              void handleSignOut();
            }
          }}
        />
        {isNetwork && (
          <View style={{ alignItems: "center", paddingBottom: 32 }}>
            <TouchableOpacity
              onPress={() => handleSignOut()}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={{
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: Colors.gray[600], fontSize: 14, fontWeight: "500" }}>
                Sign out
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScreenContainer>
    );
  }
  return <>{children}</>;
}
