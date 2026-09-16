import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";

export type AdminConfirmReasonField =
  | boolean
  | {
      label?: string;
      placeholder?: string;
      required?: boolean;
    };

export type AdminConfirmRequest = {
  title: string;
  consequence: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  requireTypedConfirm?: string;
  reasonField?: AdminConfirmReasonField;
  preview?: ReactNode;
  busy?: boolean;
  auditTrail?: { entityType: string; entityId: string; label?: string };
  onConfirm: (ctx: { reason?: string }) => void | Promise<void>;
};

type OpenState = AdminConfirmRequest | null;

function reasonFieldLabel(field: AdminConfirmReasonField | undefined): string {
  if (!field) return "";
  if (typeof field === "boolean") return "Reason (optional)";
  return field.label ?? "Reason (optional)";
}

function reasonFieldPlaceholder(field: AdminConfirmReasonField | undefined): string | undefined {
  if (!field || typeof field === "boolean") return undefined;
  return field.placeholder;
}

function reasonFieldRequired(field: AdminConfirmReasonField | undefined): boolean {
  if (!field || typeof field === "boolean") return false;
  return Boolean(field.required);
}

/** Wraps {@link AdminConfirmDialog} open state for imperative confirm flows. */
export function useAdminConfirmAction() {
  const [dialog, setDialog] = useState<OpenState>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    if (busy) return;
    setDialog(null);
    setReason("");
    setTyped("");
  }, [busy]);

  const requestConfirm = useCallback((req: AdminConfirmRequest) => {
    setReason("");
    setTyped("");
    setDialog(req);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!dialog) return;
    if (dialog.requireTypedConfirm && typed.trim() !== dialog.requireTypedConfirm) return;
    if (reasonFieldRequired(dialog.reasonField) && !reason.trim()) return;
    setBusy(true);
    try {
      await dialog.onConfirm({ reason: reason.trim() || undefined });
      setDialog(null);
      setReason("");
      setTyped("");
    } finally {
      setBusy(false);
    }
  }, [dialog, reason, typed]);

  const isDirty = useMemo(() => {
    if (reason.trim()) return true;
    if (typed.trim()) return true;
    return false;
  }, [reason, typed]);

  const ConfirmDialog = useCallback(() => {
    if (!dialog) return null;

    const showReason = Boolean(dialog.reasonField);
    const reasonRequired = reasonFieldRequired(dialog.reasonField);
    const reasonPreview = showReason ? (
      <label className="block space-y-2">
        <span className="text-sm text-gray-600">{reasonFieldLabel(dialog.reasonField)}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={reasonFieldPlaceholder(dialog.reasonField)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </label>
    ) : null;

    const preview =
      dialog.preview || reasonPreview ? (
        <>
          {dialog.preview}
          {reasonPreview}
        </>
      ) : undefined;

    const confirmDisabled =
      Boolean(busy || dialog.busy) ||
      (dialog.requireTypedConfirm ? typed.trim() !== dialog.requireTypedConfirm : false) ||
      (reasonRequired && !reason.trim());

    return (
      <AdminConfirmDialog
        open
        onClose={close}
        title={dialog.title}
        consequence={dialog.consequence}
        confirmLabel={dialog.confirmLabel}
        cancelLabel={dialog.cancelLabel}
        variant={dialog.variant}
        requireTypedConfirm={dialog.requireTypedConfirm}
        typedValue={typed}
        onTypedChange={setTyped}
        preview={preview}
        auditTrail={dialog.auditTrail}
        busy={busy || dialog.busy}
        confirmDisabled={confirmDisabled}
        disableBackdropClose={isDirty}
        onConfirm={handleConfirm}
      />
    );
  }, [busy, close, dialog, handleConfirm, isDirty, reason, typed]);

  return {
    requestConfirm,
    close,
    confirmOpen: dialog != null,
    ConfirmDialog,
  };
}
