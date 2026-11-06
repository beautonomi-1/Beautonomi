"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetcher } from "@/lib/http/fetcher";
import AccountPageFrame from "../components/account-page-frame";

export interface BlockedUserRow {
  id: string;
  user_id: string;
  reason: string | null;
  blocked_at: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function BlockedUsersPageClient() {
  const { t } = useTranslation();
  const bu = useCallback(
    (key: string, opts?: Record<string, string>) => t(`customer.mobile.screens.blockedUsers.${key}`, opts ?? {}) as string,
    [t],
  );
  const defaultName = t("customer.blockUser.defaultName") as string;

  const [rows, setRows] = useState<BlockedUserRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<BlockedUserRow | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const body = await fetcher.get<{ data: BlockedUserRow[] | null }>("/api/me/blocks", { staleTimeMs: 0 });
      setRows(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows || !q) return rows ?? [];
    return rows.filter((r) => (r.full_name ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  const confirmUnblock = async () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    setUnblockingId(target.user_id);
    try {
      await fetcher.delete(`/api/me/blocks/${encodeURIComponent(target.user_id)}`);
      setRows((prev) => (prev ?? []).filter((r) => r.user_id !== target.user_id));
      toast.success(t("web.accountSettings.safety.unblocked"));
    } catch {
      toast.error(t("customer.blockUser.unblockErrorBody"));
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <AccountPageFrame
      title={bu("title")}
      subtitle={bu("settingsDesc")}
      backHref="/account-settings/safety"
      parents={[{ label: t("customer.mobile.screens.safetyHub.title") as string, href: "/account-settings/safety" }]}
    >
      {loadError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p>{t("web.accountSettings.safety.blockedLoadFailed")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
            {t("web.accountSettings.safety.retry")}
          </Button>
        </div>
      ) : rows == null ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center">
          <Ban className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
          <p className="mt-3 text-gray-700">{bu("empty")}</p>
          <p className="mt-4 text-sm text-gray-500">{bu("emptyReportHint")}</p>
          <Button asChild variant="outline" className="mt-2 min-h-11 w-full sm:w-auto">
            <Link href="/account-settings/safety/report-user">{bu("emptyReportCta")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={bu("searchPlaceholder")}
              aria-label={bu("searchPlaceholder")}
              className="min-h-11 ps-9 text-base sm:text-sm"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500">{t("web.accountSettings.safety.noResults")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
              {filtered.map((row) => {
                const name = row.full_name || defaultName;
                return (
                  <li key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {row.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-600">
                          {name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{name}</p>
                        <p className="text-xs text-gray-500">
                          {row.reason
                            ? `${t(`customer.blockUser.reason.${row.reason}`, { defaultValue: row.reason })} · `
                            : ""}
                          {t("web.accountSettings.safety.blockedOn", {
                            date: new Date(row.blocked_at).toLocaleDateString(),
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={unblockingId === row.user_id}
                      onClick={() => setPending(row)}
                    >
                      {unblockingId === row.user_id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : bu("unblockAction")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <AlertDialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bu("unblockTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{bu("unblockBody", { name: pending?.full_name || defaultName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => void confirmUnblock()}>
              {bu("unblockAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountPageFrame>
  );
}
