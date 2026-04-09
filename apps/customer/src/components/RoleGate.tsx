import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import type { UserRole } from "@beautonomi/types";
import {
  authFlowBreadcrumb,
  captureError,
  isSentryEnabled,
  setAuthFlowTags,
} from "@/lib/sentry";

const ALLOWED_ROLES: UserRole[] = ["customer"];

interface RoleGateProps {
  children: React.ReactNode;
}

type ErrorType = "network" | "api" | null;

export function RoleGate({ children }: RoleGateProps) {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const fetchCountRef = useRef(0);

  const runFetch = useCallback(async () => {
    if (!user?.id) return;
    const myFetch = ++fetchCountRef.current;

    let cancelled = false;
    setLoading(true);
    setErrorType(null);
    setBlocked(false);

    if (isSentryEnabled()) {
      setAuthFlowTags({ guard_name: "role_gate" });
    }

    const fetchRole = async (attempt: number): Promise<void> => {
      let res: Awaited<ReturnType<typeof api.get<{ role: UserRole }>>>;
      try {
        res = await api.get<{ role: UserRole }>("/api/me/role");
      } catch {
        if (cancelled || fetchCountRef.current !== myFetch) return;
        setLoading(false);
        setErrorType("network");
        return;
      }
      if (cancelled || fetchCountRef.current !== myFetch) return;

      if (res.error) {
        const status = (res.error as { status?: number }).status;
        // Retry auth errors up to 4 times (iOS session commit lag)
        if ((status === 401 || status === 403) && attempt < 4) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          if (!cancelled && fetchCountRef.current === myFetch) {
            return fetchRole(attempt + 1);
          }
          return;
        }
        if (isSentryEnabled()) {
          authFlowBreadcrumb("role_gate", { outcome: "api_error", status });
          captureError(new Error("role_gate_api_error"), { area: "RoleGate.customer", status });
        }
        const errMsg = (res.error as { message?: string }).message ?? "";
        const isNet = /network|timeout|timed out|fetch|connection|econnrefused/i.test(errMsg);
        setLoading(false);
        setErrorType(isNet ? "network" : "api");
        return;
      }

      setLoading(false);
      const roleFromApi = res.data?.role;
      if (!roleFromApi) {
        if (isSentryEnabled()) {
          authFlowBreadcrumb("role_gate", { outcome: "missing_role" });
          captureError(new Error("role_gate_missing_role"), { area: "RoleGate.customer" });
        }
        setErrorType("api");
        return;
      }
      if (isSentryEnabled()) {
        authFlowBreadcrumb("role_gate", { outcome: "ok", role: roleFromApi });
      }
      if (!ALLOWED_ROLES.includes(roleFromApi)) {
        setBlocked(true);
      }
    };

    try {
      await fetchRole(0);
    } catch {
      if (!cancelled && fetchCountRef.current === myFetch) {
        setLoading(false);
        setErrorType("network");
      }
    }

    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void runFetch();
  }, [user?.id, runFetch]);

  if (!user) return <>{children}</>;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: Colors.gray[600] }}>Checking access…</Text>
      </View>
    );
  }
  if (errorType) {
    const isNetwork = errorType === "network";
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>
          {isNetwork ? "Can't reach server" : "Something went wrong"}
        </Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500], maxWidth: 320 }}>
          {isNetwork
            ? "Check your internet connection and tap Retry."
            : "We could not verify your account. Please try again or sign out."}
        </Text>
        <View style={{ marginTop: 32, flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            style={{ borderRadius: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => void runFetch()}
          >
            <Text style={{ fontWeight: "600", color: Colors.white }}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ borderRadius: 8, backgroundColor: Colors.gray[200], paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => void signOut()}
          >
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  if (blocked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}>
        <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>This app is for customers only</Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500] }}>Your account is not set up for the customer app. Please use the provider app or contact support.</Text>
        <TouchableOpacity style={{ marginTop: 32, borderRadius: 8, backgroundColor: Colors.gray[900], paddingHorizontal: 24, paddingVertical: 12 }} onPress={() => void signOut()}>
          <Text style={{ fontWeight: "500", color: Colors.white }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}
