"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserRoundCheck } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";
import { firstIncompleteRequiredItemId, getCompletionHref } from "@/lib/profile/completion-deeplinks";

type CompletionPayload = {
  percentage: number;
  checklistItems: { id: string; completed: boolean; required: boolean }[];
};

export default function ProfileCompletionBanner() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ pct: number; href: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{ data: CompletionPayload | null }>("/api/me/profile-completion", { staleTimeMs: 0 })
      .then((body) => {
        const data = body?.data;
        if (cancelled || !data || data.percentage >= 100) return;
        const itemId = firstIncompleteRequiredItemId(data.checklistItems);
        if (!itemId) return;
        setState({ pct: data.percentage, href: getCompletionHref(itemId) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  return (
    <Link
      href={state.href}
      className="mt-6 md:mt-8 flex w-full items-center gap-3 rounded-2xl border border-pink-200 bg-pink-50 p-4 hover:bg-pink-100 active:bg-pink-100"
    >
      <UserRoundCheck className="h-6 w-6 shrink-0 text-[#FF0077]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-gray-900">{t("customer.accountSettings.profileCompletionTitle")}</span>
        <span className="mt-0.5 block text-sm text-gray-700">
          {t("customer.accountSettings.profileCompletionBanner", { pct: state.pct })}
        </span>
        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white" aria-hidden>
          <span className="block h-full rounded-full bg-[#FF0077]" style={{ width: `${state.pct}%` }} />
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
