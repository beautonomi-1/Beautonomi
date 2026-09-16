import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

const MODAL_MAX: Record<"md" | "lg" | "xl" | "2xl", string> = {
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-[95vw] sm:max-w-3xl",
  "2xl": "max-w-[98vw] sm:max-w-5xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

/**
 * Confirmations and short forms (UI conventions §7). Backdrop click and Escape key close.
 */
export function AdminModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  labelledBy = "admin-modal-title",
  describedBy: describedByProp,
  size = "md",
  disableBackdropClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  /** Wide dialogs for CMS-style forms (notification templates, rich editors). */
  size?: "md" | "lg" | "xl" | "2xl";
  /** When true, backdrop click and Escape do not close the dialog. */
  disableBackdropClose?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const autoDescribedBy = useId();
  const describedBy = description ? describedByProp ?? autoDescribedBy : undefined;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      prev?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (disableBackdropClose) return;
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || active === dialogRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, disableBackdropClose]);

  if (!open) return null;

  function handleBackdropClick() {
    if (disableBackdropClose) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-2xl sm:shadow-lg",
          MODAL_MAX[size],
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={labelledBy} className="text-lg font-semibold text-gray-900">
          {title}
        </h3>
        {description ? (
          <p id={describedBy} className="mt-2 text-sm text-gray-600">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}
