"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

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
              full_name: customer.full_name || "Unknown",
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
              full_name: customer.full_name || "Unknown",
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
      let addr: Record<string, unknown> | null = null;
      const res = await providerPortalFetch(`/api/provider/clients/${client.id}`);
      if (res.ok) {
        const body = await res.json();
        const clientData = body?.data ?? body;
        addr =
          (clientData?.customer?.default_address as Record<string, unknown>) ??
          (clientData?.default_address as Record<string, unknown>) ??
          null;
      }

      if (!addr) {
        const addrRes = await providerPortalFetch(`/api/provider/clients/${client.id}/addresses`);
        if (addrRes.ok) {
          const addrBody = await addrRes.json();
          const addresses = addrBody?.data ?? addrBody ?? [];
          if (Array.isArray(addresses) && addresses.length > 0) {
            addr =
              (addresses.find((a: Record<string, unknown>) => a.is_default || a.is_primary) as Record<
                string,
                unknown
              >) ?? (addresses[0] as Record<string, unknown>);
          }
        }
      }

      if (addr) {
        onAddressLoaded({
          addressLine1: String(addr.address_line1 || addr.line1 || addr.street || ""),
          addressLine2: String(addr.address_line2 || addr.line2 || ""),
          addressCity: String(addr.city || ""),
          addressPostalCode: String(addr.postal_code || addr.postalCode || ""),
          addressCountry: String(addr.country || ""),
          addressLatitude:
            addr.latitude != null
              ? Number(addr.latitude)
              : addr.lat != null
                ? Number(addr.lat)
                : null,
          addressLongitude:
            addr.longitude != null
              ? Number(addr.longitude)
              : addr.lng != null
                ? Number(addr.lng)
                : null,
        });
      }
    } catch {
      /* client may not have address */
    }
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel htmlFor="client-search" className="mb-2">
        Client
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
          placeholder="Search or enter client name"
          className="rounded-xl min-h-[44px]"
          autoComplete="off"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        ) : null}
        {showResults && results.length > 0 ? (
          <ul className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-48 overflow-y-auto">
            {results.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 touch-manipulation min-h-[44px]"
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
        <p className="text-xs text-emerald-700 mt-1.5">Saved client linked</p>
      ) : null}
    </BookingSectionCard>
  );
}
