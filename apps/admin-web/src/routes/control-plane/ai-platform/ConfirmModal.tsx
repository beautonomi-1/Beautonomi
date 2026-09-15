import type { ReactNode } from "react";
import { AdminPanel } from "@/components/ui/AdminPanel";

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <AdminPanel className="max-w-lg w-full space-y-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
        <div className="text-sm text-gray-700">{props.body}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
