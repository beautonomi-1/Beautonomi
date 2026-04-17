"use client";

import React, { useState, useEffect, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, MessageSquare, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import Link from "next/link";
import { labelForSupportTicketCategory, SUPPORT_TICKET_CATEGORY_GROUPS } from "@/lib/support/ticket-categories";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import type { UserRole } from "@/types/beautonomi";
import { useAuth } from "@/providers/AuthProvider";

const PAGE_SIZE = 25;
const STAFF_ROLES = [...SUPPORT_TICKET_STAFF_ROLES] as UserRole[];

interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  created_at: string;
  updated_at: string;
}

function ticketAgeDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const staffUserId = user?.id;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assignFilter, setAssignFilter] = useState<string>("all");
  const [pageIndex, setPageIndex] = useState(0);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newDescription.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setCreating(true);
    try {
      await fetcher.post("/api/admin/support-tickets", {
        subject: newSubject.trim(),
        description: newDescription.trim(),
        priority: newPriority,
        category: newCategory || undefined,
      });
      toast.success("Ticket created");
      setShowCreateDialog(false);
      setNewSubject("");
      setNewDescription("");
      setNewPriority("medium");
      setNewCategory("");
      loadTickets();
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPageIndex(0);
  }, [statusFilter, priorityFilter, categoryFilter, assignFilter, debouncedSearch]);

  const loadTickets = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageIndex * PAGE_SIZE));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (assignFilter === "unassigned") params.set("assigned_to", "unassigned");
      else if (assignFilter === "mine" && staffUserId) params.set("assigned_to", staffUserId);
      const q = debouncedSearch.trim();
      if (q) params.set("q", q);

      const response = await fetcher.get<{
        tickets?: SupportTicket[];
        total?: number;
        limit?: number;
        offset?: number;
      }>(`/api/admin/support-tickets?${params.toString()}`);

      setTickets(response.tickets ?? []);
      setTotal(response.total ?? 0);
    } catch (error) {
      console.error("Failed to load tickets:", error);
      toast.error("Failed to load support tickets");
    } finally {
      setIsLoading(false);
    }
  }, [
    pageIndex,
    statusFilter,
    priorityFilter,
    categoryFilter,
    assignFilter,
    debouncedSearch,
    staffUserId,
  ]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const offset = pageIndex * PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + tickets.length;
  const canPrev = pageIndex > 0;
  const canNext = offset + tickets.length < total;

  return (
    <RoleGuard allowedRoles={STAFF_ROLES} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <AdminPageHeader
            title="Support Tickets"
            description="Manage customer and provider support requests"
          />
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Ticket
          </Button>
        </div>

        <AdminFilterBar className="mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search subject or ticket #…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:min-w-[240px] sm:max-w-md">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(70vh,28rem)]">
                  <SelectItem value="all">All categories</SelectItem>
                  {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="text-xs text-muted-foreground">{group.label}</SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignFilter} onValueChange={setAssignFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tickets</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="mine" disabled={!staffUserId}>
                    Assigned to me
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </AdminFilterBar>

        {isLoading ? (
          <LoadingTimeout loadingMessage="Loading support tickets..." />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No support tickets"
            description={
              searchTerm ||
              statusFilter !== "all" ||
              priorityFilter !== "all" ||
              categoryFilter !== "all" ||
              assignFilter !== "all"
                ? "No tickets match your filters"
                : "No support tickets have been created yet"
            }
          />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono text-sm">{ticket.ticket_number}</TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          <p className="font-medium truncate">{ticket.subject}</p>
                          {ticket.category && (
                            <p className="text-xs text-gray-500">
                              {labelForSupportTicketCategory(ticket.category)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {ticket.user ? (
                            <>
                              <p className="text-sm font-medium">{ticket.user.full_name || "Unknown"}</p>
                              <p className="text-xs text-gray-500">{ticket.user.email}</p>
                            </>
                          ) : ticket.provider ? (
                            <p className="text-sm">{ticket.provider.business_name}</p>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(ticket.priority)}>{ticket.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(ticket.status)}>
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ticket.assigned_user ? (
                          <p className="text-sm">
                            {ticket.assigned_user.full_name || ticket.assigned_user.email}
                          </p>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {ticketAgeDays(ticket.created_at)}d
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{new Date(ticket.created_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(ticket.created_at).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/support-tickets/${ticket.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                Showing {rangeStart}–{rangeEnd} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canPrev}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNext}
                  onClick={() => setPageIndex((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
        {/* Create Ticket Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
              <DialogDescription>Create a ticket on behalf of a customer or for internal tracking.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Brief summary of the issue..." />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Detailed description..." rows={4} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category (optional)</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {Object.entries(SUPPORT_TICKET_CATEGORY_GROUPS).map(([group, cats]) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {(cats as unknown as string[]).map((c) => (
                            <SelectItem key={c} value={c}>{labelForSupportTicketCategory(c)}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateTicket} disabled={creating}>
                {creating ? "Creating..." : "Create Ticket"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
