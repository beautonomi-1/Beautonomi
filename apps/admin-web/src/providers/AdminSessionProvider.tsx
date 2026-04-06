import React, { createContext, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@beautonomi/types";
import type { AdminSection } from "@beautonomi/admin-access";
import { ADMIN_SECTION_USERS_TRUST, canAccessSection } from "@beautonomi/admin-access";
import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { signOut as signOutAuth } from "@/lib/authSignIn";

export interface BootstrapState {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  isSuperadmin: boolean;
}

interface AdminSessionContextValue {
  bootstrap: BootstrapState | null;
  sectionRoles: Record<AdminSection, UserRole[]> | null;
  /** True when section-permissions API failed; nav falls back to code defaults (may differ from DB). */
  sectionPermissionsError: boolean;
  refetchSectionPermissions: () => void;
  isLoading: boolean;
  isError: boolean;
  errorStatus: number | null;
  refetchBootstrap: () => void;
  signOut: () => Promise<void>;
  canAccess: (section: AdminSection) => boolean;
  canUseGlobalSearch: boolean;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const bootstrapQuery = useQuery({
    queryKey: adminQueryKeys.bootstrap(),
    queryFn: async () => {
      try {
        return await adminApi.getBootstrap();
      } catch (e) {
        if (e instanceof AdminApiError && e.status === 401) {
          throw e;
        }
        throw e;
      }
    },
    retry: false,
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
  });

  const sectionPermQuery = useQuery({
    queryKey: adminQueryKeys.sectionPermissions(),
    queryFn: async () => {
      const raw = await adminApi.getJson<{ sectionRoles: Record<AdminSection, UserRole[]> }>(
        "/api/admin/settings/section-permissions"
      );
      return raw.sectionRoles;
    },
    enabled: !!bootstrapQuery.data,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AdminApiError && (isUnauthorizedStatus(error.status) || isForbiddenStatus(error.status))) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const bootstrap = bootstrapQuery.data;
  const sectionRoles = sectionPermQuery.data ?? null;

  const value = useMemo<AdminSessionContextValue>(() => {
    const role = (bootstrap?.role as UserRole) ?? ("customer" as UserRole);
    const canAccess = (section: AdminSection) =>
      canAccessSection(role, section, sectionRoles ?? undefined);
    const canUseGlobalSearch = canAccess(ADMIN_SECTION_USERS_TRUST);

    return {
      bootstrap: bootstrap
        ? {
            userId: bootstrap.user.id,
            email: bootstrap.user.email ?? null,
            fullName: bootstrap.user.full_name ?? null,
            role,
            isSuperadmin: bootstrap.is_superadmin,
          }
        : null,
      sectionRoles,
      sectionPermissionsError: sectionPermQuery.isError,
      refetchSectionPermissions: () => {
        void sectionPermQuery.refetch();
      },
      isLoading: bootstrapQuery.isLoading,
      isError: bootstrapQuery.isError,
      errorStatus:
        bootstrapQuery.error instanceof AdminApiError ? bootstrapQuery.error.status : null,
      refetchBootstrap: () => {
        void bootstrapQuery.refetch();
      },
      signOut: async () => {
        await signOutAuth();
        qc.removeQueries({ queryKey: adminQueryKeys.root });
      },
      canAccess,
      canUseGlobalSearch,
    };
  }, [
    bootstrap,
    bootstrapQuery.isLoading,
    bootstrapQuery.isError,
    bootstrapQuery.error,
    bootstrapQuery.refetch,
    sectionRoles,
    sectionPermQuery.isError,
    sectionPermQuery.refetch,
    qc,
  ]);

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession outside AdminSessionProvider");
  return ctx;
}

/** Safe optional hook for login page (no provider). */
export function useAdminSessionOptional() {
  return useContext(AdminSessionContext);
}
