export function StickySaveBar(props: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
}) {
  if (!props.dirty) return null;
  return (
    <div className="sticky bottom-4 z-40 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg">
      <p className="text-sm text-amber-900">You have unsaved changes on this tab.</p>
      <div className="flex gap-2">
        {props.onDiscard ? (
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={props.onDiscard}>
            Discard
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={props.saving}
          onClick={props.onSave}
        >
          {props.saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
