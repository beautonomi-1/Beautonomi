type Props = {
  open: boolean;
  title: string;
  reason?: string;
  counts?: { briefs: number; campaigns: number; plans?: number };
  onArchive: () => void;
  onClose: () => void;
};

export function GuardedDeleteDialog({ open, title, reason, counts, onArchive, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-md rounded-lg bg-white p-4 shadow-lg">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-zinc-600">{reason ?? "Cannot delete while linked."}</p>
        {counts ? (
          <ul className="mt-2 text-xs text-zinc-500">
            <li>Briefs: {counts.briefs}</li>
            <li>Campaigns: {counts.campaigns}</li>
            {counts.plans != null ? <li>Plans: {counts.plans}</li> : null}
          </ul>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white" onClick={onArchive}>
            Archive instead
          </button>
        </div>
      </div>
    </div>
  );
}
