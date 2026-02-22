/**
 * Concurrency Safety Utilities
 * 
 * Provides optimistic locking for appointment and time block mutations.
 * Uses version/updatedAt to detect stale data conflicts.
 * 
 * @module lib/scheduling/concurrency
 */

import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

export interface VersionedEntity {
  id: string;
  version?: number;
  updated_at?: string;
}

export interface OptimisticLockError {
  type: "STALE_VERSION";
  message: string;
  currentVersion?: number;
  attemptedVersion?: number;
  serverUpdatedAt?: string;
}

export interface MutationOptions<T> {
  /** The entity being updated */
  entity: T & VersionedEntity;
  /** The mutation function to execute */
  mutation: () => Promise<T>;
  /** Callback when conflict is detected */
  onConflict?: (error: OptimisticLockError) => void;
  /** Callback to refetch the entity */
  onRefetch?: () => Promise<T>;
  /** Show default toast on conflict */
  showToast?: boolean;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Check if server response indicates a version conflict
 */
export function isVersionConflict(error: any): boolean {
  // Check for common conflict status codes
  if (error?.status === 409 || error?.status === 412) {
    return true;
  }
  
  // Check for conflict message in response
  const message = error?.message?.toLowerCase() || "";
  const errorCode = error?.code?.toLowerCase() || "";
  
  return (
    message.includes("version") ||
    message.includes("conflict") ||
    message.includes("stale") ||
    message.includes("updated by another") ||
    message.includes("concurrent") ||
    errorCode === "version_conflict" ||
    errorCode === "stale_entity"
  );
}

/**
 * Extract conflict details from error response
 */
export function extractConflictDetails(error: any): OptimisticLockError {
  return {
    type: "STALE_VERSION",
    message: error?.message || "This record was updated elsewhere. Please refresh and try again.",
    currentVersion: error?.data?.currentVersion,
    attemptedVersion: error?.data?.attemptedVersion,
    serverUpdatedAt: error?.data?.serverUpdatedAt,
  };
}

// ============================================================================
// OPTIMISTIC LOCKING WRAPPER
// ============================================================================

/**
 * Execute a mutation with optimistic locking support
 * 
 * If a version conflict is detected:
 * 1. Shows a toast notification (if enabled)
 * 2. Calls onConflict callback
 * 3. Optionally refetches the entity
 */
export async function withOptimisticLock<T>({
  entity: _entity,
  mutation,
  onConflict,
  onRefetch,
  showToast = true,
}: MutationOptions<T>): Promise<{ success: boolean; data?: T; conflict?: OptimisticLockError }> {
  try {
    const result = await mutation();
    return { success: true, data: result };
  } catch (error: any) {
    if (isVersionConflict(error)) {
      const conflictDetails = extractConflictDetails(error);
      
      if (showToast) {
        toast.error("This record was updated elsewhere", {
          description: "Please refresh to see the latest changes.",
          action: onRefetch ? {
            label: "Refresh",
            onClick: () => onRefetch(),
          } : undefined,
        });
      }
      
      onConflict?.(conflictDetails);
      
      // Optionally auto-refetch
      if (onRefetch) {
        try {
          await onRefetch();
        } catch (refetchError) {
          console.error("Failed to refetch after conflict:", refetchError);
        }
      }
      
      return { success: false, conflict: conflictDetails };
    }
    
    // Re-throw non-conflict errors
    throw error;
  }
}

// ============================================================================
// VERSION HEADER UTILS
// ============================================================================

/**
 * Add version headers to a fetch request
 */
export function addVersionHeaders(
  headers: Record<string, string>,
  entity: VersionedEntity
): Record<string, string> {
  const newHeaders = { ...headers };
  
  if (entity.version !== undefined) {
    newHeaders["If-Match"] = String(entity.version);
  }
  
  if (entity.updated_at) {
    newHeaders["If-Unmodified-Since"] = entity.updated_at;
  }
  
  return newHeaders;
}

/**
 * Create version payload for mutations
 */
export function createVersionPayload(entity: VersionedEntity): Record<string, any> {
  const payload: Record<string, any> = {};
  
  if (entity.version !== undefined) {
    payload.expected_version = entity.version;
  }
  
  if (entity.updated_at) {
    payload.expected_updated_at = entity.updated_at;
  }
  
  return payload;
}

// ============================================================================
// REACT HOOK
// ============================================================================

import { useCallback, useState } from "react";

interface UseConcurrentMutationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
  onConflict?: (error: OptimisticLockError) => void;
  refetch?: () => Promise<T>;
}

/**
 * React hook for concurrent-safe mutations
 */
export function useConcurrentMutation<T, Args extends any[]>(
  mutationFn: (...args: Args) => Promise<T>,
  options: UseConcurrentMutationOptions<T> = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [hasConflict, setHasConflict] = useState(false);

  const mutate = useCallback(async (...args: Args): Promise<{ success: boolean; data?: T }> => {
    setIsLoading(true);
    setError(null);
    setHasConflict(false);

    try {
      const result = await mutationFn(...args);
      options.onSuccess?.(result);
      setIsLoading(false);
      return { success: true, data: result };
    } catch (err: any) {
      setIsLoading(false);
      
      if (isVersionConflict(err)) {
        setHasConflict(true);
        const conflictDetails = extractConflictDetails(err);
        
        toast.error("Record was updated elsewhere", {
          description: "Please refresh to see the latest changes.",
        });
        
        options.onConflict?.(conflictDetails);
        
        // Auto-refetch if provided
        if (options.refetch) {
          try {
            await options.refetch();
          } catch (refetchError) {
            console.error("Failed to refetch after conflict:", refetchError);
          }
        }
        
        return { success: false };
      }
      
      setError(err);
      options.onError?.(err);
      throw err;
    }
  }, [mutationFn, options]);

  const reset = useCallback(() => {
    setError(null);
    setHasConflict(false);
  }, []);

  return {
    mutate,
    isLoading,
    error,
    hasConflict,
    reset,
  };
}

// ============================================================================
// BATCH MUTATION SUPPORT
// ============================================================================

interface BatchMutationItem<T> {
  id: string;
  entity: T & VersionedEntity;
  mutation: () => Promise<T>;
}

interface BatchMutationResult<T> {
  successful: Array<{ id: string; data: T }>;
  failed: Array<{ id: string; error: any; isConflict: boolean }>;
}

/**
 * Execute multiple mutations with conflict detection
 * Continues processing even if some items conflict
 */
export async function batchMutateWithConflictDetection<T>(
  items: BatchMutationItem<T>[]
): Promise<BatchMutationResult<T>> {
  const result: BatchMutationResult<T> = {
    successful: [],
    failed: [],
  };

  for (const item of items) {
    try {
      const data = await item.mutation();
      result.successful.push({ id: item.id, data });
    } catch (error: any) {
      result.failed.push({
        id: item.id,
        error,
        isConflict: isVersionConflict(error),
      });
    }
  }

  // Show summary toast if there were conflicts
  const conflicts = result.failed.filter(f => f.isConflict);
  if (conflicts.length > 0) {
    toast.error(`${conflicts.length} item(s) had conflicts`, {
      description: "These records were updated elsewhere. Please refresh.",
    });
  }

  return result;
}
