"use client";

import { useState, useEffect, useRef } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import type { StaffPermissions } from "@/lib/auth/permissions";

interface UsePermissionsResult {
  permissions: StaffPermissions | null;
  isLoading: boolean;
  isOwner: boolean;
  hasPermission: (permission: keyof StaffPermissions) => boolean;
  hasAnyPermission: (permissions: (keyof StaffPermissions)[]) => boolean;
  hasAllPermissions: (permissions: (keyof StaffPermissions)[]) => boolean;
}

// Cache permissions to survive tab switches and temporary role loss
const permissionsCache = new Map<string, { permissions: StaffPermissions; isOwner: boolean; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'beautonomi_permissions_cache';

// Load from localStorage on module load
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.userId && parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
        permissionsCache.set(parsed.userId, {
          permissions: parsed.permissions,
          isOwner: parsed.isOwner,
          timestamp: parsed.timestamp,
        });
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function usePermissions(): UsePermissionsResult {
  const { user, role } = useAuth();
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const lastRoleRef = useRef<string | null>(null);

  useEffect(() => {
    const loadPermissions = async () => {
      // If no user, clear permissions
      if (!user) {
        // But check cache first - might be temporary
        if (lastUserIdRef.current) {
          const cached = permissionsCache.get(lastUserIdRef.current);
          if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            // Keep cached permissions temporarily
            setPermissions(cached.permissions);
            setIsOwner(cached.isOwner);
            setIsLoading(false);
            return;
          }
        }
        setPermissions(null);
        setIsOwner(false);
        setIsLoading(false);
        return;
      }

      // If role is null/undefined but we have user, might be temporary (tab switch)
      // Check if we had provider role before
      if (!role || (role !== 'provider_owner' && role !== 'provider_staff')) {
        // Check if we had provider role before - might be temporary loss
        if (lastUserIdRef.current === user.id && lastRoleRef.current && 
            (lastRoleRef.current === 'provider_owner' || lastRoleRef.current === 'provider_staff')) {
          // User had provider role before - use cached permissions
          const cached = permissionsCache.get(user.id);
          if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            setPermissions(cached.permissions);
            setIsOwner(cached.isOwner);
            setIsLoading(false);
            // Don't update refs - wait for role to come back
            return;
          }
        }
        
        // Not a provider or never was - clear permissions
        setPermissions(null);
        setIsOwner(false);
        setIsLoading(false);
        return;
      }

      // Update refs
      lastUserIdRef.current = user.id;
      lastRoleRef.current = role;

      // Check cache first (memory, then localStorage)
      let cached = permissionsCache.get(user.id);
      if (!cached && typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.userId === user.id && parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
              cached = {
                permissions: parsed.permissions,
                isOwner: parsed.isOwner,
                timestamp: parsed.timestamp,
              };
              // Restore to memory cache
              permissionsCache.set(user.id, cached);
            }
          }
        } catch {
          // Ignore storage errors
        }
      }
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setPermissions(cached.permissions);
        setIsOwner(cached.isOwner);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetcher.get<{
          data: {
            isOwner: boolean;
            permissions: StaffPermissions;
          };
        }>("/api/provider/permissions");

        // Cache the permissions in memory and localStorage
        const cacheData = {
          permissions: response.data.permissions,
          isOwner: response.data.isOwner,
          timestamp: Date.now(),
        };
        permissionsCache.set(user.id, cacheData);
        
        // Also persist to localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              userId: user.id,
              ...cacheData,
            }));
          } catch {
            // Ignore storage errors
          }
        }

        setPermissions(response.data.permissions);
        setIsOwner(response.data.isOwner);
      } catch (error) {
        console.error("Failed to load permissions:", error);
        // On error, try to use cached permissions if available
        const cached = permissionsCache.get(user.id);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          setPermissions(cached.permissions);
          setIsOwner(cached.isOwner);
        } else {
          setPermissions(null);
          setIsOwner(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadPermissions();
  }, [user, role]);

  const hasPermission = (permission: keyof StaffPermissions): boolean => {
    // If we're the owner, always allow
    if (isOwner) return true;
    
    // If permissions are loading or not available, be permissive (fail open)
    // This prevents menu items from disappearing during tab switches
    if (isLoading || !permissions) {
      // Check cache as fallback
      if (user) {
        const cached = permissionsCache.get(user.id);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          return cached.permissions[permission] === true || cached.isOwner;
        }
      }
      // If no cache, be permissive during loading/unavailable state
      // Better to show items that might be restricted than hide items that should be visible
      return true;
    }
    
    return permissions[permission] === true;
  };

  const hasAnyPermission = (perms: (keyof StaffPermissions)[]): boolean => {
    if (isOwner) return true;
    if (!permissions) return false;
    return perms.some(perm => permissions[perm] === true);
  };

  const hasAllPermissions = (perms: (keyof StaffPermissions)[]): boolean => {
    if (isOwner) return true;
    if (!permissions) return false;
    return perms.every(perm => permissions[perm] === true);
  };

  return {
    permissions,
    isLoading,
    isOwner,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
