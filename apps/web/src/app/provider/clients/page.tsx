"use client";

import React, { useState, useEffect } from "react";
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
  DollarSign,
  Star,
  User,
  History,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Tag,
  ShoppingBag,
  Printer,
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
import { VirtualTable } from "@/components/ui/virtual-list";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { ReportCustomerModal } from "@/components/report/ReportCustomerModal";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  last_visit?: string;
  total_visits: number;
  total_spent: number;
  average_rating?: number;
  preferred_team_member_id?: string;
  preferred_team_member_name?: string;
  birth_date?: string;
  marketing_consent: boolean;
  sms_consent: boolean;
  is_saved?: boolean;
  customer_id?: string;
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

export default function ProviderClients() {
  const { selectedLocationId } = useProviderPortal();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [clientHistory, setClientHistory] = useState<ClientHistory[]>([]);
  const [reportCustomerClient, setReportCustomerClient] = useState<Client | null>(null);

  useEffect(() => {
    loadClients();
  }, [selectedLocationId]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      
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
      
      const savedClients = (savedData.data || []).map((client: any) => {
        const fullName = client.customer?.full_name || "";
        const nameParts = fullName.trim().split(/\s+/);
        return {
          id: client.id,
          first_name: nameParts[0] || "Unknown",
          last_name: nameParts.slice(1).join(" ") || "",
          email: client.customer?.email || "",
          phone: client.customer?.phone || "",
          notes: client.notes || "",
          tags: client.tags || [],
          created_at: client.created_at,
          last_visit: client.last_service_date,
          total_visits: client.total_bookings || 0,
          total_spent: client.total_spent || 0,
          average_rating: client.customer?.rating_average,
          birth_date: client.customer?.date_of_birth || null,
          marketing_consent: client.customer?.email_notifications_enabled ?? true,
          sms_consent: client.customer?.sms_notifications_enabled ?? true,
          is_saved: true,
          customer_id: client.customer_id,
        };
      });
      
      // Get serviced customers that aren't already saved
      const savedCustomerIds = new Set(savedClients.map((c: any) => c.customer_id));
      const servicedClients = (servicedData.data || [])
        .filter((client: any) => !savedCustomerIds.has(client.customer_id))
        .map((client: any) => {
          const fullName = client.customer?.full_name || "";
          const nameParts = fullName.trim().split(/\s+/);
          return {
            id: client.customer_id,
            first_name: nameParts[0] || "Unknown",
            last_name: nameParts.slice(1).join(" ") || "",
            email: client.customer?.email || "",
            phone: client.customer?.phone || "",
            notes: "",
            tags: [],
            created_at: client.last_service_date,
            last_visit: client.last_service_date,
            total_visits: client.total_bookings || 0,
            total_spent: client.total_spent || 0,
            average_rating: client.customer?.rating_average,
            birth_date: client.customer?.date_of_birth || null,
            marketing_consent: client.customer?.email_notifications_enabled ?? true,
            sms_consent: client.customer?.sms_notifications_enabled ?? true,
            is_saved: false,
            customer_id: client.customer_id,
          };
        });
      
      // Get conversation customers that aren't already in saved or serviced
      const allExistingCustomerIds = new Set([
        ...savedClients.map((c: any) => c.customer_id),
        ...servicedClients.map((c: any) => c.customer_id),
      ]);
      
      const conversationClients = (conversationsData.data || [])
        .filter((client: any) => !allExistingCustomerIds.has(client.customer_id))
        .map((client: any) => {
          const fullName = client.customer?.full_name || "";
          const nameParts = fullName.trim().split(/\s+/);
          return {
            id: client.customer_id,
            first_name: nameParts[0] || "Unknown",
            last_name: nameParts.slice(1).join(" ") || "",
            email: client.customer?.email || "",
            phone: client.customer?.phone || "",
            notes: "",
            tags: [],
            created_at: client.last_message_date || client.customer?.created_at,
            last_visit: client.last_service_date || null,
            total_visits: client.total_bookings || 0,
            total_spent: client.total_spent || 0,
            average_rating: client.customer?.rating_average,
            birth_date: client.customer?.date_of_birth || null,
            marketing_consent: client.customer?.email_notifications_enabled ?? true,
            sms_consent: client.customer?.sms_notifications_enabled ?? true,
            is_saved: false,
            customer_id: client.customer_id,
          };
        });
      
      // Combine all clients: saved, serviced, and conversation-only
      // Sort by last activity (visit or message), with saved clients prioritized
      const allClients = [...savedClients, ...servicedClients, ...conversationClients].sort((a, b) => {
        // Prioritize saved clients
        if (a.is_saved && !b.is_saved) return -1;
        if (!a.is_saved && b.is_saved) return 1;
        
        // Then sort by last activity (visit or created_at)
        const dateA = a.last_visit ? new Date(a.last_visit).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const dateB = b.last_visit ? new Date(b.last_visit).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return dateB - dateA;
      });
      
      setClients(allClients);
    } catch (error) {
      console.error("Failed to load clients:", error);
      toast.error("Failed to load clients");
      setClients([]);
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

  const filteredClients = clients.filter((client) => {
    const fullName = `${client.first_name} ${client.last_name}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      fullName.includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query)
    );
  });

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
    console.log("Viewing client details:", {
      clientId: client.id,
      customerId: (client as any).customer_id,
      historyId,
      isSaved: (client as any).is_saved,
    });
    loadClientHistory(historyId);
    setIsDetailSheetOpen(true);
  };

  const handleSave = async (data: Partial<Client>) => {
    try {
      if (selectedClient) {
        // Update existing client - use customer_id for unsaved clients
        const clientId = (selectedClient as any).is_saved ? selectedClient.id : null;
        const customerId = (selectedClient as any).customer_id;
        
        if (clientId) {
          await fetcher.patch(`/api/provider/clients/${clientId}`, {
            notes: data.notes || "",
            tags: (data as any).tags || [],
            is_favorite: (data as any).is_favorite || false,
            date_of_birth: data.birth_date || null,
          });
          toast.success("Client updated successfully");
        } else if (customerId) {
          await fetcher.post("/api/provider/clients", {
            customer_id: customerId,
            notes: data.notes || "",
            tags: (data as any).tags || [],
            is_favorite: (data as any).is_favorite || false,
            date_of_birth: data.birth_date || null,
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
          address: data.address ? {
            line1: data.address,
            line2: "",
            city: data.city || "",
            state: "",
            postal_code: "",
            country: "ZA",
          } : undefined,
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
        filterButton={{
          label: "Filter",
          onClick: () => console.log("Filter"),
        }}
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
          <SectionCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox />
                    </TableHead>
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
                  {filteredClients.length > 50 ? (
                    // Use virtual scrolling for large lists
                    <VirtualTable
                      items={filteredClients}
                      itemHeight={80}
                      containerHeight={600}
                      renderRow={(client, _index) => (
                        <TableRow
                          key={client.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleViewDetails(client)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                                  {client.first_name.charAt(0)}
                                  {client.last_name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">
                                  {client.first_name} {client.last_name}
                                </p>
                                {client.city && (
                                  <p className="text-sm text-gray-500">{client.city}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {client.email && (
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Mail className="w-3 h-3" />
                                  {client.email}
                                </div>
                              )}
                              {client.phone && (
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Phone className="w-3 h-3" />
                                  {client.phone}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {client.last_visit ? (
                              <span className="text-sm">
                                {new Date(client.last_visit).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{client.total_visits}</span>
                          </TableCell>
                          <TableCell>
                            <Money amount={client.total_spent} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {client.tags?.map((tag) => (
                                <span
                                  key={tag}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
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
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-2 hover:bg-gray-100 rounded">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleViewDetails(client)}
                                >
                                  <User className="w-4 h-4 mr-2" />
                                  View Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEdit(client)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReportCustomerClient(client);
                                  }}
                                >
                                  <Flag className="w-4 h-4 mr-2" />
                                  Report customer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(client);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )}
                    />
                  ) : (
                    // Regular rendering for smaller lists
                    filteredClients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleViewDetails(client)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                                {client.first_name.charAt(0)}
                                {client.last_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {client.first_name} {client.last_name}
                              </p>
                              {client.city && (
                                <p className="text-sm text-gray-500">{client.city}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {client.email && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Mail className="w-3 h-3" />
                                {client.email}
                              </div>
                            )}
                            {client.phone && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Phone className="w-3 h-3" />
                                {client.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {client.last_visit ? (
                            <span className="text-sm">
                              {new Date(client.last_visit).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{client.total_visits}</span>
                        </TableCell>
                        <TableCell>
                          <Money amount={client.total_spent} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {client.tags?.map((tag) => (
                              <span
                                key={tag}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
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
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-gray-100 rounded">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleViewDetails(client)}
                              >
                                <User className="w-4 h-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(client)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReportCustomerClient(client);
                                }}
                              >
                                <Flag className="w-4 h-4 mr-2" />
                                Report customer
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(client);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
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
  onSave: (data: Partial<Client>) => void;
}) {
  const [formData, setFormData] = useState<Partial<Client>>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    notes: "",
    birth_date: "",
    marketing_consent: false,
    sms_consent: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (client) {
        setFormData({
          first_name: client.first_name,
          last_name: client.last_name,
          email: client.email || "",
          phone: client.phone || "",
          address: client.address || "",
          city: client.city || "",
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
              />
            </div>
          </div>

          <div className="w-full">
            <Label htmlFor="address" className="text-sm sm:text-base">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              className="mt-1.5 min-h-[44px] touch-manipulation w-full"
            />
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
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              {isLoading ? "Saving..." : client ? "Update" : "Add Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// History Item Component with expandable details
function HistoryItem({ item, clientEmail }: { item: ClientHistory; clientEmail?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = item.type === "appointment" && (
    item.services?.length || 
    item.addons?.length || 
    item.products?.length ||
    item.subtotal !== undefined ||
    item.payment_status ||
    item.booking_number
  );

  // Invoice handlers
  const handlePrintInvoice = async (bookingId: string) => {
    try {
      if (!bookingId) {
        throw new Error("Booking ID is missing");
      }

      const cleanBookingId = String(bookingId).trim();
      const { fetcher } = await import("@/lib/http/fetcher");
      const result = await fetcher.get<{ data: any }>(`/api/provider/bookings/${cleanBookingId}/receipt`);
      const invoiceData = result.data;

      if (!invoiceData) {
        throw new Error("Invoice data is missing");
      }
      
      const invoiceWindow = window.open('', '_blank');
      if (!invoiceWindow) {
        toast.error("Please allow popups to print invoice");
        return;
      }
      
      const invoiceHTML = generateInvoiceHTMLFromData(invoiceData);
      invoiceWindow.document.write(invoiceHTML);
      invoiceWindow.document.close();
      invoiceWindow.focus();
      setTimeout(() => {
        invoiceWindow.print();
      }, 250);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    }
  };

  const handleEmailInvoice = async (bookingId: string, email?: string) => {
    if (!email) {
      toast.error("Client email is required to send invoice");
      return;
    }

    try {
      if (!bookingId) {
        throw new Error("Booking ID is missing");
      }

      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/bookings/${bookingId}/receipt/send`, { email });

      toast.success(`Invoice sent to ${email}`);
    } catch (error) {
      console.error("Failed to send invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send invoice");
    }
  };

  const generateInvoiceHTMLFromData = (invoiceData: any) => {
    const formatCurrency = (amount: number) => {
      return `${invoiceData.currency || 'ZAR'} ${amount.toFixed(2)}`;
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceData.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f5f5f5; }
            .total { font-size: 18px; font-weight: bold; }
            .text-right { text-align: right; }
            .summary { margin-top: 20px; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .summary-total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <p>Invoice #: ${invoiceData.invoice_number}</p>
            <p>Date: ${invoiceData.invoice_date}</p>
            ${invoiceData.booking_date ? `<p>Booking Date: ${invoiceData.booking_date}</p>` : ''}
          </div>
          
          <div class="invoice-details">
            <div>
              <h3>From:</h3>
              <p><strong>${invoiceData.provider.name}</strong></p>
              ${invoiceData.provider.email ? `<p>Email: ${invoiceData.provider.email}</p>` : ''}
              ${invoiceData.provider.phone ? `<p>Phone: ${invoiceData.provider.phone}</p>` : ''}
              ${invoiceData.provider.address.line1 ? `<p>${invoiceData.provider.address.line1}</p>` : ''}
              ${invoiceData.provider.address.line2 ? `<p>${invoiceData.provider.address.line2}</p>` : ''}
              ${invoiceData.provider.address.city ? `<p>${invoiceData.provider.address.city}${invoiceData.provider.address.state ? ', ' + invoiceData.provider.address.state : ''} ${invoiceData.provider.address.postal_code || ''}</p>` : ''}
            </div>
            <div>
              <h3>Bill To:</h3>
              <p><strong>${invoiceData.customer.name}</strong></p>
              ${invoiceData.customer.email ? `<p>Email: ${invoiceData.customer.email}</p>` : ''}
              ${invoiceData.customer.phone ? `<p>Phone: ${invoiceData.customer.phone}</p>` : ''}
            </div>
          </div>
          
          ${invoiceData.location_type === 'at_home' && invoiceData.service_address ? `
            <div class="section" style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <h3 style="margin-top: 0;">Service Location:</h3>
              ${invoiceData.service_address.line1 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line1}</p>` : ''}
              ${invoiceData.service_address.line2 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line2}</p>` : ''}
              ${invoiceData.service_address.city ? `<p style="margin: 5px 0;">${invoiceData.service_address.city}${invoiceData.service_address.state ? ', ' + invoiceData.service_address.state : ''} ${invoiceData.service_address.postal_code || ''}</p>` : ''}
            </div>
          ` : ''}
          
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item: any) => `
                  <tr>
                    <td>${item.description}${item.staff ? ` (${item.staff})` : ''}${item.duration ? ` (${item.duration} min)` : ''}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">${formatCurrency(item.unit_price)}</td>
                    <td class="text-right">${formatCurrency(item.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(invoiceData.subtotal)}</span>
            </div>
            ${invoiceData.discount_amount > 0 ? `
              <div class="summary-row">
                <span>Discount${invoiceData.discount_reason ? ` (${invoiceData.discount_reason})` : ''}:</span>
                <span>-${formatCurrency(invoiceData.discount_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.travel_fee > 0 ? `
              <div class="summary-row">
                <span>Travel Fee:</span>
                <span>${formatCurrency(invoiceData.travel_fee)}</span>
              </div>
            ` : ''}
            ${invoiceData.tax_amount > 0 ? `
              <div class="summary-row">
                <span>Tax${invoiceData.tax_rate > 0 ? ` (${invoiceData.tax_rate.toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency(invoiceData.tax_amount)}</span>
              </div>
            ` : ''}
            ${(invoiceData as any).service_fee_amount > 0 ? `
              <div class="summary-row">
                <span>Service Fee${(invoiceData as any).service_fee_percentage > 0 ? ` (${((invoiceData as any).service_fee_percentage * 100).toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency((invoiceData as any).service_fee_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.tip_amount > 0 ? `
              <div class="summary-row">
                <span>Tip:</span>
                <span>${formatCurrency(invoiceData.tip_amount)}</span>
              </div>
            ` : ''}
            <div class="summary-row summary-total">
              <span>Total Amount:</span>
              <span>${formatCurrency(invoiceData.total_amount)}</span>
            </div>
          </div>
          
          ${invoiceData.payment_status ? `
            <div class="section" style="margin-top: 20px; padding: 10px; background-color: ${
              invoiceData.payment_status === 'paid' ? '#d4edda' : 
              invoiceData.payment_status === 'pending' ? '#fff3cd' : '#f8d7da'
            }; border-radius: 5px;">
              <p style="margin: 0;"><strong>Payment Status:</strong> ${
                invoiceData.payment_status === 'paid' ? 'PAID' :
                invoiceData.payment_status === 'pending' ? 'PENDING' :
                invoiceData.payment_status === 'failed' ? 'FAILED' :
                invoiceData.payment_status.toUpperCase()
              }</p>
            </div>
          ` : ''}
          
          ${invoiceData.notes ? `
            <div class="section">
              <h3>Notes:</h3>
              <p>${invoiceData.notes}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-600";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed") return "bg-green-100 text-green-700";
    if (statusLower === "cancelled" || statusLower === "canceled") return "bg-red-100 text-red-700";
    if (statusLower === "booked" || statusLower === "confirmed") return "bg-blue-100 text-blue-700";
    if (statusLower === "pending") return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-600";
  };

  const getPaymentStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-600";
    const statusLower = status.toLowerCase();
    if (statusLower === "paid") return "bg-green-100 text-green-700";
    if (statusLower === "partially_paid") return "bg-yellow-100 text-yellow-700";
    if (statusLower === "refunded") return "bg-red-100 text-red-700";
    if (statusLower === "pending") return "bg-gray-100 text-gray-600";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary Row */}
      <div
        className={`flex items-start gap-3 p-3 ${
          hasDetails ? "cursor-pointer hover:bg-gray-50" : ""
        }`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <div
          className={`p-2 rounded-full flex-shrink-0 ${
            item.type === "appointment"
              ? "bg-blue-100 text-blue-600"
              : item.type === "sale"
              ? "bg-green-100 text-green-600"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {item.type === "appointment" ? (
            <Calendar className="w-4 h-4" />
          ) : item.type === "sale" ? (
            <DollarSign className="w-4 h-4" />
          ) : (
            <History className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {item.description}
                {item.services && item.services.length > 0 && (
                  <span className="text-gray-600 font-normal ml-2">
                    - {item.services.map((s: any) => s.offerings?.name || "Service").join(", ")}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 flex-wrap">
                <span>{new Date(item.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}</span>
                {item.scheduled_at && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.scheduled_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                )}
                {item.team_member_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.team_member_name}
                    </span>
                  </>
                )}
                {item.status && (
                  <>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.amount !== undefined && item.amount > 0 && (
                <p className="font-semibold text-sm">
                  <Money amount={item.amount} />
                </p>
              )}
              {hasDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && item.type === "appointment" && (
        <div className="border-t border-gray-200 bg-white p-4 space-y-4">
          {/* Booking Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {item.booking_number && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Booking Number</p>
                <p className="font-medium">{item.booking_number}</p>
              </div>
            )}
            {item.payment_status && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Payment Status</p>
                {(() => {
                  // Determine actual payment status: if total_paid < total_amount, it's partially_paid
                  const totalPaid = item.total_paid || 0;
                  const totalAmount = item.amount || 0;
                  const actualPaymentStatus = totalPaid > 0 && totalPaid < totalAmount 
                    ? 'partially_paid' 
                    : item.payment_status;
                  
                  return (
                    <>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getPaymentStatusColor(actualPaymentStatus)}`}>
                        {actualPaymentStatus.replace("_", " ")}
                      </span>
                      {totalPaid > 0 && totalPaid < totalAmount && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Paid: <Money amount={totalPaid} /> of <Money amount={totalAmount} />
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {item.team_member_name && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Staff Member</p>
                <p className="font-medium">{item.team_member_name}</p>
              </div>
            )}
            {item.location_type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Location</p>
                <p className="font-medium capitalize">{item.location_type.replace("_", " ")}</p>
              </div>
            )}
            {item.completed_at && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Completed</p>
                <p className="font-medium">
                  {new Date(item.completed_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Services */}
          {item.services && item.services.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Services ({item.services.length})
              </p>
              <div className="space-y-2">
                {item.services.map((service, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">
                          {service.offerings?.name || "Service"}
                          {service.offerings?.global_service_categories?.name && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({service.offerings.global_service_categories.name})
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {service.quantity > 1 && (
                            <span>Qty: {service.quantity}</span>
                          )}
                          {service.duration_minutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {service.duration_minutes} min
                            </span>
                          )}
                          <span>
                            <Money amount={service.unit_price} />
                            {service.quantity > 1 && (
                              <span> × {service.quantity} = <Money amount={service.total_price} /></span>
                            )}
                          </span>
                        </div>
                        {service.customization && (
                          <p className="text-xs text-gray-500 mt-1 italic">{service.customization}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Addons */}
          {item.addons && item.addons.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Add-ons ({item.addons.length})
              </p>
              <div className="space-y-2">
                {item.addons.map((addon, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{addon.service_addons?.name || "Add-on"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {addon.quantity > 1 && (
                            <span>Qty: {addon.quantity}</span>
                          )}
                          <span>
                            <Money amount={addon.unit_price} />
                            {addon.quantity > 1 && (
                              <span> × {addon.quantity} = <Money amount={addon.total_price} /></span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products */}
          {item.products && item.products.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" />
                Products ({item.products.length})
              </p>
              <div className="space-y-2">
                {item.products.map((product, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{product.products?.name || "Product"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {product.quantity > 1 && (
                            <span>Qty: {product.quantity}</span>
                          )}
                          <span>
                            <Money amount={product.unit_price} />
                            {product.quantity > 1 && (
                              <span> × {product.quantity} = <Money amount={product.total_price} /></span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Breakdown */}
          {(item.subtotal !== undefined || item.discount_amount || item.tax_amount || item.service_fee_amount || item.travel_fee || item.tip_amount) && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Financial Breakdown
              </p>
              <div className="space-y-1.5 text-sm">
                {item.subtotal !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium"><Money amount={item.subtotal} /></span>
                  </div>
                )}
                {item.discount_amount && item.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Discount
                      {item.discount_code && (
                        <span className="text-xs ml-1">({item.discount_code})</span>
                      )}
                    </span>
                    <span className="font-medium">-<Money amount={item.discount_amount} /></span>
                  </div>
                )}
                {item.tax_amount !== undefined && item.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Tax
                      {item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== 0 && (
                        <span className="text-xs ml-1">
                          ({(() => {
                            const rate = typeof item.tax_rate === 'number' 
                              ? item.tax_rate 
                              : parseFloat(String(item.tax_rate)) || 0;
                            // If rate is between 0 and 1, it's a decimal (0.15 = 15%), otherwise it's already a percentage (15 = 15%)
                            return rate > 1 ? rate.toFixed(1) : (rate * 100).toFixed(1);
                          })()}%)
                        </span>
                      )}
                    </span>
                    <span className="font-medium"><Money amount={item.tax_amount} /></span>
                  </div>
                )}
                {item.travel_fee && item.travel_fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Travel Fee</span>
                    <span className="font-medium"><Money amount={item.travel_fee} /></span>
                  </div>
                )}
                {(() => {
                  // Calculate service fee if missing but total suggests it exists
                  let displayServiceFeeAmount = parseFloat(String(item.service_fee_amount || 0));
                  if (displayServiceFeeAmount === 0 && item.subtotal !== undefined && item.amount) {
                    // Calculate: total - subtotal - tax - tip - travel_fee
                    // Formula: total = subtotal - discount + tax + service_fee + travel_fee + tip
                    // So: service_fee = total - subtotal + discount - tax - travel_fee - tip
                    const subtotal = parseFloat(String(item.subtotal || 0));
                    const discount = parseFloat(String(item.discount_amount || 0));
                    const tax = parseFloat(String(item.tax_amount || 0));
                    const tip = parseFloat(String(item.tip_amount || 0));
                    const travel = parseFloat(String(item.travel_fee || 0));
                    const total = parseFloat(String(item.amount || 0));
                    
                    const calculatedServiceFee = total - subtotal + discount - tax - travel - tip;
                    if (calculatedServiceFee > 0.01) { // Only use if significant (> 1 cent)
                      displayServiceFeeAmount = Math.round(calculatedServiceFee * 100) / 100; // Round to 2 decimals
                    }
                  }
                  
                  if (displayServiceFeeAmount > 0) {
                    return (
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Service Fee
                          {item.service_fee_percentage !== undefined && item.service_fee_percentage !== null && item.service_fee_percentage !== 0 && (
                            <span className="text-xs ml-1">
                              ({(() => {
                                const rate = typeof item.service_fee_percentage === 'number' 
                                  ? item.service_fee_percentage 
                                  : parseFloat(String(item.service_fee_percentage)) || 0;
                                // If rate is between 0 and 1, it's a decimal (0.10 = 10%), otherwise it's already a percentage (10 = 10%)
                                return rate > 1 ? rate.toFixed(1) : (rate * 100).toFixed(1);
                              })()}%)
                            </span>
                          )}
                        </span>
                        <span className="font-medium"><Money amount={displayServiceFeeAmount} /></span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {item.tip_amount && item.tip_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tip</span>
                    <span className="font-medium"><Money amount={item.tip_amount} /></span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                  <span>Total</span>
                  <span><Money amount={item.amount || 0} /></span>
                </div>
                {item.total_paid !== undefined && item.total_paid > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600">Paid</span>
                    <span className="font-medium text-green-600"><Money amount={item.total_paid} /></span>
                  </div>
                )}
                {item.total_refunded !== undefined && item.total_refunded > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600">Refunded</span>
                    <span className="font-medium text-red-600"><Money amount={item.total_refunded} /></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Notes</p>
              <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{item.notes}</p>
            </div>
          )}

          {/* Invoice Actions */}
          {item.type === "appointment" && item.id && (
            <div className="border-t border-gray-200 pt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrintInvoice(item.id);
                }}
                className="flex-1"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEmailInvoice(item.id, clientEmail);
                }}
                disabled={!clientEmail}
                className="flex-1"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email Invoice
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
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
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [ratingStats, setRatingStats] = useState<any>(null);
  const [ratingsList, setRatingsList] = useState<any[]>([]);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [_showRatingDialog, setShowRatingDialog] = useState(false);
  const [_selectedBookingForRating, setSelectedBookingForRating] = useState<any>(null);
  const [_showEditRatingDialog, setShowEditRatingDialog] = useState(false);
  const [_selectedRatingToEdit, setSelectedRatingToEdit] = useState<any>(null);

  // Load full client details including communication preferences
  useEffect(() => {
    const loadClientDetails = async () => {
      if (!client?.id || !open) return;

      setIsCheckingRegistration(true);
      try {
        const data = await fetcher.get<{ data?: any }>(`/api/provider/clients/${client.id}`);
        setClientDetails(data.data);
        const customer = data.data?.customer;
        setIsRegistered(customer?.id && !customer?.email?.includes("beautonomi.invalid") && !customer?.email?.includes("beautonomi.local"));
      } catch (error) {
        console.error("Error loading client details:", error);
        setIsRegistered(false);
        setClientDetails(null);
      } finally {
        setIsCheckingRegistration(false);
      }
    };

    if (open && client) {
      loadClientDetails();
      loadRatingStats();
      loadRatingsList();
    }
  }, [open, client]);

  // Load rating statistics
  const loadRatingStats = async () => {
    if (!client?.customer_id || !open) return;
    
    try {
      const data = await fetcher.get<{ data?: any }>(`/api/provider/ratings?customer_id=${client.customer_id}`);
      setRatingStats(data.data);
    } catch (error) {
      console.error("Error loading rating stats:", error);
    }
  };

  // Load ratings list
  const loadRatingsList = async () => {
    if (!client?.customer_id || !open) return;
    
    setIsLoadingRatings(true);
    try {
      const data = await fetcher.get<{ data?: { ratings?: any[] } }>(`/api/provider/ratings/list?customer_id=${client.customer_id}`);
      setRatingsList(data.data?.ratings || []);
    } catch (error) {
      console.error("Error loading ratings list:", error);
    } finally {
      setIsLoadingRatings(false);
    }
  };

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
        const ratingChecks = await Promise.all(
          bookingIds.map(async (bookingId: string) => {
            try {
              const checkData = await fetcher.get<{ data?: { has_rating?: boolean } }>(`/api/provider/ratings?booking_id=${bookingId}`);
              return { bookingId, hasRating: checkData.data?.has_rating || false };
            } catch {
              return { bookingId, hasRating: false };
            }
          })
        );
        const withoutRatings = bookings.filter((booking: any) => {
          const check = ratingChecks.find(c => c.bookingId === booking.id);
          return !check?.hasRating;
        });
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

  const _handleRatingSubmitted = () => {
    loadRatingStats();
    loadRatingsList();
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
          const ratingChecks = await Promise.all(
            bookingIds.map(async (bookingId: string) => {
              try {
                const checkData = await fetcher.get<{ data?: { has_rating?: boolean } }>(`/api/provider/ratings?booking_id=${bookingId}`);
                return { bookingId, hasRating: checkData.data?.has_rating || false };
              } catch {
                return { bookingId, hasRating: false };
              }
            })
          );
          const withoutRatings = bookings.filter((booking: any) => {
            const check = ratingChecks.find(c => c.bookingId === booking.id);
            return !check?.hasRating;
          });
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
      const data = await fetcher.post<{ data?: { id: string } }>("/api/provider/conversations/create", {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-2xl">
                  {client.first_name.charAt(0)}
                  {client.last_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-xl">
                  {client.first_name} {client.last_name}
                </SheetTitle>
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
              Edit
            </Button>
          </div>
        </SheetHeader>

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
            {client.average_rating ? (
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-semibold">{client.average_rating}</p>
                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              </div>
            ) : (
              <p className="text-2xl font-semibold">-</p>
            )}
            <p className="text-xs text-gray-600">Avg Rating</p>
            {client.average_rating && (
              <p className="text-xs text-gray-400 mt-1">Your rating of this client</p>
            )}
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
        {!isRegistered && !isCheckingRegistration && client.customer_id && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            This client is not registered. Chat messages are only available for registered clients.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
