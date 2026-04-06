export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <p className="font-medium text-gray-800">{title}</p>
      {description ? <p className="mt-2 text-sm text-gray-500">{description}</p> : null}
    </div>
  );
}
