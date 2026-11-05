import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { BreadcrumbSuffix } from "@/lib/breadcrumbMap";

interface AdminBreadcrumbContextValue {
  /** Current leaf-label override (set by detail pages once they resolve entity names). */
  leafLabel: string | undefined;
  setLeafLabel: (label: string | undefined) => void;
  /** Override parent crumb href (e.g. filtered support queue). */
  parentHref: string | undefined;
  setParentHref: (href: string | undefined) => void;
  /** Append a crumb without replacing the queue label (split-pane selection). */
  suffix: BreadcrumbSuffix | undefined;
  setSuffix: (suffix: BreadcrumbSuffix | undefined) => void;
}

const AdminBreadcrumbContext = createContext<AdminBreadcrumbContextValue>({
  leafLabel: undefined,
  setLeafLabel: () => {},
  parentHref: undefined,
  setParentHref: () => {},
  suffix: undefined,
  setSuffix: () => {},
});

export function AdminBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [leafLabel, setLeafLabelRaw] = useState<string | undefined>(undefined);
  const [parentHref, setParentHrefRaw] = useState<string | undefined>(undefined);
  const [suffix, setSuffixRaw] = useState<BreadcrumbSuffix | undefined>(undefined);
  const setLeafLabel = useCallback((label: string | undefined) => setLeafLabelRaw(label), []);
  const setParentHref = useCallback((href: string | undefined) => setParentHrefRaw(href), []);
  const setSuffix = useCallback((next: BreadcrumbSuffix | undefined) => setSuffixRaw(next), []);
  return (
    <AdminBreadcrumbContext.Provider
      value={{ leafLabel, setLeafLabel, parentHref, setParentHref, suffix, setSuffix }}
    >
      {children}
    </AdminBreadcrumbContext.Provider>
  );
}

export function useAdminBreadcrumbContext() {
  return useContext(AdminBreadcrumbContext);
}

/**
 * Call this in a detail page to set the human-readable name of the entity
 * being viewed.  The breadcrumb bar will replace "Provider", "User", etc. with
 * the actual name.
 *
 * Pass `undefined` or call with no argument to clear the override when the
 * component unmounts.
 *
 * @example
 * ```tsx
 * const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDERS_OPERATIONS);
 * useAdminBreadcrumbLeaf(provider?.business_name);
 * ```
 */
export function useAdminBreadcrumbLeaf(label: string | undefined) {
  const { setLeafLabel } = useAdminBreadcrumbContext();
  // Use an effect-like pattern: set on every render where label changes, clear on unmount.
  // We deliberately avoid useEffect to prevent a flash where the generic label shows first.
  // The hook is called unconditionally so label changes are reflected immediately.
  //
  // Note: this is intentionally called in render so the label is set synchronously.
  // Calling setLeafLabel during render is safe here because it does NOT trigger
  // re-render of siblings; it only updates the provider state once per label change.
  useAdminBreadcrumbLeafEffect(label, setLeafLabel);
}

import { useEffect } from "react";
function useAdminBreadcrumbLeafEffect(
  label: string | undefined,
  set: (l: string | undefined) => void
) {
  useEffect(() => {
    set(label);
    return () => set(undefined);
  }, [label, set]);
}

/** Override the parent breadcrumb href for the current page (cleared on unmount). */
export function useAdminBreadcrumbParentHref(href: string | undefined) {
  const { setParentHref } = useAdminBreadcrumbContext();
  useEffect(() => {
    setParentHref(href);
    return () => setParentHref(undefined);
  }, [href, setParentHref]);
}

/** Split-pane selection crumb (cleared on unmount). */
export function useAdminBreadcrumbSuffix(suffix: BreadcrumbSuffix | undefined) {
  const { setSuffix } = useAdminBreadcrumbContext();
  useEffect(() => {
    setSuffix(suffix);
    return () => setSuffix(undefined);
  }, [suffix, setSuffix]);
}
