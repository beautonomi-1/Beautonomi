import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { GateLoadingScreen } from "@/components/GateLoadingScreen";
import type { UserRole } from "@beautonomi/types";
import { authFlowBreadcrumb, captureError, isSentryEnabled, setAuthFlowTags } from "@/lib/sentry";

const ALLOWED_ROLES: UserRole[] = [
  "customer",
  "provider_onboarding",
  "provider_owner",
  "provider_staff",
];

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
  // cancelledRef is set by useEffect cleanup to prevent stale fetches from updating state.
  const cancelledRef = useRef(false);

  const runFetch = useCallback(async () => {
    if (!user?.id) return;
    const myFetch = ++fetchCountRef.current;
    cancelledRef.current = false;

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
        if (cancelledRef.current || fetchCountRef.current !== myFetch) return;
        setLoading(false);
        setErrorType("network");
        return;
      }
      if (cancelledRef.current || fetchCountRef.current !== myFetch) return;

      if (res.error) {
        const status = (res.error as { status?: number }).status;

        // Retry auth errors (iOS session commit lag) AND 5xx errors (self-heal user row race)
        const shouldRetry =
          ((status === 401 || status === 403) && attempt < 4) ||
          (status !== undefined && status >= 500 && attempt < 2);

        if (shouldRetry) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          if (!cancelledRef.current && fetchCountRef.current === myFetch) {
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
      if (!cancelledRef.current && fetchCountRef.current === myFetch) {
        setLoading(false);
        setErrorType("network");
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    cancelledRef.current = false;
    void runFetch();
    return () => {
      cancelledRef.current = true;
    };
  }, [user?.id, runFetch]);

  // §Customer-audit 2026-04 (loading-polish): branded gate for both the
  // "no user yet" and "checking role" phases so the whole auth chain shares
  // one animation instead of a mix of bare spinners.
  if (!user) return <>{children}</>;
  if (loading) return <GateLoadingScreen message="Checking access…" />;
  if (errorType) {
    const isNetwork = errorType === "network";
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors.white,
          padding: 24,
        }}
      >
        <Text
          style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}
        >
          {isNetwork ? "Can't reach server" : "Something went wrong"}
        </Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500], maxWidth: 320 }}>
          {isNetwork
            ? "Check your internet connection and tap Retry."
            : "We could not verify your account. Please try again or sign out."}
        </Text>
        <View style={{ marginTop: 32, flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            style={{
              borderRadius: 8,
              backgroundColor: Colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
            onPress={() => void runFetch()}
          >
            <Text style={{ fontWeight: "600", color: Colors.white }}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              borderRadius: 8,
              backgroundColor: Colors.gray[200],
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors.white,
          padding: 24,
        }}
      >
        <Text
          style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}
        >
          This app is not available for this account
        </Text>
        <Text style={{ marginTop: 8, textAlign: "center", color: Colors.gray[500] }}>
          Please use the right Beautonomi portal for your account or contact support.
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 32,
            borderRadius: 8,
            backgroundColor: Colors.gray[900],
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
          onPress={() => void signOut()}
        >
          <Text style={{ fontWeight: "500", color: Colors.white }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}
