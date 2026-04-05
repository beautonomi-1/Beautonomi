import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import type { UserRole } from "@beautonomi/types";

const ALLOWED_ROLES: UserRole[] = ["customer"];

interface RoleGateProps {
  children: React.ReactNode;
}

export function RoleGate({ children }: RoleGateProps) {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    (async () => {
      const res = await api.get<{ role: UserRole }>("/api/me/role");
      if (cancelled) return;
      setLoading(false);

      const raw = res.data as any;
      const data = raw?.data ?? raw;
      const roleFromApi = data?.role;

      if (res.error || !roleFromApi) {
        setError(true);
        return;
      }
      if (!ALLOWED_ROLES.includes(roleFromApi)) {
        setBlocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return <>{children}</>;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16, color: Colors.gray[600] }}>Checking access…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Something went wrong</Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500] }}>We could not verify your account. Please try again later or sign out.</Text>
        <TouchableOpacity style={{ marginTop: 32, borderRadius: 8, backgroundColor: Colors.gray[900], paddingHorizontal: 24, paddingVertical: 12 }} onPress={() => signOut()}>
          <Text style={{ fontWeight: "500", color: Colors.white }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (blocked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>This app is for customers only</Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500] }}>Your account is not set up for the customer app. Please use the provider app or contact support.</Text>
        <TouchableOpacity style={{ marginTop: 32, borderRadius: 8, backgroundColor: Colors.gray[900], paddingHorizontal: 24, paddingVertical: 12 }} onPress={() => signOut()}>
          <Text style={{ fontWeight: "500", color: Colors.white }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}
