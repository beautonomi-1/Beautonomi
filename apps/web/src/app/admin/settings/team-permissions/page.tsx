"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Save, Shield } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import {
  ALL_SECTIONS,
  SECTION_LABELS,
  ADMIN_ROLES_FOR_SECTIONS,
  ROLE_LABELS,
} from "@/lib/admin-sections";
import type { AdminSection } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";

export default function TeamPermissionsPage() {
  const [sectionRoles, setSectionRoles] = useState<Record<string, UserRole[]> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, role } = useAuth();

  useEffect(() => {
    if (user?.id && role === "superadmin") {
      loadPermissions();
    } else if (role != null && role !== "superadmin") {
      setIsLoading(false);
    }
  }, [user?.id, role]);

  const loadPermissions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: { sectionRoles: Record<string, UserRole[]> } }>(
        "/api/admin/settings/section-permissions"
      );
      setSectionRoles(response.data?.sectionRoles ?? null);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load section permissions";
      setError(errorMessage);
      console.error("Error loading section permissions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!sectionRoles) return;
    try {
      setIsSaving(true);
      await fetcher.put("/api/admin/settings/section-permissions", { sectionRoles });
      toast.success("Section permissions saved");
    } catch (err) {
      toast.error("Failed to save section permissions");
      console.error("Error saving section permissions:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = (section: AdminSection, r: UserRole) => {
    setSectionRoles((prev) => {
      if (!prev) return prev;
      const current = prev[section] ?? [];
      const has = current.includes(r);
      const next = has ? current.filter((x) => x !== r) : [...current, r];
      return { ...prev, [section]: next };
    });
  };

  const isChecked = (section: AdminSection, r: UserRole) => {
    const roles = sectionRoles?.[section] ?? [];
    return roles.includes(r);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading section permissions..." />
      </div>
    );
  }

  if (error || sectionRoles === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load section permissions"
          description={error ?? "Unable to load section permissions"}
          action={{ label: "Retry", onClick: loadPermissions }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-5xl">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 flex items-center gap-2">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8" />
            Team permissions
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Control which admin roles can access each section. Superadmin always has access to all sections.
          </p>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-700">Section</th>
                  {ADMIN_ROLES_FOR_SECTIONS.map((r) => (
                    <th key={r} className="text-center p-2 font-medium text-gray-700 whitespace-nowrap">
                      {ROLE_LABELS[r] ?? r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_SECTIONS.map((section) => (
                  <tr key={section} className="border-b last:border-b-0 hover:bg-gray-50/50">
                    <td className="p-3 font-medium text-gray-900">{SECTION_LABELS[section] ?? section}</td>
                    {ADMIN_ROLES_FOR_SECTIONS.map((r) => (
                      <td key={r} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked(section, r)}
                          onChange={() => toggle(section, r)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}
