'use client';

import { useState, useEffect } from 'react';
import { hasPermission, getRolePermissions, type Permission } from '@/lib/permissions';

/**
 * Hook to check if a user has a specific permission
 * @param userRole - The user's role
 * @param permissionKey - The permission key to check
 * @returns { hasPermission: boolean, loading: boolean }
 */
export function usePermission(userRole: string | null, permissionKey: string) {
  const [hasPerm, setHasPerm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function checkPermission() {
      if (!userRole) {
        if (mounted) {
          setHasPerm(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const result = await hasPermission(userRole, permissionKey);
        if (mounted) {
          setHasPerm(result);
        }
      } catch (error) {
        console.error(`Error checking permission ${permissionKey}:`, error);
        if (mounted) {
          setHasPerm(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    checkPermission();

    return () => {
      mounted = false;
    };
  }, [userRole, permissionKey]);

  return { hasPermission: hasPerm, loading };
}

/**
 * Hook to get all permissions for a role
 * @param role - The role to get permissions for
 * @returns { permissions: Permission[], loading: boolean }
 */
export function useRolePermissions(role: string | null) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function fetchPermissions() {
      if (!role) {
        if (mounted) {
          setPermissions([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const perms = await getRolePermissions(role);
        if (mounted) {
          setPermissions(perms);
        }
      } catch (error) {
        console.error('Error fetching role permissions:', error);
        if (mounted) {
          setPermissions([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchPermissions();

    return () => {
      mounted = false;
    };
  }, [role]);

  return { permissions, loading };
}
