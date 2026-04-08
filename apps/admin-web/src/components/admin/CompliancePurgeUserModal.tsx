import { useCallback, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";

const PHRASE = "DELETE USER FOREVER" as const;

type PurgeSuccessPayload = {
  report?: unknown;
  compliance_audit_id?: string | null;
  compliance_audit_write_error?: string | null;
};

/**
 * Superadmin-only compliance purge (POST /api/admin/compliance/purge-user).
 * Mirrors the legacy Next `CompliancePurgeUserDialog` flow.
 */
export function CompliancePurgeUserModal(props: {
  open: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  onComplete?: () => void;
}) {
  const { open, onClose, userId, userEmail, onComplete } = props;
  const [reason, setReason] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PurgeSuccessPayload | null>(null);

  const reset = useCallback(() => {
    setReason("");
    setEmailConfirm("");
    setPhrase("");
    setAck(false);
    setBusy(false);
    setError(null);
    setDone(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 20) {
      setError("Reason must be at least 20 characters (audit requirement).");
      return;
    }
    if (!ack) {
      setError("Confirm that you understand this action is irreversible.");
      return;
    }
    if (phrase.trim() !== PHRASE) {
      setError(`Type exactly: ${PHRASE}`);
      return;
    }

    setBusy(true);
    try {
      const payload = await adminApi.postJson<PurgeSuccessPayload>("/api/admin/compliance/purge-user", {
        user_id: userId,
        reason: reason.trim(),
        confirmation_phrase: PHRASE,
        target_email_confirmation: emailConfirm.trim(),
        acknowledge_irreversible: true,
      });
      setDone({
        report: payload?.report,
        compliance_audit_id: payload?.compliance_audit_id ?? null,
        compliance_audit_write_error: payload?.compliance_audit_write_error ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AdminModal
      open={open}
      onClose={handleClose}
      title={done ? "Purge confirmation report" : "Purge user (compliance)"}
      description={
        done
          ? `Store this record with your compliance files.${done.compliance_audit_id ? ` Audit id: ${done.compliance_audit_id}.` : ""}${done.compliance_audit_write_error ? ` Warning: ${done.compliance_audit_write_error}` : ""}`
          : "Permanently deletes this login, profile, and cascading data. Superadmin only. This cannot be undone."
      }
      footer={
        done ? (
          <>
            <button
              type="button"
              className={adminToolbarButtonClass(false)}
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(done.report, null, 2));
              }}
            >
              Copy report JSON
            </button>
            <button
              type="button"
              className={`${adminToolbarButtonClass(false)} bg-gray-900 text-white`}
              onClick={() => {
                onComplete?.();
                handleClose();
              }}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <button type="button" className={adminToolbarButtonClass(busy)} disabled={busy} onClick={handleClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`${adminToolbarButtonClass(busy)} border-red-700 bg-red-600 text-white hover:bg-red-700`}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Purging…" : "Purge permanently"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
          {JSON.stringify(done.report, null, 2)}
        </pre>
      ) : (
        <div className="space-y-3 text-sm">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p> : null}
          <label className="block">
            <span className="text-gray-600">Reason (min. 20 characters)</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reference: ticket ID, DSAR reference, or legal basis…"
            />
            <span className="text-xs text-gray-500">{reason.trim().length}/5000</span>
          </label>
          <label className="block">
            <span className="text-gray-600">Type the account email to confirm</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={emailConfirm}
              onChange={(e) => setEmailConfirm(e.target.value)}
              autoComplete="off"
              placeholder={userEmail}
            />
            <span className="text-xs text-gray-500">Must match: {userEmail || "—"}</span>
          </label>
          <label className="block">
            <span className="text-gray-600">Confirmation phrase</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              placeholder={PHRASE}
            />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
            <span className="text-gray-600">
              I understand this permanently removes the account and associated platform data, and I am authorised to
              perform this erasure.
            </span>
          </label>
        </div>
      )}
    </AdminModal>
  );
}
