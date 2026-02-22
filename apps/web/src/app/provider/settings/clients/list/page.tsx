"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Star, Calendar, DollarSign, User, Heart } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Client {
  id: string;
  customer_id: string;
  customer: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    rating_average: number | null;
    review_count: number | null;
  };
  notes: string | null;
  tags: string[] | null;
  is_favorite: boolean;
  last_service_date: string | null;
  total_bookings: number;
  total_spent: number;
  created_at: string;
}

interface ServicedCustomer {
  customer_id: string;
  customer: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    rating_average: number | null;
    review_count: number | null;
  };
  last_service_date: string;
  total_bookings: number;
  total_spent: number;
  is_saved: boolean; // Whether they're in provider_clients
}

export default function ClientListPage() {
  const [activeTab, setActiveTab] = useState<"all" | "saved" | "serviced">("all");
  const [clients, setClients] = useState<Client[]>([]);
  const [servicedCustomers, setServicedCustomers] = useState<ServicedCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [clientNotes, setClientNotes] = useState("");
  const [clientTags, setClientTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    loadClients();
  }, [activeTab]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      
      if (activeTab === "saved" || activeTab === "all") {
        try {
          const savedResponse = await fetcher.get<{ data: Client[] }>(
            "/api/provider/clients"
          );
          setClients(savedResponse.data || []);
        } catch (error: any) {
          console.error("Error loading saved clients:", error);
          const errorMessage = error instanceof FetchError
            ? error.message
            : error?.error?.message || "Failed to load saved clients";
          toast.error(errorMessage);
          setClients([]);
        }
      }

      if (activeTab === "serviced" || activeTab === "all") {
        try {
          const servicedResponse = await fetcher.get<{ data: ServicedCustomer[] }>(
            "/api/provider/clients/serviced"
          );
          setServicedCustomers(servicedResponse.data || []);
        } catch (error: any) {
          console.error("Error loading serviced customers:", error);
          const errorMessage = error instanceof FetchError
            ? error.message
            : error?.error?.message || "Failed to load serviced customers";
          toast.error(errorMessage);
          setServicedCustomers([]);
        }
      }
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveClient = async (customerId: string) => {
    try {
      await fetcher.post("/api/provider/clients", {
        customer_id: customerId,
        notes: clientNotes.trim() || null,
        tags: clientTags.length > 0 ? clientTags : null,
      });
      toast.success("Client saved successfully");
      setIsAddClientModalOpen(false);
      setClientNotes("");
      setClientTags([]);
      setSelectedCustomerId(null);
      await loadClients();
    } catch (error: any) {
      console.error("Error saving client:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save client";
      toast.error(errorMessage);
    }
  };

  const handleToggleFavorite = async (clientId: string, isFavorite: boolean) => {
    try {
      await fetcher.patch(`/api/provider/clients/${clientId}`, {
        is_favorite: !isFavorite,
      });
      toast.success(isFavorite ? "Removed from favorites" : "Added to favorites");
      await loadClients();
    } catch (error: any) {
      console.error("Error updating favorite:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to update favorite";
      toast.error(errorMessage);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !clientTags.includes(tagInput.trim())) {
      setClientTags([...clientTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setClientTags(clientTags.filter((t) => t !== tag));
  };

  const filteredClients = clients.filter((client) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.customer.full_name?.toLowerCase().includes(query) ||
      client.customer.email.toLowerCase().includes(query) ||
      client.customer.phone?.toLowerCase().includes(query) ||
      client.notes?.toLowerCase().includes(query) ||
      client.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const filteredServiced = servicedCustomers.filter((customer) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      customer.customer.full_name?.toLowerCase().includes(query) ||
      customer.customer.email.toLowerCase().includes(query) ||
      customer.customer.phone?.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <SettingsDetailLayout
      title="Client List"
      subtitle="Manage your clients - view serviced customers and saved clients"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Client List" }
      ]}
      onSave={() => {}}
    >
      <div className="space-y-6">
        {/* Search and Filter */}
        <SectionCard>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search clients by name, email, phone, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={() => setIsAddClientModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </div>
        </SectionCard>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All Clients</TabsTrigger>
            <TabsTrigger value="saved">Saved Clients</TabsTrigger>
            <TabsTrigger value="serviced">Serviced Customers</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <SectionCard className="mt-6">
              <LoadingTimeout loadingMessage="Loading clients..." />
            </SectionCard>
          ) : (
            <>
              {/* All Clients Tab */}
              <TabsContent value="all" className="mt-6">
                <div className="space-y-4">
                  {/* Saved Clients Section */}
                  {filteredClients.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Saved Clients</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredClients.map((client) => (
                          <ClientCard
                            key={client.id}
                            client={client}
                            onToggleFavorite={handleToggleFavorite}
                            formatDate={formatDate}
                            formatCurrency={formatCurrency}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Serviced Customers Section */}
                  {filteredServiced.filter((c) => !c.is_saved).length > 0 && (
                    <div className={filteredClients.length > 0 ? "mt-8" : ""}>
                      <h3 className="text-lg font-semibold mb-4">Serviced Customers</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredServiced
                          .filter((c) => !c.is_saved)
                          .map((customer) => (
                            <ServicedCustomerCard
                              key={customer.customer_id}
                              customer={customer}
                              onSave={() => {
                                setSelectedCustomerId(customer.customer_id);
                                setIsAddClientModalOpen(true);
                              }}
                              formatDate={formatDate}
                              formatCurrency={formatCurrency}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {filteredClients.length === 0 &&
                    filteredServiced.filter((c) => !c.is_saved).length === 0 && (
                      <EmptyState
                        title="No clients found"
                        description="Start by completing bookings or saving clients manually"
                        action={{
                          label: "Add Client",
                          onClick: () => setIsAddClientModalOpen(true),
                        }}
                      />
                    )}
                </div>
              </TabsContent>

              {/* Saved Clients Tab */}
              <TabsContent value="saved" className="mt-6">
                {filteredClients.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map((client) => (
                      <ClientCard
                        key={client.id}
                        client={client}
                        onToggleFavorite={handleToggleFavorite}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No saved clients"
                    description="Save clients from your serviced customers list"
                  />
                )}
              </TabsContent>

              {/* Serviced Customers Tab */}
              <TabsContent value="serviced" className="mt-6">
                {filteredServiced.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredServiced.map((customer) => (
                      <ServicedCustomerCard
                        key={customer.customer_id}
                        customer={customer}
                        onSave={() => {
                          setSelectedCustomerId(customer.customer_id);
                          setIsAddClientModalOpen(true);
                        }}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No serviced customers"
                    description="Customers will appear here after completing bookings"
                  />
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Add Client Modal */}
      <Dialog open={isAddClientModalOpen} onOpenChange={setIsAddClientModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
            <DialogDescription>
              {selectedCustomerId
                ? "Add notes and tags to save this customer to your client list"
                : "Select a customer from your serviced customers to save"}
            </DialogDescription>
          </DialogHeader>

          {selectedCustomerId ? (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes about this client..."
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    id="tags"
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button onClick={handleAddTag} size="sm">
                    Add
                  </Button>
                </div>
                {clientTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {clientTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-red-500"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddClientModalOpen(false);
                    setSelectedCustomerId(null);
                    setClientNotes("");
                    setClientTags([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={() => handleSaveClient(selectedCustomerId)}>
                  Save Client
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-4">
                Please select a customer from the "Serviced Customers" tab first, then click
                "Save" to add them to your client list.
              </p>
              <Button
                variant="outline"
                onClick={() => setIsAddClientModalOpen(false)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}

// Client Card Component
function ClientCard({
  client,
  onToggleFavorite,
  formatDate,
  formatCurrency,
}: {
  client: Client;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  formatDate: (date: string | null) => string;
  formatCurrency: (amount: number, currency?: string) => string;
}) {
  return (
    <SectionCard className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={client.customer.avatar_url || undefined} />
            <AvatarFallback>
              {client.customer.full_name?.charAt(0).toUpperCase() || "C"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h4 className="font-semibold">{client.customer.full_name || "Customer"}</h4>
            <p className="text-sm text-gray-500">{client.customer.email}</p>
          </div>
        </div>
        <button
          onClick={() => onToggleFavorite(client.id, client.is_favorite)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <Heart
            className={`h-5 w-5 ${
              client.is_favorite ? "fill-red-500 text-red-500" : "text-gray-400"
            }`}
          />
        </button>
      </div>

      {client.notes && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{client.notes}</p>
      )}

      {client.tags && client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {client.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2 text-sm border-t pt-3">
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>Last service: {formatDate(client.last_service_date)}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <User className="h-4 w-4" />
          <span>{client.total_bookings} booking{client.total_bookings !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <DollarSign className="h-4 w-4" />
          <span>{formatCurrency(client.total_spent)}</span>
        </div>
        {client.customer.rating_average && client.customer.rating_average > 0 && (
          <div className="flex items-center gap-2 text-gray-600">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span>
              {client.customer.rating_average.toFixed(1)} (
              {client.customer.review_count || 0} reviews)
            </span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// Serviced Customer Card Component
function ServicedCustomerCard({
  customer,
  onSave,
  formatDate,
  formatCurrency,
}: {
  customer: ServicedCustomer;
  onSave: () => void;
  formatDate: (date: string | null) => string;
  formatCurrency: (amount: number, currency?: string) => string;
}) {
  return (
    <SectionCard className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={customer.customer.avatar_url || undefined} />
            <AvatarFallback>
              {customer.customer.full_name?.charAt(0).toUpperCase() || "C"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h4 className="font-semibold">{customer.customer.full_name || "Customer"}</h4>
            <p className="text-sm text-gray-500">{customer.customer.email}</p>
          </div>
        </div>
        {!customer.is_saved && (
          <Button size="sm" variant="outline" onClick={onSave}>
            Save
          </Button>
        )}
        {customer.is_saved && (
          <Badge variant="secondary" className="text-xs">
            Saved
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm border-t pt-3">
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>Last service: {formatDate(customer.last_service_date)}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <User className="h-4 w-4" />
          <span>
            {customer.total_bookings} booking{customer.total_bookings !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <DollarSign className="h-4 w-4" />
          <span>{formatCurrency(customer.total_spent)}</span>
        </div>
        {customer.customer.rating_average && customer.customer.rating_average > 0 && (
          <div className="flex items-center gap-2 text-gray-600">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span>
              {customer.customer.rating_average.toFixed(1)} (
              {customer.customer.review_count || 0} reviews)
            </span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
