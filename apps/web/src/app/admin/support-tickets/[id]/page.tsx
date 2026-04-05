"use client";

import React, { useState, useEffect, useMemo } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Send, User, FileText, ExternalLink } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import { useParams } from "next/navigation";
import { labelForSupportTicketCategory } from "@/lib/support/ticket-categories";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import type { UserRole } from "@/types/beautonomi";

const STAFF_ROLES = [...SUPPORT_TICKET_STAFF_ROLES] as UserRole[];
const UNASSIGNED = "__unassigned__";

interface TicketMessage {
  id: string;
  message: string;
  is_internal: boolean;
  user: { id: string; email: string; full_name: string | null } | null;
  created_at: string;
}

interface TicketNote {
  id: string;
  note: string;
  is_private: boolean;
  user: { id: string; email: string; full_name: string | null } | null;
  created_at: string;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  created_at: string;
  updated_at: string;
}

interface AssigneeRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export default function SupportTicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [assignees, setAssignees] = useState<AssigneeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [replyIsInternal, setReplyIsInternal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);

  useEffect(() => {
    if (!ticketId) return;
    (async () => {
      try {
        const r = await fetcher.get<{ assignees: AssigneeRow[] }>("/api/admin/support-ticket-assignees");
        setAssignees(r.assignees ?? []);
      } catch (e) {
        console.error("Failed to load assignees:", e);
        toast.error("Failed to load assignees");
      }
    })();
  }, [ticketId]);

  useEffect(() => {
    if (ticketId) {
      loadTicket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when ticketId changes
  }, [ticketId]);

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status);
      setPriority(ticket.priority);
      setAssigneeId(ticket.assigned_to ?? UNASSIGNED);
    }
  }, [ticket]);

  const assigneeOptions = useMemo(() => {
    const byId = new Map(assignees.map((a) => [a.id, a]));
    if (ticket?.assigned_to && ticket.assigned_user && !byId.has(ticket.assigned_to)) {
      byId.set(ticket.assigned_to, {
        id: ticket.assigned_to,
        email: ticket.assigned_user.email,
        full_name: ticket.assigned_user.full_name,
        role: "",
      });
    }
    return Array.from(byId.values()).sort((a, b) => {
      const an = (a.full_name || a.email).toLowerCase();
      const bn = (b.full_name || b.email).toLowerCase();
      return an.localeCompare(bn);
    });
  }, [assignees, ticket?.assigned_to, ticket?.assigned_user]);

  const loadTicket = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{
        ticket: SupportTicket;
        messages: TicketMessage[];
        notes: TicketNote[];
      }>(`/api/admin/support-tickets/${ticketId}`);

      setTicket(response.ticket);
      setMessages(response.messages || []);
      setNotes(response.notes || []);
    } catch (error) {
      console.error("Failed to load ticket:", error);
      toast.error("Failed to load support ticket");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      setIsSending(true);
      await fetcher.post(`/api/admin/support-tickets/${ticketId}/messages`, {
        message: newMessage,
        is_internal: replyIsInternal,
      });

      toast.success(replyIsInternal ? "Internal reply added" : "Message sent");
      setNewMessage("");
      setReplyIsInternal(false);
      loadTicket();
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      setIsSending(true);
      await fetcher.post(`/api/admin/support-tickets/${ticketId}/notes`, {
        note: newNote,
        is_private: true,
      });

      toast.success("Note added");
      setNewNote("");
      loadTicket();
    } catch (error) {
      console.error("Failed to add note:", error);
      toast.error("Failed to add note");
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateTicket = async () => {
    try {
      await fetcher.patch(`/api/admin/support-tickets/${ticketId}`, {
        status,
        priority,
        assigned_to: assigneeId === UNASSIGNED ? null : assigneeId,
      });

      toast.success("Ticket updated");
      loadTicket();
    } catch (error) {
      console.error("Failed to update ticket:", error);
      toast.error("Failed to update ticket");
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
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

  const getPriorityColor = (p: string) => {
    switch (p) {
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

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={STAFF_ROLES} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading ticket..." />
        </div>
      </RoleGuard>
    );
  }

  if (!ticket) {
    return (
      <RoleGuard allowedRoles={STAFF_ROLES} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-gray-500">Ticket not found</p>
            <Link href="/admin/support-tickets">
              <Button variant="outline" className="mt-4">
                Back to Tickets
              </Button>
            </Link>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={STAFF_ROLES} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <Link href="/admin/support-tickets">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tickets
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="text-xl">{ticket.subject}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Ticket #{ticket.ticket_number}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status.replace("_", " ")}
                    </Badge>
                    <Badge className={getPriorityColor(ticket.priority)}>{ticket.priority}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Description</Label>
                    <p className="mt-2 whitespace-pre-wrap">{ticket.description}</p>
                  </div>
                  {ticket.category && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Category</Label>
                      <p className="mt-2">{labelForSupportTicketCategory(ticket.category)}</p>
                      <p className="mt-1 font-mono text-xs text-gray-400">{ticket.category}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg ${
                      message.is_internal
                        ? "bg-yellow-50 border border-yellow-200"
                        : "bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="font-medium text-sm">
                          {message.user?.full_name || message.user?.email || "System"}
                        </span>
                        {message.is_internal && (
                          <Badge variant="outline" className="text-xs">
                            Internal
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>
                ))}

                <Separator />

                <div className="space-y-3">
                  <Label>Add reply</Label>
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message…"
                    rows={3}
                  />
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="reply-internal"
                      checked={replyIsInternal}
                      onCheckedChange={(c) => setReplyIsInternal(c === true)}
                    />
                    <label htmlFor="reply-internal" className="text-sm leading-tight cursor-pointer">
                      Internal only — customer won&apos;t see this in the thread or get an email.
                    </label>
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={isSending || !newMessage.trim()}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Internal team notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-lg">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                          <span className="font-medium text-sm">
                            {note.user?.full_name || note.user?.email || "System"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(note.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    </div>
                  ))
                )}
                <Separator />
                <div className="space-y-2">
                  <Label>Add note</Label>
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Private note for staff…"
                    rows={3}
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={isSending || !newNote.trim()}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    Add note
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ticket details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <div className="mt-2">
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500">Priority</Label>
                  <div className="mt-2">
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500">Assigned to</Label>
                  <div className="mt-2">
                    <Select value={assigneeId} onValueChange={setAssigneeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {assigneeOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name || a.email}
                            {a.role ? ` · ${a.role.replace(/_/g, " ")}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleUpdateTicket} className="w-full bg-[#FF0077] hover:bg-[#D60565]">
                  Save changes
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.user ? (
                  <>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Name</Label>
                      <p>{ticket.user.full_name || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Email</Label>
                      <p>{ticket.user.email}</p>
                    </div>
                    <Link
                      href={`/admin/users/${ticket.user.id}`}
                      className="inline-flex items-center gap-1 text-sm text-[#FF0077] hover:underline mt-2"
                    >
                      View in Users
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </>
                ) : ticket.provider ? (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Provider</Label>
                    <p>{ticket.provider.business_name}</p>
                  </div>
                ) : (
                  <p className="text-gray-500">No user information</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
