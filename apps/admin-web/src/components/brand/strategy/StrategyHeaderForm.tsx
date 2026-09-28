import { useEffect, useState } from "react";

type Props = {
  positioning: string;
  brandPromise: string;
  notes: string;
  locked: boolean;
  onSave: (patch: { positioning: string; brand_promise: string; notes: string }) => void;
};

export function StrategyHeaderForm({ positioning, brandPromise, notes, locked, onSave }: Props) {
  const [pos, setPos] = useState(positioning);
  const [promise, setPromise] = useState(brandPromise);
  const [n, setN] = useState(notes);

  useEffect(() => {
    setPos(positioning);
    setPromise(brandPromise);
    setN(notes);
  }, [positioning, brandPromise, notes]);

  useEffect(() => {
    if (locked) return;
    const t = setTimeout(() => {
      if (pos !== positioning || promise !== brandPromise || n !== notes) {
        onSave({ positioning: pos, brand_promise: promise, notes: n });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [pos, promise, n, locked, onSave, positioning, brandPromise, notes]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm md:col-span-2">
        <span className="text-zinc-600">Positioning</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={3}
          disabled={locked}
          value={pos}
          onChange={(e) => setPos(e.target.value)}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="text-zinc-600">Brand promise</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          disabled={locked}
          value={promise}
          onChange={(e) => setPromise(e.target.value)}
        />
      </label>
      <label className="block text-sm md:col-span-2">
        <span className="text-zinc-600">Notes</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1.5"
          rows={2}
          disabled={locked}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
      </label>
    </div>
  );
}
