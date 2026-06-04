import { useEffect, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";

export type AdminSubscriptionActionKind = "assign_plan" | "cancel" | "reactivate";

export type AdminSubscriptionActionPayload = {
  kind: AdminSubscriptionActionKind;
  subId: string;
  providerName: string;
  currentPlanName: string;
  currentStatus: string;
  targetPlanName?: string;
  targetPlanIsFree?: boolean;
  currentPlanIsFree?: boolean;
  expiresAt?: string | null;
};

type Props = {
  open: boolean;
  payload: AdminSubscriptionActionPayload | null;
  onClose: () => void;
  onConfirm: (payload: AdminSubscriptionActionPayload) => void;
  isPending?: boolean;
};

function formatExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function AdminSubscriptionActionModal({
  open,
  payload,
  onClose,
  onConfirm,
  isPending = false,
}: Props) {
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!open) setConfirmName("");
  }, [open, payload?.subId]);

  if (!payload) return null;

  const expiryLabel = formatExpiry(payload.expiresAt);
  const requireNameMatch = payload.kind === "cancel";
  const nameOk =
    !requireNameMatch ||
    confirmName.trim().toLowerCase() === payload.providerName.trim().toLowerCase();

  const title =
    payload.kind === "assign_plan"
      ? "Assign subscription plan"
      : payload.kind === "cancel"
        ? "Cancel paid subscription"
        : "Reactivate subscription";

  const description =
    payload.kind === "assign_plan"
      ? `This will set ${payload.providerName} to "${payload.targetPlanName ?? "the selected plan"}" and mark the subscription active.`
      : payload.kind === "cancel"
        ? `You are cancelling the paid subscription for ${payload.providerName}.`
        : `Restore an active subscription record for ${payload.providerName}.`;

  const footer = (
    <>
      <button
        type="button"
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        disabled={isPending}
        onClick={onClose}
      >
        Go back
      </button>
      <button
        type="button"
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
          payload.kind === "cancel"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-gray-900 hover:bg-gray-800"
        }`}
        disabled={isPending || !nameOk}
        onClick={() => onConfirm(payload)}
      >
        {isPending
          ? "Saving…"
          : payload.kind === "assign_plan"
            ? "Assign plan"
            : payload.kind === "cancel"
              ? "Confirm cancel"
              : "Reactivate"}
      </button>
    </>
  );

  return (
    <AdminModal open={open} onClose={onClose} title={title} description={description} footer={footer}>
      <dl className="space-y-2 text-sm text-gray-700">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Provider</dt>
          <dd className="font-medium text-gray-900 text-right">{payload.providerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Current plan</dt>
          <dd className="text-right">{payload.currentPlanName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Current status</dt>
          <dd className="text-right">{payload.currentStatus || "—"}</dd>
        </div>
        {payload.kind === "assign_plan" && payload.targetPlanName ? (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">New plan</dt>
            <dd className="font-medium text-gray-900 text-right">{payload.targetPlanName}</dd>
          </div>
        ) : null}
      </dl>

      {payload.kind === "assign_plan" ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Clears cancellation flags and sets status to active.</li>
          {payload.targetPlanIsFree ? (
            <li>Free plan: clears Paystack subscription fields on file.</li>
          ) : (
            <li>
              Paid plan: if a Paystack subscription exists, it will be disabled and the provider may need to
              complete billing in the app.
            </li>
          )}
        </ul>
      ) : null}

      {payload.kind === "reactivate" ? (
        <p className="mt-4 text-sm text-gray-600">
          Restores <span className="font-medium">active</span> status and clears cancellation timestamps so the
          provider app and billing record stay in sync.
        </p>
      ) : null}

      {payload.kind === "cancel" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-600">
            {expiryLabel
              ? `Access continues until ${expiryLabel} (period end), then the subscription is marked cancelled. Paystack billing will be stopped when applicable.`
              : "The subscription will be marked cancelled immediately. Paystack billing will be stopped when applicable."}
          </p>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            To block platform access entirely, suspend the provider account under Provider operations — not
            subscription cancel.
          </p>
          <label className="block text-sm text-gray-700">
            Type <span className="font-semibold">{payload.providerName}</span> to confirm
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
          </label>
        </div>
      ) : null}
    </AdminModal>
  );
}
