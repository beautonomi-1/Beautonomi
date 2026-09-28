import React, { createContext, useContext, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@beautonomi/types";
import type { AdminSection } from "@beautonomi/admin-access";
import { ADMIN_SECTION_OVERVIEW, ADMIN_SECTION_SECURITY_COMPLIANCE, canAccessSection } from "@beautonomi/admin-access";
import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
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
  sectionPermissionsError: boolean;
  isSectionPermissionsPending: boolean;
  refetchSectionPermissions: () => void;
  isLoading: boolean;
  isError: boolean;
  errorStatus: number | null;
  errorCode: string | null;
  refetchBootstrap: () => void;
  signOut: () => Promise<void>;
  canAccess: (section: AdminSection) => boolean;
  canUseGlobalSearch: boolean;
  grcHubEnabled: boolean;
  grcRoles: string[];
  /** Effective GRC permission keys from bootstrap (the API re-checks every call). */
  grcPermissions: string[];
  hasGrc: (permission: string) => boolean;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

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
    const grcPermissions = bootstrap?.grc_permissions ?? [];
    const canAccess = (section: AdminSection) => {
      if (section === ADMIN_SECTION_SECURITY_COMPLIANCE) {
        return bootstrap?.feature_flags?.grc_hub_enabled === true && bootstrap?.can_access_security_compliance === true;
      }
      return canAccessSection(role, section, sectionRoles ?? undefined);
    };
    const canUseGlobalSearch = canAccess(ADMIN_SECTION_OVERVIEW);
    const isSectionPermissionsPending = Boolean(
      bootstrap &&
        !bootstrap.is_superadmin &&
        sectionPermQuery.isLoading &&
        !sectionPermQuery.isError
    );

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
      isSectionPermissionsPending,
      refetchSectionPermissions: () => {
        void sectionPermQuery.refetch();
      },
      isLoading: bootstrapQuery.isLoading,
      isError: bootstrapQuery.isError,
      errorStatus:
        bootstrapQuery.error instanceof AdminApiError ? bootstrapQuery.error.status : null,
      errorCode:
        bootstrapQuery.error instanceof AdminApiError ? bootstrapQuery.error.code ?? null : null,
      refetchBootstrap: () => {
        void bootstrapQuery.refetch();
      },
      signOut: async () => {
        await signOutAuth();
        qc.removeQueries({ queryKey: adminQueryKeys.root });
        navigate(adminSpaTo("/admin/login"), { replace: true });
      },
      canAccess,
      canUseGlobalSearch,
      grcHubEnabled: bootstrap?.feature_flags?.grc_hub_enabled === true,
      grcRoles: bootstrap?.grc_roles ?? [],
      grcPermissions,
      hasGrc: (permission: string) => grcPermissions.includes(permission),
    };
  }, [
    bootstrap,
    bootstrapQuery.isLoading,
    bootstrapQuery.isError,
    bootstrapQuery.error,
    bootstrapQuery.refetch,
    sectionRoles,
    sectionPermQuery.isError,
    sectionPermQuery.isLoading,
    sectionPermQuery.refetch,
    qc,
    navigate,
  ]);

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession outside AdminSessionProvider");
  return ctx;
}

export function useAdminSessionOptional() {
  return useContext(AdminSessionContext);
}
