type ActivityRow = {
  id: string;
  kind: string;
  body: string | null;
  created_at: string;
  meta?: Record<string, unknown>;
};

export function ApprovalTimeline({ items }: { items: ActivityRow[] }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">No approval activity yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((a) => (
        <li key={a.id} className="border-l-2 border-violet-200 pl-3">
          <p className="text-xs text-zinc-500">{a.created_at.slice(0, 16)}</p>
          <p className="font-medium">{a.kind}</p>
          {a.body ? <p className="text-zinc-700">{a.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
