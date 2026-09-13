"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { Lock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import type { StaffPermissions } from "@/lib/auth/permissions";

interface PermissionGateProps {
  permission: keyof StaffPermissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLockScreen?: boolean;
  message?: string;
  actionMessage?: string;
  actionHref?: string;
}

export function PermissionGate({
  permission,
  children,
  fallback,
  showLockScreen = true,
  message,
  actionMessage,
  actionHref,
}: PermissionGateProps) {
  const { t } = useTranslation();
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasPermission(permission)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (!showLockScreen) {
      return null;
    }

    const defaultMessage = message || t("web.permissionGate.defaultMessage");
    const defaultActionMessage = actionMessage || t("web.permissionGate.defaultAction");
    const defaultActionHref = actionHref || "/provider/settings/team/permissions";

    return (
      <div className="flex items-center justify-center min-h-[400px] p-6">
        <Card className="max-w-md w-full border-2 border-gray-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">{t("web.permissionGate.accessRestricted")}</CardTitle>
            <CardDescription className="mt-2">
              {defaultMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-yellow-800">
                {defaultActionMessage}
              </p>
            </div>
            {actionHref && (
              <Button
                asChild
                className="w-full bg-primary hover:bg-primary-hover"
              >
                <Link href={defaultActionHref}>
                  {t("web.permissionGate.requestAccess")}
                </Link>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="w-full"
            >
              <Link href="/provider/dashboard">
                {t("web.permissionGate.goToDashboard")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
