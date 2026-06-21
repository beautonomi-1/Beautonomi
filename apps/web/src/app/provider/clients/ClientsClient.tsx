"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { DataTableShell } from "@/components/provider/DataTableShell";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreVertical,
  Plus,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Star,
  User,
  Edit,
  Trash2,
  Flag,
} from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { Money } from "@/components/provider-portal/Money";
import { PhoneInput } from "@/components/ui/phone-input";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ReportCustomerModal } from "@/components/report/ReportCustomerModal";
import { HistoryItem } from "./components/HistoryItem";
import { ProviderClientRatingDialog } from "@/components/provider-portal/ProviderClientRatingDialog";
import { EditRatingDialog } from "@/components/provider-portal/EditRatingDialog";
import type { MergedProviderClient } from "@/lib/provider-portal/merge-provider-clients-list";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { mergeProviderClientsListFromSources } from "@/lib/provider-portal/merge-provider-clients-list";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";

type Client = MergedProviderClient;

/** Dialog form includes Mapbox-parsed address fields */
type ClientFormData = Partial<Client> & {
  address_display?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
  address_latitude?: number | null;
  address_longitude?: number | null;
};

function buildAddressPayload(data: ClientFormData): Record<string, unknown> | undefined {
  const line1 = (data.address || "").trim();
  const city = (data.city || "").trim();
  if (!line1 || !city) return undefined;
  const country = (data.address_country || "ZA").trim() || "ZA";
  return {
    line1,
    line2: "",
    city,
    state: (data.address_state || "").trim() || undefined,
    postal_code: (data.address_postal_code || "").trim() || undefined,
    country,
    latitude: data.address_latitude ?? null,
    longitude: data.address_longitude ?? null,
  };
}

interface ClientHistory {
  id: string;
  type: "appointment" | "sale" | "note";
  date: string;
  description: string;
  amount?: number;
  team_member_name?: string;
  status?: string;
  // Detailed appointment information
  booking_number?: string;
  scheduled_at?: string;
  completed_at?: string;
  payment_status?: string;
  subtotal?: number;
  discount_amount?: number;
  discount_code?: string;
  tax_rate?: number;
  tax_amount?: number;
  service_fee_percentage?: number;
  service_fee_amount?: number;
  travel_fee?: number;
  tip_amount?: number;
  total_paid?: number;
  total_refunded?: number;
  location_type?: string;
  notes?: string;
  services?: Array<{
    offering_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    duration_minutes?: number;
    customization?: string;
    offerings?: {
      name: string;
      global_service_categories?: {
        name: string;
      };
    };
  }>;
  addons?: Array<{
    addon_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    service_addons?: {
      name: string;
    };
  }>;
  products?: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    products?: {
      name: string;
    };
  }>;
}

// Clients are now fetched from API

export function ClientsClient({
  initialClients,
  initialError,
  fromServer,
}: {
  initialClients: Client[] | null;
  initialError: string | null;
  fromServer: boolean;
}) {
  const { selectedLocationId } = useProviderPortal();
  const [clients, setClients] = useState<Client[]>(() => initialClients ?? []);
  const [isLoading, setIsLoading] = useState(() => {
    if (initialError) return false;
    if (fromServer && initialClients !== null) return false;
    return true;
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [reportCustomerClient, setReportCustomerClient] = useState<Client | null>(null);

  useEffect(() => {
    if (initialError) toast.error(initialError);
  }, [initialError]);

  useEffect(() => {
    if (selectedLocationId) {
      void loadClients();
      return;
    }
    if (fromServer && !initialError) {
      void loadClients({ silent: true });
      return;
    }
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location + SSR bootstrap
  }, [selectedLocationId]);

  const loadClients = async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setLoadFailed(false);
      
      // Build URLs with location_id if provided
      const savedUrl = selectedLocationId
        ? `/api/provider/clients?location_id=${selectedLocationId}`
        : "/api/provider/clients";
      const servicedUrl = selectedLocationId
        ? `/api/provider/clients/serviced?location_id=${selectedLocationId}`
        : "/api/provider/clients/serviced";
      const conversationsUrl = selectedLocationId
        ? `/api/provider/clients/conversations?location_id=${selectedLocationId}`
        : "/api/provider/clients/conversations";
      
      const errors: string[] = [];
      const safeGet = async (url: string, label: string) => {
        try {
          return await fetcher.get<{ data: any[] }>(url);
        } catch (err: any) {
          errors.push(label);
          console.error(`Failed to load ${label}:`, err);
          return { data: [] };
        }
      };
      const [savedData, servicedData, conversationsData] = await Promise.all([
        safeGet(savedUrl, "saved clients"),
        safeGet(servicedUrl, "serviced clients"),
        safeGet(conversationsUrl, "conversation clients"),
      ]);
      if (errors.length > 0) {
        toast.error(`Failed to load: ${errors.join(", ")}`);
      }
      
      const allClients = mergeProviderClientsListFromSources(savedData, servicedData, conversationsData);
      
      setClients(allClients);
    } catch (error) {
      console.error("Failed to load clients:", error);
      toast.error("Failed to load clients");
      setClients([]);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientHistory = async (clientId: string) => {
    try {
      const data = await fetcher.get<{ data?: { history?: any[] } }>(`/api/provider/clients/${clientId}`);
      const history = data.data?.history || [];
      setClientHistory(history);
    } catch (error) {
      console.error("Error loading client history:", error, "Client ID:", clientId);
      setClientHistory([]);
      toast.error("Failed to load client history");
    }
  };

  const filteredClients = useMemo(() => clients.filter((client) => {
    const fullName = `${client.first_name} ${client.last_name}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query)
    );
  }), [clients, searchQuery]);

  const handleCreate = () => {
    setSelectedClient(null);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setIsCreateDialogOpen(true);
  };

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    // Use customer_id for history if available, otherwise use client id
    // For saved clients, the API expects the provider_clients.id
    // For unsaved clients, it expects the customer_id
    const historyId = (client as any).customer_id || client.id;
    loadClientHistory(historyId);
    setIsDetailSheetOpen(true);
  };

  const handleSave = async (data: ClientFormData) => {
    try {
      const addr = data.home_address_read_only ? undefined : buildAddressPayload(data);
      if (selectedClient) {
        // Update existing client - use customer_id for unsaved clients
        const clientId = (selectedClient as any).is_saved ? selectedClient.id : null;
        const customerId = (selectedClient as any).customer_id;
        const limitedPlatformLink = Boolean((selectedClient as any).is_limited_platform_link);
        
        if (clientId) {
          await fetcher.patch(`/api/provider/clients/${clientId}`, {
            notes: data.notes || "",
            tags: (data as any).tags || [],
            is_favorite: (data as any).is_favorite || false,
            ...(limitedPlatformLink
              ? {}
              : {
                  date_of_birth: data.birth_date || null,
                  ...(addr ? { address: addr } : {}),
                }),
          });
          toast.success("Client updated successfully");
        } else if (customerId) {
          await fetcher.post("/api/provider/clients", {
            customer_id: customerId,
            notes: data.notes || "",
            tags: (data as any).tags || [],
            is_favorite: (data as any).is_favorite || false,
            date_of_birth: data.birth_date || null,
            ...(addr ? { address: addr } : {}),
          });
          toast.success("Client saved successfully");
        } else {
          throw new Error("Invalid client data");
        }
      } else {
        // Create new client from scratch
        if (!data.first_name || !data.last_name) {
          toast.error("First name and last name are required");
          return;
        }

        // Parse phone number to extract country code and number
        const phone = data.phone || "";
        const phoneMatch = phone.match(/^(\+\d{1,4})\s*(.+)$/);
        const phoneNumber = phoneMatch ? phoneMatch[2] : phone;
        const countryCode = phoneMatch ? phoneMatch[1] : "+27";

        await fetcher.post("/api/provider/clients/create", {
          first_name: data.first_name,
          last_name: data.last_name,
          full_name: `${data.first_name} ${data.last_name}`.trim(),
          email: data.email || undefined,
          phone: phoneNumber ? `${countryCode} ${phoneNumber}`.trim() : undefined,
          date_of_birth: data.birth_date || undefined,
          notes: data.notes || "",
          ...(addr ? { address: addr } : {}),
          email_notifications_enabled: data.marketing_consent ?? true,
          sms_notifications_enabled: data.sms_consent ?? true,
        });
        toast.success("Client created successfully");
      }
      setIsCreateDialogOpen(false);
      loadClients();
    } catch (error: any) {
      console.error("Error saving client:", error);
      toast.error(error?.message || "Failed to save client");
    }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Are you sure you want to remove ${client.first_name} ${client.last_name}?`)) return;
    
    try {
      // Only delete if it's a saved client (has provider_clients id)
      const clientId = (client as any).is_saved ? client.id : null;
      
      if (!clientId) {
        // For unsaved clients, just show a message
        toast.info("This client is not saved. They will remain in your serviced customers list.");
        return;
      }

      await fetcher.delete(`/api/provider/clients/${clientId}`);
      toast.success("Client removed");
      loadClients();
    } catch (error: any) {
      console.error("Error deleting client:", error);
      toast.error(error?.message || "Failed to remove client");
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Manage your client database and relationships"
        primaryAction={{
          label: "Add Client",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      <DataTableShell
        searchPlaceholder="Search by name, email, or phone..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        
        sortOptions={[
          { value: "name", label: "Name" },
          { value: "last_visit", label: "Last Visit" },
          { value: "total_spent", label: "Total Spent" },
          { value: "created_at", label: "Date Added" },
        ]}
        addButton={{
          label: "Add Client",
          onClick: handleCreate,
        }}
      >
        {isLoading ? (
          <SectionCard>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </SectionCard>
        ) : loadFailed && clients.length === 0 ? (
          <SectionCard className="p-12">
            <EmptyState
              title="Failed to load clients"
              description="Something went wrong. Please try again."
              action={{ label: "Retry", onClick: loadClients }}
            />
          </SectionCard>
        ) : filteredClients.length === 0 ? (
          <SectionCard className="p-12">
            <EmptyState
              title="No clients found"
              description={
                searchQuery
                  ? "Try a different search term"
                  : "Add your first client to get started"
              }
              action={
                !searchQuery
                  ? {
                      label: "Add Client",
                      onClick: handleCreate,
                    }
                  : undefined
              }
            />
          </SectionCard>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="md:hidden space-y-3">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleViewDetails(client);
                    }
                  }}
                  onClick={() => handleViewDetails(client)}
                  className="cursor-pointer"
                >
                <SectionCard className="p-4 hover:shadow-md transition-shadow active:bg-gray-50 touch-manipulation">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-11 h-11 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {client.first_name.charAt(0)}{client.last_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
                            <span className="truncate">
                              {client.first_name} {client.last_name}
                            </span>
                            {client.identity_verified ? (
                              <VerifiedBadge verified iconOnly className="shrink-0" />
                            ) : null}
                          </p>
                          {client.is_limited_platform_link && (
                            <span className="mt-1 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              Platform customer
                            </span>
                          )}
                          {client.city && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 flex-shrink-0" />{client.city}
                            </p>
                          )}
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 -m-2 hover:bg-gray-100 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center">
                                <MoreVertical className="w-4 h-4 text-gray-400" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                                <User className="w-4 h-4 mr-2" />View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(client)}>
                                <Edit className="w-4 h-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setReportCustomerClient(client)}>
                                <Flag className="w-4 h-4 mr-2" />Report
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(client)}>
                                <Trash2 className="w-4 h-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                        {client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{client.phone}
                          </span>
                        )}
                        {client.email && (
                          <span className="flex items-center gap-1 truncate max-w-[180px]">
                            <Mail className="w-3 h-3 flex-shrink-0" />{client.email}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-2.5 text-xs">
                        <span className="text-gray-500">
                          {client.total_visits} visit{client.total_visits !== 1 ? "s" : ""}
                        </span>
                        <span className="font-medium text-gray-700">
                          <Money amount={client.total_spent} />
                        </span>
                        <span className="text-gray-400">
                          {client.last_visit
                            ? `Last: ${new Date(client.last_visit).toLocaleDateString()}`
                            : "No visits"}
                        </span>
                      </div>

                      {client.tags && client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {client.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                tag === "VIP"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : tag === "Regular"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <SectionCard className="hidden md:block p-0 overflow-hidden">
              <div className="provider-table-scroll overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"><Checkbox /></TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Last Visit</TableHead>
                      <TableHead>Total Visits</TableHead>
                      <TableHead>Total Spent</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleViewDetails(client)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}><Checkbox /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {client.first_name.charAt(0)}{client.last_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium flex items-center gap-1.5">
                                <span>{client.first_name} {client.last_name}</span>
                                {client.identity_verified ? (
                                  <VerifiedBadge verified iconOnly />
                                ) : null}
                              </p>
                              {client.is_limited_platform_link && (
                                <p className="text-xs font-medium text-sky-700">Existing platform customer</p>
                              )}
                              {client.city && <p className="text-sm text-gray-500">{client.city}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {client.email && (<div className="flex items-center gap-1 text-sm text-gray-600"><Mail className="w-3 h-3" />{client.email}</div>)}
                            {client.phone && (<div className="flex items-center gap-1 text-sm text-gray-600"><Phone className="w-3 h-3" />{client.phone}</div>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {client.last_visit
                            ? <span className="text-sm">{new Date(client.last_visit).toLocaleDateString()}</span>
                            : <span className="text-sm text-gray-400">Never</span>}
                        </TableCell>
                        <TableCell><span className="font-medium">{client.total_visits}</span></TableCell>
                        <TableCell><Money amount={client.total_spent} /></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {client.tags?.map((tag) => (
                              <span key={tag} className={`px-2 py-0.5 rounded-full text-xs font-medium ${tag === "VIP" ? "bg-yellow-100 text-yellow-800" : tag === "Regular" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}>{tag}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-gray-100 rounded min-h-[44px] min-w-[44px] flex items-center justify-center">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(client)}><User className="w-4 h-4 mr-2" />View Profile</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(client)}><Edit className="w-4 h-4 mr-2" />Edit CRM notes/tags</DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setReportCustomerClient(client); }}><Flag className="w-4 h-4 mr-2" />Report customer</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); handleDelete(client); }}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </>
        )}
      </DataTableShell>

      {/* Create/Edit Dialog */}
      <ClientCreateEditDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        client={selectedClient}
        onSave={handleSave}
      />

      {/* Client Detail Sheet */}
      <ClientDetailSheet
        open={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        client={selectedClient}
        history={clientHistory}
        onEdit={() => {
          setIsDetailSheetOpen(false);
          setIsCreateDialogOpen(true);
        }}
      />

      {/* Report customer modal */}
      {reportCustomerClient && (
        <ReportCustomerModal
          open={!!reportCustomerClient}
          onOpenChange={(open) => !open && setReportCustomerClient(null)}
          reportedUserId={reportCustomerClient.customer_id ?? reportCustomerClient.id}
          customerName={`${reportCustomerClient.first_name} ${reportCustomerClient.last_name}`.trim() || "Customer"}
        />
      )}
    </div>
  );
}

// Client Create/Edit Dialog
function ClientCreateEditDialog({
  open,
  onOpenChange,
  client,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSave: (data: ClientFormData) => void;
}) {
  const [formData, setFormData] = useState<ClientFormData>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    address_display: "",
    address_state: "",
    address_postal_code: "",
    address_country: "ZA",
    address_latitude: null,
    address_longitude: null,
    home_address_read_only: false,
    notes: "",
    birth_date: "",
    marketing_consent: false,
    sms_consent: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const isLimitedPlatformLink = Boolean(client?.is_limited_platform_link);

  useEffect(() => {
    if (open) {
      if (client) {
        const display =
          client.address_display ||
          [client.address, client.city].filter(Boolean).join(", ");
        setFormData({
          first_name: client.first_name,
          last_name: client.last_name,
          email: client.email || "",
          phone: client.phone || "",
          address: client.address || "",
          city: client.city || "",
          address_display: display,
          address_state: client.address_state || "",
          address_postal_code: client.address_postal_code || "",
          address_country: client.address_country || "ZA",
          address_latitude: client.address_latitude ?? null,
          address_longitude: client.address_longitude ?? null,
          home_address_read_only: client.home_address_read_only ?? false,
          notes: client.notes || "",
          birth_date: client.birth_date || "",
          marketing_consent: client.marketing_consent,
          sms_consent: client.sms_consent,
        });
      } else {
        setFormData({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          address: "",
          city: "",
          address_display: "",
          address_state: "",
          address_postal_code: "",
          address_country: "ZA",
          address_latitude: null,
          address_longitude: null,
          home_address_read_only: false,
          notes: "",
          birth_date: "",
          marketing_consent: false,
          sms_consent: false,
        });
      }
    }
  }, [open, client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave(formData);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">{client ? "Edit Client" : "Add Client"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 w-full overflow-x-hidden">
          {isLimitedPlatformLink && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This is an existing Beautonomi customer linked by exact match. You can message, book, sell, and manage
              provider CRM notes/tags, while their profile fields remain customer-managed.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="w-full">
              <Label htmlFor="first_name" className="text-sm sm:text-base">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
                required
                disabled={isLimitedPlatformLink}
                className="mt-1.5 min-h-[44px] touch-manipulation w-full"
              />
            </div>
            <div className="w-full">
              <Label htmlFor="last_name" className="text-sm sm:text-base">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
                required
                disabled={isLimitedPlatformLink}
                className="mt-1.5 min-h-[44px] touch-manipulation w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="w-full">
              <Label htmlFor="email" className="text-sm sm:text-base">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={isLimitedPlatformLink}
                className="mt-1.5 min-h-[44px] touch-manipulation w-full"
              />
            </div>
            <div className="w-full">
              <PhoneInput
                value={formData.phone || ""}
                onChange={(value) => setFormData({ ...formData, phone: value })}
                label="Phone"
                placeholder="82 123 4567"
                className="mt-1.5"
                disabled={isLimitedPlatformLink}
              />
            </div>
          </div>

          <div className="w-full">
            <Label className="text-sm sm:text-base">Address (home / house call)</Label>
            {formData.home_address_read_only || isLimitedPlatformLink ? (
              <>
                <div className="mt-1.5 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-foreground">
                  {formData.address_display ||
                    [formData.address, formData.city].filter(Boolean).join(", ") ||
                    "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  This address was saved by the customer in their account. Only they can change it from the customer app or website.
                </p>
              </>
            ) : (
              <>
                <AddressAutocomplete
                  inputId="client-address"
                  value={formData.address_display || ""}
                  country="ZA"
                  defaultCountryName="South Africa"
                  placeholder="Start typing to search for an address"
                  className="mt-1.5"
                  inputClassName="min-h-[44px] touch-manipulation w-full"
                  onInputChange={(v) =>
                    setFormData((prev) => ({ ...prev, address_display: v }))
                  }
                  onChange={(a) => {
                    const iso =
                      a.country && /^[A-Za-z]{2}$/.test(a.country.trim())
                        ? a.country.trim().toUpperCase()
                        : "ZA";
                    setFormData((prev) => ({
                      ...prev,
                      address_display:
                        a.place_name || [a.address_line1, a.city].filter(Boolean).join(", "),
                      address: a.address_line1,
                      city: a.city,
                      address_state: a.state || "",
                      address_postal_code: a.postal_code || "",
                      address_country: iso,
                      address_latitude: a.latitude,
                      address_longitude: a.longitude,
                    }));
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Pick a suggestion for accurate travel distance on house calls. City must be set (included when you select a result).
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="w-full">
              <Label htmlFor="city" className="text-sm sm:text-base">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                disabled={formData.home_address_read_only || isLimitedPlatformLink}
                className="mt-1.5 min-h-[44px] touch-manipulation w-full"
              />
            </div>
            <div className="w-full">
              <Label htmlFor="birth_date" className="text-sm sm:text-base">Birthday</Label>
              <Input
                id="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={(e) =>
                  setFormData({ ...formData, birth_date: e.target.value })
                }
                disabled={isLimitedPlatformLink}
                className="mt-1.5 min-h-[44px] touch-manipulation w-full"
              />
            </div>
          </div>

          <div className="w-full">
            <Label htmlFor="notes" className="text-sm sm:text-base">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Add any notes about this client..."
              rows={3}
              className="mt-1.5 w-full max-w-full"
            />
          </div>

          <div className="space-y-3 w-full">
            <Label className="text-sm sm:text-base">Communication Preferences</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="marketing_consent"
                checked={formData.marketing_consent}
                disabled={isLimitedPlatformLink}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, marketing_consent: !!checked })
                }
                className="min-w-[44px] min-h-[44px] touch-manipulation"
              />
              <label htmlFor="marketing_consent" className="text-sm sm:text-base cursor-pointer">
                Receive marketing emails
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sms_consent"
                checked={formData.sms_consent}
                disabled={isLimitedPlatformLink}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, sms_consent: !!checked })
                }
                className="min-w-[44px] min-h-[44px] touch-manipulation"
              />
              <label htmlFor="sms_consent" className="text-sm sm:text-base cursor-pointer">
                Receive SMS notifications
              </label>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              {isLoading ? "Saving..." : client ? "Update" : "Add Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Client Detail Sheet
function ClientDetailSheet({
  open,
  onOpenChange,
  client,
  history,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  history: ClientHistory[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isLimitedPlatformLink, setIsLimitedPlatformLink] = useState(false);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [ratingStats, setRatingStats] = useState<any>(null);
  const [isLoadingRatingStats, setIsLoadingRatingStats] = useState(false);
  const [ratingsList, setRatingsList] = useState<any[]>([]);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [selectedBookingForRating, setSelectedBookingForRating] = useState<any>(null);
  const [showEditRatingDialog, setShowEditRatingDialog] = useState(false);
  const [selectedRatingToEdit, setSelectedRatingToEdit] = useState<any>(null);

  // Same aggregate as the Ratings tab — this provider's post-visit booking ratings only.
  const loadRatingStats = async (opts?: { silent?: boolean }) => {
    if (!client?.customer_id) {
      if (!opts?.silent) setIsLoadingRatingStats(false);
      return;
    }
    if (!opts?.silent) setIsLoadingRatingStats(true);
    try {
      const data = await fetcher.get<{ data?: any }>(`/api/provider/ratings?customer_id=${client.customer_id}`);
      setRatingStats(data.data ?? null);
    } catch (error) {
      console.error("Error loading rating stats:", error);
      setRatingStats(null);
    } finally {
      if (!opts?.silent) setIsLoadingRatingStats(false);
    }
  };

  const loadRatingsList = async () => {
    if (!client?.customer_id || !open) return;

    setIsLoadingRatings(true);
    try {
      const data = await fetcher.get<{ data?: { ratings?: any[] } }>(
        `/api/provider/ratings/list?customer_id=${client.customer_id}`,
      );
      setRatingsList(data.data?.ratings || []);
    } catch (error) {
      console.error("Error loading ratings list:", error);
    } finally {
      setIsLoadingRatings(false);
    }
  };

  // Load full client details including communication preferences
  useEffect(() => {
    const loadClientDetails = async () => {
      if (!client?.id || !open) return;

      setIsCheckingRegistration(true);
      try {
        const data = await fetcher.get<{ data?: any }>(`/api/provider/clients/${client.id}`);
        setClientDetails(data.data);
        const customer = data.data?.customer;
        setIsLimitedPlatformLink(Boolean(customer?.is_limited_platform_link || data.data?.privacy_level === "limited"));
        setIsRegistered(customer?.id && !customer?.email?.includes("beautonomi.invalid") && !customer?.email?.includes("beautonomi.local"));
      } catch (error) {
        console.error("Error loading client details:", error);
        setIsRegistered(false);
        setIsLimitedPlatformLink(false);
        setClientDetails(null);
      } finally {
        setIsCheckingRegistration(false);
      }
    };

    if (!open || !client) {
      setRatingStats(null);
      setIsLoadingRatingStats(false);
      return;
    }

    setRatingStats(null);
    setIsLoadingRatingStats(true);
    void loadClientDetails();
    void loadRatingStats({ silent: false });
    void loadRatingsList();
  }, [open, client]);

  // Get bookings that can be rated (completed/no_show without existing rating)
  const [rateableBookings, setRateableBookings] = useState<any[]>([]);
  const [isLoadingRateableBookings, setIsLoadingRateableBookings] = useState(false);

  useEffect(() => {
    const loadRateableBookings = async () => {
      if (!client?.customer_id || !open) return;
      
      setIsLoadingRateableBookings(true);
      try {
        const data = await fetcher.get<{ data?: any[] }>(`/api/provider/bookings?customer_id=${client.customer_id}&status=completed,no_show`);
        const bookings = data.data || [];
        const bookingIds = bookings.map((b: any) => b.id);

        if (bookingIds.length === 0) {
          setRateableBookings([]);
          return;
        }

        const checkData = await fetcher.post<{ data?: { rated: Record<string, boolean> } }>(
          "/api/provider/ratings/check",
          { booking_ids: bookingIds },
        );
        const rated = checkData.data?.rated ?? {};
        const withoutRatings = bookings.filter((b: any) => !rated[b.id]);
        setRateableBookings(withoutRatings);
      } catch (error) {
        console.error("Error loading rateable bookings:", error);
      } finally {
        setIsLoadingRateableBookings(false);
      }
    };

    if (open && client) {
      loadRateableBookings();
    }
  }, [open, client]);

  const handleRateClient = async (booking?: any) => {
    if (booking) {
      // Rate specific booking
      setSelectedBookingForRating(booking);
      setShowRatingDialog(true);
    } else {
      // Show dialog to select booking
      if (rateableBookings.length === 0) {
        toast.info("No completed bookings available to rate");
        return;
      }
      if (rateableBookings.length === 1) {
        setSelectedBookingForRating(rateableBookings[0]);
        setShowRatingDialog(true);
      } else {
        router.push(`/provider/bookings/new?client_id=${client.id}`);
      }
    }
  };

  const handleEditRating = (rating: any) => {
    setSelectedRatingToEdit(rating);
    setShowEditRatingDialog(true);
  };

  const handleRatingSubmitted = () => {
    void loadRatingStats({ silent: true });
    void loadRatingsList();
    // Trigger reload of rateable bookings by updating dependency
    if (open && client) {
      setIsLoadingRateableBookings(true);
      const reloadRateableBookings = async () => {
        if (!client?.customer_id) return;
        
        try {
          const data = await fetcher.get<{ data?: any[] }>(`/api/provider/bookings?customer_id=${client.customer_id}`);
          const bookings = (data.data || []).filter((b: any) => 
            b.status === 'completed' || b.status === 'no_show'
          );
          const bookingIds = bookings.map((b: any) => b.id);

          if (bookingIds.length === 0) {
            setRateableBookings([]);
            return;
          }

          const checkData = await fetcher.post<{ data?: { rated: Record<string, boolean> } }>(
            "/api/provider/ratings/check",
            { booking_ids: bookingIds },
          );
          const rated = checkData.data?.rated ?? {};
          const withoutRatings = bookings.filter((b: any) => !rated[b.id]);
          setRateableBookings(withoutRatings);
        } catch (error) {
          console.error("Error loading rateable bookings:", error);
        } finally {
          setIsLoadingRateableBookings(false);
        }
      };
      reloadRateableBookings();
    }
  };

  const handleBookAppointment = () => {
    if (!client?.customer_id) {
      toast.error("Cannot book appointment: Client ID is missing");
      return;
    }
    // Navigate to calendar with customer pre-selected
    router.push(`/provider/calendar?customerId=${client.customer_id}`);
    onOpenChange(false);
  };

  const handleSendMessage = async () => {
    if (!client?.customer_id) {
      toast.error("Cannot send message: Client ID is missing");
      return;
    }
    if (!isRegistered) {
      toast.error("This client is not registered on Beautonomi. Only registered clients can receive chat messages.");
      return;
    }
    try {
      const data = await fetcher.post<{ data?: { id: string } }>("/api/provider/conversations", {
        customer_id: client.customer_id,
        booking_id: null,
      });
      router.push(`/provider/messaging?conversationId=${data.data?.id}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start conversation");
    }
  };

  if (!client) return null;

  /** Same source as the Ratings tab: this provider's post-visit booking ratings only. */
  const providerBookingAvgDisplay =
    ratingStats && typeof ratingStats.total_ratings === "number" && ratingStats.total_ratings > 0
      ? Number(ratingStats.average_rating).toFixed(1)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {client.first_name.charAt(0)}
                  {client.last_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-xl flex items-center gap-2">
                  <span>{client.first_name} {client.last_name}</span>
                  {client.identity_verified ? <VerifiedBadge verified /> : null}
                </SheetTitle>
                {isLimitedPlatformLink && (
                  <div className="mt-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    Existing platform customer
                  </div>
                )}
                {client.tags && client.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {client.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          tag === "VIP"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit CRM
            </Button>
          </div>
        </SheetHeader>

        {/* Stats */}
        {isLimitedPlatformLink && (
          <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            This customer already has a Beautonomi account. Their platform profile remains customer-managed,
            but you can message them, book appointments, sell products, and manage provider CRM notes normally.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-semibold">{client.total_visits}</p>
            <p className="text-xs text-gray-600">Total Visits</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-semibold">
              <Money amount={client.total_spent} />
            </p>
            <p className="text-xs text-gray-600">Total Spent</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            {isLoadingRatingStats ? (
              <div className="flex justify-center py-1">
                <Skeleton className="h-8 w-14 rounded-md" />
              </div>
            ) : providerBookingAvgDisplay != null ? (
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-semibold">{providerBookingAvgDisplay}</p>
                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              </div>
            ) : (
              <p className="text-2xl font-semibold">–</p>
            )}
            <p className="text-xs text-gray-600">Avg Rating</p>
            <p className="text-xs text-gray-400 mt-1">
              {isLoadingRatingStats
                ? "Loading…"
                : providerBookingAvgDisplay != null
                  ? "Your post-visit ratings (this business)"
                  : "No booking ratings yet"}
            </p>
          </div>
        </div>

        <Tabs defaultValue="info" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 gap-1">
            <TabsTrigger value="info" className="text-xs sm:text-sm px-2 sm:px-3 flex-1">Info</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm px-2 sm:px-3 flex-1">History</TabsTrigger>
            <TabsTrigger value="ratings" className="text-xs sm:text-sm px-2 sm:px-3 flex-1">Ratings</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 space-y-4">
            {client.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{client.email}</p>
                </div>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium">{client.phone}</p>
                </div>
              </div>
            )}
            {(client.address || client.city) && (
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="font-medium">
                    {[client.address, client.city].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            )}
            {client.birth_date && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Birthday</p>
                  <p className="font-medium">
                    {new Date(client.birth_date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            )}
            {client.notes && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-1">Notes</p>
                <p className="text-sm bg-gray-50 rounded-lg p-3">{client.notes}</p>
              </div>
            )}
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Communication</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      (clientDetails?.customer?.email_notifications_enabled ?? client.marketing_consent ?? false) 
                        ? "bg-green-500" 
                        : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm">
                    {(clientDetails?.customer?.email_notifications_enabled ?? client.marketing_consent ?? false)
                      ? "Receives marketing emails"
                      : "No marketing emails"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      (clientDetails?.customer?.sms_notifications_enabled ?? client.sms_consent ?? false)
                        ? "bg-green-500" 
                        : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm">
                    {(clientDetails?.customer?.sms_notifications_enabled ?? client.sms_consent ?? false)
                      ? "Receives SMS" 
                      : "No SMS"}
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {history.length === 0 ? (
              <EmptyState
                title="No history yet"
                description="Appointments and sales will appear here"
              />
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <HistoryItem key={item.id} item={item} clientEmail={client?.email} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ratings" className="mt-4">
            {/* Aggregate Statistics */}
            {ratingStats && ratingStats.total_ratings > 0 && (
              <div className="mb-6 space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Rating Statistics</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600">Total Ratings</p>
                      <p className="text-2xl font-semibold">{ratingStats.total_ratings}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Average Rating</p>
                      <div className="flex items-center gap-1">
                        <p className="text-2xl font-semibold">{ratingStats.average_rating?.toFixed(1) || "0.0"}</p>
                        <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Rating Distribution */}
                  {ratingStats.rating_distribution && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-700 mb-2">Rating Distribution</p>
                      {ratingStats.rating_distribution.map((dist: any) => (
                        <div key={dist.stars} className="flex items-center gap-2">
                          <div className="flex items-center gap-1 w-20">
                            <span className="text-xs text-gray-600">{dist.stars}</span>
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          </div>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-yellow-400 h-2 rounded-full"
                              style={{
                                width: `${ratingStats.total_ratings > 0 ? (dist.count / ratingStats.total_ratings) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-8 text-right">{dist.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rate Client Button */}
            <div className="mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleRateClient()}
                disabled={isLoadingRateableBookings || rateableBookings.length === 0}
              >
                <Star className="w-4 h-4 mr-2" />
                {isLoadingRateableBookings
                  ? "Loading..."
                  : rateableBookings.length === 0
                  ? "No bookings to rate"
                  : `Rate Client (${rateableBookings.length} available)`}
              </Button>
            </div>

            {/* Ratings List */}
            {isLoadingRatings ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : ratingsList.length === 0 ? (
              <EmptyState
                title="No ratings yet"
                description="Ratings you give to this client will appear here"
              />
            ) : (
              <div className="space-y-3">
                {ratingsList.map((rating: any) => (
                  <div
                    key={rating.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= rating.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-gray-200 text-gray-200"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            {rating.booking_number && `Booking ${rating.booking_number}`}
                            {rating.completed_at &&
                              ` • ${new Date(rating.completed_at).toLocaleDateString()}`}
                          </span>
                        </div>
                        {rating.comment && (
                          <p className="text-sm text-gray-700 mt-2">{rating.comment}</p>
                        )}
                        {rating.location_id && (
                          <p className="text-xs text-gray-500 mt-1">
                            Location: {rating.location_id}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRating(rating)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleBookAppointment}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Book Appointment
          </Button>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleSendMessage}
            disabled={!isRegistered || isCheckingRegistration}
            title={
              isCheckingRegistration 
                ? "Checking registration..." 
                : !isRegistered 
                ? "Client is not registered on Beautonomi. Only registered clients can receive chat messages."
                : "Send a chat message to this client"
            }
          >
            <Mail className="w-4 h-4 mr-2" />
            Send Message
          </Button>
        </div>
        {isLimitedPlatformLink && !isCheckingRegistration && client.customer_id ? (
          <p className="text-xs text-sky-700 mt-2 text-center">
            Platform customer: profile fields are customer-managed. Messaging and booking remain available.
          </p>
        ) : !isRegistered && !isCheckingRegistration && client.customer_id && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            This client is not registered. Chat messages are only available for registered clients.
          </p>
        )}
      </SheetContent>

      <ProviderClientRatingDialog
        open={showRatingDialog}
        onOpenChange={(open) => {
          setShowRatingDialog(open);
          if (!open) setSelectedBookingForRating(null);
        }}
        bookingId={selectedBookingForRating?.id ?? ""}
        customerName={`${client.first_name} ${client.last_name}`}
        onRatingSubmitted={handleRatingSubmitted}
      />

      <EditRatingDialog
        open={showEditRatingDialog}
        onOpenChange={(open) => {
          setShowEditRatingDialog(open);
          if (!open) setSelectedRatingToEdit(null);
        }}
        rating={selectedRatingToEdit}
        onRatingUpdated={handleRatingSubmitted}
      />
    </Sheet>
  );
}
