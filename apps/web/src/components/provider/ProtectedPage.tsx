"use client";

import React from "react";
import { PermissionGate } from "./PermissionGate";
import type { StaffPermissions } from "@/lib/auth/permissions";

interface ProtectedPageProps {
  permission: keyof StaffPermissions;
  children: React.ReactNode;
  message?: string;
}

/**
 * Wrapper component for pages that require specific permissions
 * Shows lock screen if user doesn't have access
 */
export function ProtectedPage({
  permission,
  children,
  message,
}: ProtectedPageProps) {
  return (
    <PermissionGate
      permission={permission}
      showLockScreen={true}
      message={message}
      actionMessage="Contact your administrator to request access to this feature"
      actionHref="/provider/settings/team/permissions"
    >
      {children}
    </PermissionGate>
  );
}
