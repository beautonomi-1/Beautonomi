"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { clientContactMatches } from "@/lib/phone";

interface Client {
  id: string;
  customer_id: string;
  customer: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url?: string;
  };
  total_bookings: number;
  total_spent: number;
  last_service_date?: string;
  tags?: string[];
  is_favorite: boolean;
}

interface ClientSelectorProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function ClientSelector({ selectedIds, onSelectionChange }: ClientSelectorProps) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  /** Names of clients seen in any result set, so selected badges survive a new search. */
  const [knownNames, setKnownNames] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchQuery.trim();
      setDebouncedSearchQuery(q.length >= 2 ? q : "");
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadClients();
  }, [debouncedSearchQuery]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const searchParam =
        debouncedSearchQuery.length >= 2
          ? `?search=${encodeURIComponent(debouncedSearchQuery)}`
          : "";
      const response = await fetcher.get<{ data: Client[] }>(
        `/api/provider/clients${searchParam}`,
      );
      const loaded = response.data || [];
      setClients(loaded);
      setKnownNames((prev) => {
        const next = new Map(prev);
        for (const c of loaded) {
          if (c.customer?.full_name) next.set(c.customer_id, c.customer.full_name);
        }
        return next;
      });
    } catch (error) {
      console.error("Failed to load clients:", error);
toast.error(t("web.provider.settings.pages.clients/list.failedToLoadClients"));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const q = searchQuery.trim();
    if (!q) return true;
    // The server already applied this exact search (it also matches tags and notes).
    if (debouncedSearchQuery === q) return true;
    return (
      clientContactMatches(q, {
        name: client.customer?.full_name,
        email: client.customer?.email,
        phone: client.customer?.phone,
      }) ||
      Boolean(client.tags?.some((tag) => tag.toLowerCase().includes(q.toLowerCase())))
    );
  });

  const toggleClient = (customerId: string) => {
    if (selectedIds.includes(customerId)) {
      onSelectionChange(selectedIds.filter((id) => id !== customerId));
    } else {
      onSelectionChange([...selectedIds, customerId]);
    }
  };

  const selectAll = () => {
    onSelectionChange(filteredClients.map((c) => c.customer_id));
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
<Label>{t("web.provider.pages.marketing/campaigns.selectClients", { count: selectedIds.length })}</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
{t("web.provider.bookings.bulkActions.selectAll")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
{t("web.provider.common.clear")}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
placeholder={t("web.provider.clientsPage.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-10"
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-md">
          {selectedIds.slice(0, 5).map((id) => {
            const name =
              clients.find((c) => c.customer_id === id)?.customer?.full_name || knownNames.get(id);
            return (
              <Badge key={id} variant="secondary" className="flex items-center gap-1">
{name || t("web.provider.pages.marketing/campaigns.unknown")}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => toggleClient(id)}
                />
              </Badge>
            );
          })}
          {selectedIds.length > 5 && (
<Badge variant="secondary">{t("web.provider.pages.marketing/campaigns.moreCount", { count: selectedIds.length - 5 })}</Badge>
          )}
        </div>
      )}

      <ScrollArea className="h-64 border rounded-md p-4">
        {isLoading ? (
<div className="text-center text-gray-500 py-8">{t("web.provider.settings.pages.clients/list.loadingClients")}</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
{searchQuery ? t("web.provider.pages.marketing/campaigns.noMatch") : t("web.provider.settings.pages.clients/list.noClientsFound")}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredClients.map((client) => {
              const isSelected = selectedIds.includes(client.customer_id);
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-gray-50 ${
                    isSelected ? "bg-blue-50 border-blue-200" : ""
                  }`}
                  onClick={() => toggleClient(client.customer_id)}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleClient(client.customer_id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
{client.customer?.full_name || t("web.provider.reports.pages.bookings/no-shows.unknownClient")}
                      </p>
                      {client.is_favorite && (
<Badge variant="outline" className="text-xs">{t("web.provider.pages.marketing/campaigns.favorite")}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
{client.customer?.email || client.customer?.phone || t("web.provider.pages.marketing/campaigns.noContact")}
                    </p>
                    <p className="text-xs text-gray-400">
{t("web.provider.pages.marketing/campaigns.bookingsSpent", { count: client.total_bookings, amount: client.total_spent ? `$${client.total_spent.toFixed(2)}` : "$0.00" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
