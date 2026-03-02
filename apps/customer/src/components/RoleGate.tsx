import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import type { UserRole } from "@beautonomi/types";

const ALLOWED_ROLES: UserRole[] = ["customer"];

interface RoleGateProps {
  children: React.ReactNode;
}

export function RoleGate({ children }: RoleGateProps) {
  const { user, signOut } = useAuth();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    (async () => {
      const res = await api.get<{ role: UserRole }>("/api/me/role");
      if (cancelled) return;
      setLoading(false);

      // Unwrap nested response (some APIs return { data: { role } })
      const raw = res.data as any;
      const data = raw?.data ?? raw;
      const roleFromApi = data?.role;

      if (res.error || !roleFromApi) {
        // API error or no role: allow access and treat as customer.
        // New signups may not have users table row yet; handle_new_user runs async.
        setRole("customer");
        return;
      }
      if (!ALLOWED_ROLES.includes(roleFromApi)) {
        setBlocked(true);
      } else {
        setRole(roleFromApi);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return <>{children}</>;
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-gray-600">Checking access…</Text>
      </View>
    );
  }
  if (blocked) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Text className="text-center text-lg font-semibold text-gray-900">
          This app is for customers only
        </Text>
        <Text className="mt-2 text-center text-gray-500">
          Your account is not set up for the customer app. Please use the provider app or contact support.
        </Text>
        <TouchableOpacity
          className="mt-8 rounded-lg bg-gray-900 px-6 py-3"
          onPress={() => signOut()}
        >
          <Text className="font-medium text-white">Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}
