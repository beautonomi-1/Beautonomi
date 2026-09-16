import { useCallback, useState } from "react";

export type AdminTableDensity = "comfortable" | "compact";

const DEFAULT_DENSITY: AdminTableDensity = "comfortable";

/**
 * Persists table row density in localStorage under `storageKey`.
 */
export function useAdminTableDensity(storageKey: string) {
  const [density, setDensityState] = useState<AdminTableDensity>(() => {
    if (typeof window === "undefined") return DEFAULT_DENSITY;
    return window.localStorage.getItem(storageKey) === "compact" ? "compact" : DEFAULT_DENSITY;
  });

  const setDensity = useCallback(
    (next: AdminTableDensity) => {
      setDensityState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* ignore quota / private mode */
      }
    },
    [storageKey],
  );

  const toggleDensity = useCallback(() => {
    setDensity(density === "compact" ? "comfortable" : "compact");
  }, [density, setDensity]);

  const rowPaddingClass = density === "compact" ? "py-1.5" : "py-3.5";
  const headerPaddingClass = density === "compact" ? "py-2" : "py-3.5";

  return {
    density,
    setDensity,
    toggleDensity,
    rowPaddingClass,
    headerPaddingClass,
    isCompact: density === "compact",
  };
}
