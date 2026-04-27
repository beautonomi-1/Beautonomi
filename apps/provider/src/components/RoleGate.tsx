import { useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { Colors } from "@/constants/colors";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
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

  if (!user) return null;
  if (loading) {
    // §Provider-audit 2026-04 (loading-polish): use the branded gate so role
    // checks look consistent with auth / portal / profile-completion gates.
    return <GateLoadingScreen message="Checking access…" />;
  }
  if (blocked) {
    const isNetwork = blockReason === "network";
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isNetwork ? "#EFF6FF" : Colors.primaryLight,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Ionicons
            name={isNetwork ? "cloud-offline-outline" : "lock-closed-outline"}
            size={28}
            color={isNetwork ? "#2563eb" : Colors.primary}
          />
        </View>
        <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>
          {isNetwork ? "Can't reach server" : "Provider access only"}
        </Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500], maxWidth: 320 }}>
          {isNetwork
            ? "Start the backend (e.g. pnpm dev in apps/web). Set EXPO_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 for emulator, or your machine IP for a device). Then tap Retry."
            : "Your account is not set up for the provider app. Please use the customer app or contact support."}
        </Text>
        <View style={{ marginTop: 32, flexDirection: "row" }}>
          {isNetwork && (
            <TouchableOpacity
              style={{ backgroundColor: "#2563eb", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginRight: 12 }}
              onPress={() => {
                void refresh();
              }}
            >
              <Text style={{ fontWeight: "600", color: Colors.white, fontSize: 16 }}>Retry</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{
              backgroundColor: isNetwork ? Colors.gray[200] : Colors.primary,
              borderRadius: 12,
              paddingHorizontal: 32,
              paddingVertical: 14,
            }}
            onPress={() => handleSignOut()}
          >
            <Text style={{ fontWeight: "600", fontSize: 16, color: isNetwork ? Colors.gray[700] : Colors.white }}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return <>{children}</>;
}
