'use client';

import { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/providers/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}

/**
 * Component that conditionally renders children based on user permission
 * 
 * @example
 * <PermissionGuard permission="admin:manage_users">
 *   <UserManagementPanel />
 * </PermissionGuard>
 */
export default function PermissionGuard({
  permission,
  children,
  fallback = null,
  showLoading = false,
}: PermissionGuardProps) {
  const { role } = useAuth();
  const userRole = role || null;
  const { hasPermission, loading } = usePermission(userRole, permission);

  if (loading && showLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (loading) {
    return null;
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
