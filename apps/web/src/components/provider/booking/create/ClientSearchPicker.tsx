"use client";
import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { BookingSectionCard, BookingSectionLabel } from "../ui";
import { loadClientDefaultAddress } from "./load-client-default-address";

export type ClientSearchResult = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
};

interface ClientSearchPickerProps {
  clientName: string;
  clientId: string;
  onClientNameChange: (name: string) => void;
  onSelectClient: (client: ClientSearchResult) => void;
  onClearClient?: () => void;
  /** When at-home, load default address after client select */
  loadAddressOnSelect?: boolean;
  onAddressLoaded?: (address: {
    addressLine1: string;
    addressLine2: string;
    addressCity: string;
    addressState: string;
    addressPostalCode: string;
    addressCountry: string;
    addressLatitude: number | null;
    addressLongitude: number | null;
  }) => void;
}

export function ClientSearchPicker({
  clientName,
  clientId,
  onClientNameChange,
  onSelectClient,
  onClearClient,
  loadAddressOnSelect = false,
  onAddressLoaded,
}: ClientSearchPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (clientId && clientName && !query) return;
    if (query.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [savedRes, servicedRes] = await Promise.all([
          providerPortalFetch(`/api/provider/clients?search=${encodeURIComponent(query)}`),
          providerPortalFetch(`/api/provider/clients/serviced?search=${encodeURIComponent(query)}`),
        ]);

        const all: ClientSearchResult[] = [];

        if (savedRes.ok) {
          const savedData = await savedRes.json();
          for (const client of savedData.data || []) {
            const customer = client.customer || {};
            all.push({
              id: customer.id || client.customer_id,
              full_name: customer.full_name || t("web.messagingList.unknown"),
              email: customer.email || "",
              phone: customer.phone || "",
            });
          }
        }

        if (servicedRes.ok) {
          const servicedData = await servicedRes.json();
          const existing = new Set(all.map((c) => c.id));
          for (const item of servicedData.data || []) {
            const id = item.customer?.id || item.customer_id;
            if (existing.has(id)) continue;
            const customer = item.customer || {};
            all.push({
              id,
              full_name: customer.full_name || t("web.messagingList.unknown"),
              email: customer.email || "",
              phone: customer.phone || "",
            });
          }
        }

        if (!cancelled) {
          setResults(all);
          setShowResults(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, clientId, clientName]);

  const handleSelect = async (client: ClientSearchResult) => {
    onSelectClient(client);
    setQuery("");
    setResults([]);
    setShowResults(false);

    if (!loadAddressOnSelect || !onAddressLoaded) return;

    try {
      const loaded = await loadClientDefaultAddress(client.id);
      if (loaded) onAddressLoaded(loaded);
    } catch {
      /* client may not have address */
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel htmlFor="client-search" className="mb-2">
        {t("web.clientSearch.label")}
      </BookingSectionLabel>
      <div className="relative">
        <Input
          id="client-search"
          value={showResults ? query : clientName || query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onClientNameChange(next);
            if (clientId) onClearClient?.();
            setShowResults(next.length >= 2);
          }}
          onFocus={() => {
            if (query.length >= 2 || results.length > 0) setShowResults(true);
          }}
          placeholder={t("web.clientSearch.placeholder")}
          className="rounded-xl min-h-[44px]"
          autoComplete="off"
        />
        {searching ? (
          <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        ) : null}
        {showResults && results.length > 0 ? (
          <ul className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-48 overflow-y-auto">
            {results.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className="w-full text-start px-3 py-2.5 text-sm hover:bg-gray-50 touch-manipulation min-h-[44px]"
                  onClick={() => void handleSelect(client)}
                >
                  <span className="font-medium text-gray-900">{client.full_name}</span>
                  {client.phone ? (
                    <span className="block text-xs text-gray-500">{client.phone}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {clientId ? (
        <p className="text-xs text-emerald-700 mt-1.5">{t("web.clientSearch.savedLinked")}</p>
      ) : null}
    </BookingSectionCard>
  );
}
