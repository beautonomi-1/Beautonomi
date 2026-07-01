import { X } from "lucide-react";
import type { KbAudience } from "@/lib/learning";

export type KbFilterState = {
  audience: KbAudience | "all";
  contentType: string | "all";
  internalOnly: boolean;
  query: string;
};

type Props = {
  filters: KbFilterState;
  onChange: (next: KbFilterState) => void;
  totalShown: number;
  totalArticles: number;
  internalArticles: number;
};

const AUDIENCE_OPTIONS: Array<{ value: KbAudience | "all"; label: string }> = [
  { value: "all",      label: "All audiences" },
  { value: "general",  label: "General" },
  { value: "customer", label: "Customer" },
  { value: "provider", label: "Provider" },
  { value: "internal", label: "Internal" },
];

// content_type is constrained in the DB to ('article', 'video_guide')
// (see 307_learning_center_tree_and_content_type.sql).
const CONTENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all",         label: "All types" },
  { value: "article",     label: "Article" },
  { value: "video_guide", label: "Video guide" },
];

export function KnowledgeBaseFilters({
  filters,
  onChange,
  totalShown,
  totalArticles,
  internalArticles,
}: Props) {
  const set = <K extends keyof KbFilterState>(key: K, value: KbFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const hasActiveFilters =
    filters.audience !== "all" ||
    filters.contentType !== "all" ||
    filters.internalOnly;

  const clearAll = () =>
    onChange({ ...filters, audience: "all", contentType: "all", internalOnly: false });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm ring-1 ring-gray-950/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        {/* Audience */}
        <select
          value={filters.audience}
          onChange={(e) => set("audience", e.target.value as KbFilterState["audience"])}
          className="rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-gray-700 focus:border-gray-500 focus:outline-none"
          aria-label="Filter by audience"
        >
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Content type */}
        <select
          value={filters.contentType}
          onChange={(e) => set("contentType", e.target.value)}
          className="rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-gray-700 focus:border-gray-500 focus:outline-none"
          aria-label="Filter by content type"
        >
          {CONTENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Internal toggle */}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-gray-300"
            checked={filters.internalOnly}
            onChange={(e) => set("internalOnly", e.target.checked)}
          />
          Internal only
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
            {internalArticles}
          </span>
        </label>

        {/* Clear button */}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear
          </button>
        ) : null}

        {/* Result count */}
        <span className="ml-auto text-xs text-gray-500">
          <span className="font-semibold text-gray-900">{totalShown}</span>
          {" "}of{" "}
          <span className="font-semibold text-gray-900">{totalArticles}</span>
          {" "}articles
        </span>
      </div>
    </div>
  );
}
