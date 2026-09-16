import { cn } from "@/lib/cn";

export function AdminSavedViewChips({
  views,
  activeViewId,
  onSelect,
  className,
}: {
  views: Array<{ id: string; label: string }>;
  activeViewId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 overflow-x-auto pb-1", className)}>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onSelect(view.id)}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            activeViewId === view.id
              ? "bg-gray-900 text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
          )}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
