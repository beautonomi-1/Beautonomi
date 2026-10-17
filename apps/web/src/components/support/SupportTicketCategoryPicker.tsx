"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  groupForCategory,
  groupLabelForSupportTicketCategoryI18n,
  labelForSupportTicketCategoryI18n,
  labelForSupportTicketGroupI18n,
  listGroupsForAudience,
  searchCategories,
  type SupportTicketCategoryAudience,
} from "@/lib/support/ticket-categories";
import { useTranslation } from "@beautonomi/i18n";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Lightbulb,
  MessageCircle,
  Package,
  Shield,
  Smartphone,
  Store,
  UserCircle,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "person-circle": UserCircle,
  calendar: Calendar,
  card: CreditCard,
  chatbubbles: MessageCircle,
  cube: Package,
  "phone-portrait": Smartphone,
  shield: Shield,
  storefront: Store,
  bulb: Lightbulb,
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  audience: SupportTicketCategoryAudience;
  id?: string;
  className?: string;
  triggerClassName?: string;
};

export function SupportTicketCategoryPicker({
  value,
  onChange,
  audience,
  id = "support-category",
  className,
  triggerClassName,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const groups = useMemo(() => listGroupsForAudience(audience), [audience]);
  const searchHits = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return searchCategories(q, audience);
  }, [query, audience]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  );

  const openPicker = useCallback(() => {
    setQuery("");
    setActiveGroupId(value ? groupForCategory(value)?.id ?? null : null);
    setOpen(true);
  }, [value]);

  const selectValue = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQuery("");
      setActiveGroupId(null);
    },
    [onChange],
  );

  const groupLabel = value ? groupLabelForSupportTicketCategoryI18n(value, t) : null;
  const itemLabel = value ? labelForSupportTicketCategoryI18n(value, t) : null;
  const isSafetyGroup = (groupId: string) => groupId === "safety";

  return (
    <div className={className}>
      <button
        type="button"
        id={id}
        onClick={openPicker}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 text-start shadow-sm transition-[box-shadow,border-color,background-color] focus-visible:border-[#FF0077]/35 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0077]/15",
          triggerClassName,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          {value ? (
            <>
              {groupLabel ? (
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {groupLabel}
                </span>
              ) : null}
              <span className="block truncate text-[13px] font-semibold text-zinc-800">{itemLabel}</span>
            </>
          ) : (
            <span className="text-[13px] text-zinc-400">Choose what this is mostly about…</span>
          )}
        </span>
        <ChevronRight className="ms-2 h-4 w-4 shrink-0 rotate-90 text-zinc-400" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          suppressFallbackTitle
          hideClose
          className="flex max-h-[min(32rem,90vh)] flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 p-0 sm:max-w-lg"
        >
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-zinc-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {activeGroup && !query.trim() ? (
                <button
                  type="button"
                  className="rounded-lg p-1 text-zinc-600 hover:bg-zinc-100"
                  aria-label="Back to categories"
                  onClick={() => setActiveGroupId(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              <DialogTitle className="truncate text-base font-semibold text-zinc-900">
                {activeGroup && !query.trim()
                  ? labelForSupportTicketGroupI18n(activeGroup.id, activeGroup.label, t)
                  : "Category"}
              </DialogTitle>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <div className="border-b border-zinc-100 px-4 py-2.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories…"
              className="h-10 rounded-xl border-zinc-200 bg-zinc-50 text-sm"
              autoComplete="off"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {query.trim() ? (
              searchHits.length === 0 ? (
                <div className="space-y-3 px-2 py-6 text-center">
                  <p className="text-sm text-zinc-500">No categories match your search.</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    onClick={() => selectValue("general_inquiry")}
                  >
                    <HelpCircle className="h-4 w-4" />
                    General question
                  </button>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {searchHits.map((hit) => (
                    <li key={hit.value}>
                      <button
                        type="button"
                        className={cn(
                          "flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2.5 text-start hover:bg-zinc-50",
                          hit.value === value && "bg-[#FF0077]/8 ring-1 ring-[#FF0077]/25",
                        )}
                        onClick={() => selectValue(hit.value)}
                      >
                        <span className="text-sm font-medium text-zinc-900">
                          {labelForSupportTicketCategoryI18n(hit.value, t)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {labelForSupportTicketGroupI18n(hit.groupId, hit.groupLabel, t)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : activeGroup ? (
              <ul className="space-y-0.5">
                {activeGroup.items.map((item) => (
                  <li key={item.value}>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-sm text-zinc-800 hover:bg-zinc-50",
                        item.value === value && "bg-[#FF0077]/8 font-semibold text-[#FF0077] ring-1 ring-[#FF0077]/25",
                      )}
                      onClick={() => selectValue(item.value)}
                    >
                      {labelForSupportTicketCategoryI18n(item.value, t)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const Icon = ICONS[g.iconKey] ?? HelpCircle;
                  const safety = isSafetyGroup(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-start transition hover:border-zinc-300 hover:bg-zinc-50/80",
                        safety
                          ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
                          : "border-zinc-200 bg-white",
                        value && groupForCategory(value)?.id === g.id && "ring-2 ring-[#FF0077]/30",
                      )}
                      onClick={() => setActiveGroupId(g.id)}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          safety ? "bg-rose-100 text-rose-700" : "bg-[#FF0077]/10 text-[#FF0077]",
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-zinc-900">
                          {labelForSupportTicketGroupI18n(g.id, g.label, t)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-zinc-500">{g.description}</span>
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
