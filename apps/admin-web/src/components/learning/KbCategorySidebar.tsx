import { Lock } from "lucide-react";
import { audienceLabel, type KbCategorySection } from "@/lib/learning";

type Props = {
  sections: KbCategorySection[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
};

export function KbCategorySidebar({ sections, activeId, onSelect }: Props) {
  return (
    <nav aria-label="Knowledge base categories" className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
          activeId === null
            ? "bg-gray-900 font-semibold text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        <span>All categories</span>
      </button>

      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            activeId === section.id
              ? "bg-gray-900 font-semibold text-white"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span className="min-w-0 truncate">{section.title}</span>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                activeId === section.id
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {section.articles.length}
            </span>
            {section.visibility === "internal" ? (
              <Lock
                className={`h-3 w-3 ${activeId === section.id ? "text-white/70" : "text-amber-600"}`}
                aria-label="Internal"
              />
            ) : (
              <span
                className={`text-[10px] ${activeId === section.id ? "text-white/70" : "text-gray-400"}`}
              >
                {audienceLabel(section.audience)}
              </span>
            )}
          </div>
        </button>
      ))}
    </nav>
  );
}
