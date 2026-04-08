import type { ReactNode } from "react";

/**
 * Confirmations and short forms (UI conventions §7). Backdrop click closes.
 */
export function AdminModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  labelledBy = "admin-modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  labelledBy?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-h-[90vh] sm:rounded-2xl sm:shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={labelledBy} className="text-lg font-semibold text-gray-900">
          {title}
        </h3>
        {description ? <p className="mt-2 text-sm text-gray-600">{description}</p> : null}
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}
