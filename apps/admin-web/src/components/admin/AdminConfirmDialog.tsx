import { type ReactNode, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminAuditTrailLink } from "@/components/admin/AdminAuditTrailLink";

export function AdminConfirmDialog({
  open,
  onClose,
  title,
  consequence,
  preview,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  requireTypedConfirm,
  typedValue,
  onTypedChange,
  onConfirm,
  busy,
  confirmDisabled: confirmDisabledProp,
  disableBackdropClose,
  auditTrail,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  consequence: string;
  preview?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  /** When set, user must type this exact string to enable confirm. */
  requireTypedConfirm?: string;
  typedValue?: string;
  onTypedChange?: (value: string) => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  confirmDisabled?: boolean;
  disableBackdropClose?: boolean;
  auditTrail?: { entityType: string; entityId: string; label?: string };
}) {
  const [internalTyped, setInternalTyped] = useState("");
  const typed = typedValue ?? internalTyped;
  const setTyped = onTypedChange ?? setInternalTyped;
  const confirmDisabled =
    confirmDisabledProp ??
    (Boolean(busy) ||
      (requireTypedConfirm ? typed.trim() !== requireTypedConfirm : false));

  const handleClose = () => {
    if (!onTypedChange) setInternalTyped("");
    onClose();
  };

  const backdropLocked = disableBackdropClose || (requireTypedConfirm ? typed.trim().length > 0 : false);

  return (
    <AdminModal
      open={open}
      onClose={handleClose}
      title={title}
      description={consequence}
      size="lg"
      disableBackdropClose={backdropLocked}
      footer={
        <>
          <button
            type="button"
            className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={handleClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`inline-flex min-h-11 touch-manipulation items-center justify-center rounded-xl px-4 text-sm font-medium text-white disabled:opacity-50 ${
              variant === "danger" ? "bg-red-700 hover:bg-red-800" : "bg-gray-900 hover:bg-gray-800"
            }`}
            disabled={confirmDisabled}
            aria-busy={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {auditTrail ? (
        <div className="mb-3">
          <AdminAuditTrailLink
            entityType={auditTrail.entityType}
            entityId={auditTrail.entityId}
            label={auditTrail.label ?? "View audit trail"}
          />
        </div>
      ) : null}
      {preview ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-800 whitespace-pre-line">
          {preview}
        </div>
      ) : null}
      {requireTypedConfirm ? (
        <div className="mt-4 space-y-2">
          <label htmlFor="admin-confirm-type" className="block text-sm text-gray-600">
            Type <span className="font-medium text-gray-900">{requireTypedConfirm}</span> to confirm
          </label>
          <input
            id="admin-confirm-type"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
            autoComplete="off"
          />
        </div>
      ) : null}
    </AdminModal>
  );
}
