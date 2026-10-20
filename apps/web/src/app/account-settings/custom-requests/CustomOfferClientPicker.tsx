"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProviderClientRow } from "./custom-requests-page-types";

export type SelectedCustomOfferClient = { customer_id: string; label: string };

function rowLabel(client: ProviderClientRow, unknownLabel: string): string {
  const c = client.customer;
  return c?.full_name?.trim() || c?.email?.trim() || unknownLabel;
}

function rowSecondary(client: ProviderClientRow): string {
  const c = client.customer;
  return [c?.email, c?.phone].filter(Boolean).join(" · ");
}

export function CustomOfferClientPicker({
  value,
  onChange,
}: {
  value: SelectedCustomOfferClient | null;
  onChange: (next: SelectedCustomOfferClient | null) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProviderClientRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: ProviderClientRow[] }>(
          `/api/provider/clients?search=${encodeURIComponent(q)}&include_serviced=1&limit=20`,
        );
        if (!cancelled) setResults(res.data ?? []);
      } catch {
        if (!cancelled) {
          setResults([]);
          toast.error(t("web.accountSettings.customRequests.loadClientsFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, t]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="flex-1 text-sm font-medium text-gray-900 truncate">{value.label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onChange(null)}
        >
          {t("web.accountSettings.customRequests.changeClient")}
        </Button>
      </div>
    );
  }

  const unknown = t("web.accountSettings.customRequests.unknownClient");

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("web.accountSettings.customRequests.searchClientPlaceholder")}
        autoComplete="off"
      />
      {query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-xs text-gray-500">{t("web.accountSettings.customRequests.searchClientHint")}</p>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("web.accountSettings.customRequests.loadingClients")}
        </div>
      ) : null}
      {!loading && query.trim().length >= 2 && results.length === 0 ? (
        <p className="text-sm text-gray-500">{t("web.accountSettings.customRequests.noClientsFound")}</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 divide-y">
          {results.map((client) => {
            const cid = client.customer_id || client.customer?.id || client.id;
            if (!cid) return null;
            const label = rowLabel(client, unknown);
            const secondary = rowSecondary(client);
            return (
              <li key={cid}>
                <button
                  type="button"
                  className="w-full text-start px-3 py-2.5 hover:bg-gray-50"
                  onClick={() => onChange({ customer_id: cid, label })}
                >
                  <span className="block text-sm font-medium text-gray-900">{label}</span>
                  {secondary ? (
                    <span className="block text-xs text-gray-500 truncate">{secondary}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
