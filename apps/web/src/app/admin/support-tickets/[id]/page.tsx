"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Send, User, FileText } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import Link from "next/link";
import { useParams } from "next/navigation";

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
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  created_at: string;
  updated_at: string;
}

export default function SupportTicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");

  useEffect(() => {
    if (ticketId) {
      loadTicket();
    }
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps -- load when ticketId changes

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status);
      setPriority(ticket.priority);
    }
  }, [ticket]);

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
        is_internal: false,
      });

      toast.success("Message sent");
      setNewMessage("");
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

  const handleUpdateStatus = async () => {
    try {
      await fetcher.patch(`/api/admin/support-tickets/${ticketId}`, {
        status,
        priority,
      });

      toast.success("Ticket updated");
      loadTicket();
    } catch (error) {
      console.error("Failed to update ticket:", error);
      toast.error("Failed to update ticket");
    }
  };

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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading ticket..." />
      </div>
    );
  }

  if (!ticket) {
    return (
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
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
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
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{ticket.subject}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Ticket #{ticket.ticket_number}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status.replace("_", " ")}
                    </Badge>
                    <Badge className={getPriorityColor(ticket.priority)}>
                      {ticket.priority}
                    </Badge>
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
                      <p className="mt-2">{ticket.category}</p>
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
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-sm">
                          {message.user?.full_name || message.user?.email || "System"}
                        </span>
                        {message.is_internal && (
                          <Badge variant="outline" className="text-xs">
                            Internal
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <Label>Add Message</Label>
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    rows={3}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isSending || !newMessage.trim()}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </Button>
                </div>
              </CardContent>
            </Card>

            {notes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Internal Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <span className="font-medium text-sm">
                            {note.user?.full_name || note.user?.email || "System"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(note.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ticket Details</CardTitle>
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
                        <SelectItem value="in_progress">In Progress</SelectItem>
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

                <Button
                  onClick={handleUpdateStatus}
                  className="w-full bg-[#FF0077] hover:bg-[#D60565]"
                >
                  Update Ticket
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.user ? (
                  <>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Name</Label>
                      <p>{ticket.user.full_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Email</Label>
                      <p>{ticket.user.email}</p>
                    </div>
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

            <Card>
              <CardHeader>
                <CardTitle>Add Internal Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a private note..."
                  rows={3}
                />
                <Button
                  onClick={handleAddNote}
                  disabled={isSending || !newNote.trim()}
                  variant="outline"
                  className="w-full"
                >
                  Add Note
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
