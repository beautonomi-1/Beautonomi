"use client";

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
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Client[] }>("/api/provider/clients");
      setClients(response.data || []);
    } catch (error) {
      console.error("Failed to load clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.customer?.full_name?.toLowerCase().includes(query) ||
      client.customer?.email?.toLowerCase().includes(query) ||
      client.customer?.phone?.includes(query)
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
        <Label>Select Clients ({selectedIds.length} selected)</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-md">
          {selectedIds.slice(0, 5).map((id) => {
            const client = clients.find((c) => c.customer_id === id);
            return (
              <Badge key={id} variant="secondary" className="flex items-center gap-1">
                {client?.customer?.full_name || "Unknown"}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => toggleClient(id)}
                />
              </Badge>
            );
          })}
          {selectedIds.length > 5 && (
            <Badge variant="secondary">+{selectedIds.length - 5} more</Badge>
          )}
        </div>
      )}

      <ScrollArea className="h-64 border rounded-md p-4">
        {isLoading ? (
          <div className="text-center text-gray-500 py-8">Loading clients...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? "No clients match your search" : "No clients found"}
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
                        {client.customer?.full_name || "Unknown Client"}
                      </p>
                      {client.is_favorite && (
                        <Badge variant="outline" className="text-xs">Favorite</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {client.customer?.email || client.customer?.phone || "No contact"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {client.total_bookings} bookings • {client.total_spent ? `$${client.total_spent.toFixed(2)}` : "$0.00"} spent
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
