import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import type { UserRole } from "@beautonomi/types";

const ALLOWED_ROLES: UserRole[] = ["provider_owner", "provider_staff"];

type BlockReason = "network" | "role" | "api";

interface RoleGateProps {
  children: React.ReactNode;
}

export function RoleGate({ children }: RoleGateProps) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<BlockReason | null>(null);

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login" as never);
  }

  const checkRole = useCallback(async (isRetry = false) => {
    if (!user) return;
    setLoading(true);
    setBlocked(false);
    setBlockReason(null);
    setRole(null);

    // Longer timeout for role check (45s); cold Next.js can be slow. Single retry on timeout.
    const { data, error } = await api.fetch<{ role: UserRole }>("/api/me/role", {
      method: "GET",
      timeout: 45000,
    });
    setLoading(false);

    const isTimeoutOrNetwork =
      error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT";
    if (isTimeoutOrNetwork && !isRetry) {
      console.log("[AUTH] RoleGate role check timed out, retrying once…");
      return checkRole(true);
    }
    if (isTimeoutOrNetwork) {
      console.log("[AUTH] RoleGate blocked: network/timeout", { message: error?.message });
      setBlockReason("network");
      setBlocked(true);
      return;
    }
    if (error || !data) {
      console.log("[AUTH] RoleGate blocked: API error or no data", { error: error?.message, hasData: !!data });
      setBlockReason("api");
      setBlocked(true);
      return;
    }
    if (!ALLOWED_ROLES.includes(data.role)) {
      console.log("[AUTH] RoleGate blocked: role not allowed", { role: data.role });
      setBlockReason("role");
      setBlocked(true);
    } else {
      setRole(data.role);
    }
  }, [user]);

  useEffect(() => {
    checkRole();
  }, [checkRole]);

  if (!user) return null;
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="mt-4 text-gray-600">Checking access…</Text>
      </View>
    );
  }
  if (blocked) {
    const isNetwork = blockReason === "network";
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
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
        <Text className="text-center text-lg font-semibold text-gray-900">
          {isNetwork ? "Can't reach server" : "Provider access only"}
        </Text>
        <Text className="mt-2 text-center text-gray-500 max-w-sm">
          {isNetwork
            ? "Start the backend (e.g. pnpm dev in apps/web). Set EXPO_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 for emulator, or your machine IP for a device). Then tap Retry."
            : "Your account is not set up for the provider app. Please use the customer app or contact support."}
        </Text>
        <View className="mt-8 flex-row gap-3">
          {isNetwork && (
            <TouchableOpacity
              style={{ backgroundColor: "#2563eb", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 }}
              onPress={() => checkRole()}
            >
              <Text className="font-semibold text-white text-base">Retry</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{
              backgroundColor: isNetwork ? "#E5E7EB" : Colors.primary,
              borderRadius: 12,
              paddingHorizontal: 32,
              paddingVertical: 14,
            }}
            onPress={() => handleSignOut()}
          >
            <Text className={`font-semibold text-base ${isNetwork ? "text-gray-700" : "text-white"}`}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return <>{children}</>;
}
