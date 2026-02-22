"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { AppointmentNote, NoteTemplate, NoteType } from "@/lib/provider-portal/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Eye,
  EyeOff,
  Clock,
  User,
  Copy,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppointmentNotesPanelProps {
  appointmentId: string;
}

export function AppointmentNotesPanel({ appointmentId }: AppointmentNotesPanelProps) {
  const [notes, setNotes] = useState<AppointmentNote[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<AppointmentNote | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "templates">("notes");

  useEffect(() => {
    loadData();
  }, [appointmentId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [notesData, templatesData] = await Promise.all([
        providerApi.listAppointmentNotes(appointmentId),
        providerApi.listNoteTemplates(),
      ]);
      setNotes(notesData);
      setTemplates(templatesData);
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = () => {
    setSelectedNote(null);
    setIsAddNoteOpen(true);
  };

  const handleEditNote = (note: AppointmentNote) => {
    setSelectedNote(note);
    setIsAddNoteOpen(true);
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      await providerApi.deleteAppointmentNote(id);
      toast.success("Note deleted");
      loadData();
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleUseTemplate = (template: NoteTemplate) => {
    setSelectedNote({
      id: "",
      appointment_id: appointmentId,
      type: template.type,
      content: template.content,
      created_by: "",
      created_by_name: "",
      created_date: "",
      is_edited: false,
    });
    setIsAddNoteOpen(true);
  };

  const getNoteTypeColor = (type: NoteType) => {
    switch (type) {
      case "internal":
        return "bg-blue-100 text-blue-800";
      case "client_visible":
        return "bg-green-100 text-green-800";
      case "system":
        return "bg-gray-100 text-gray-800";
    }
  };

  const getNoteTypeIcon = (type: NoteType) => {
    switch (type) {
      case "internal":
        return <EyeOff className="w-3 h-3" />;
      case "client_visible":
        return <Eye className="w-3 h-3" />;
      case "system":
        return <FileText className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notes & History</h3>
        <Button onClick={handleAddNote} size="sm" className="bg-[#FF0077] hover:bg-[#D60565]">
          <Plus className="w-4 h-4 mr-2" />
          Add Note
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4">
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              No notes yet. Add a note to track important information about this appointment.
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getNoteTypeColor(note.type)}>
                        <span className="flex items-center gap-1">
                          {getNoteTypeIcon(note.type)}
                          {note.type === "internal"
                            ? "Internal"
                            : note.type === "client_visible"
                            ? "Client Visible"
                            : "System"}
                        </span>
                      </Badge>
                      {note.is_edited && (
                        <Badge variant="outline" className="text-xs">
                          Edited
                        </Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditNote(note)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(note.content);
                            toast.success("Note copied");
                          }}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{note.created_by_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{format(new Date(note.created_date), "PPp")}</span>
                    </div>
                    {note.edited_date && (
                      <span className="text-gray-400">
                        Edited {format(new Date(note.edited_date), "PPp")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="space-y-2">
            {templates.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">
                No templates available. Create templates to quickly add common notes.
              </div>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleUseTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge className={getNoteTypeColor(template.type)} variant="outline">
                          {template.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{template.content}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Use
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NoteDialog
        open={isAddNoteOpen}
        onOpenChange={setIsAddNoteOpen}
        note={selectedNote}
        appointmentId={appointmentId}
        onSuccess={loadData}
      />
    </div>
  );
}

// Note Create/Edit Dialog
function NoteDialog({
  open,
  onOpenChange,
  note,
  appointmentId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: AppointmentNote | null;
  appointmentId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    type: "internal" as NoteType,
    content: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);

  useEffect(() => {
    if (open) {
      loadTemplates();
      if (note) {
        setFormData({
          type: note.type,
          content: note.content,
        });
      } else {
        setFormData({
          type: "internal",
          content: "",
        });
      }
    }
  }, [open, note]);

  const loadTemplates = async () => {
    try {
      const data = await providerApi.listNoteTemplates();
      setTemplates(data);
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  };

  const handleUseTemplate = (template: NoteTemplate) => {
    setFormData({
      type: template.type,
      content: template.content,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (note && note.id) {
        await providerApi.updateAppointmentNote(note.id, formData);
        toast.success("Note updated");
      } else {
        await providerApi.createAppointmentNote({
          appointment_id: appointmentId,
          ...formData,
        });
        toast.success("Note added");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error("Failed to save note");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{note ? "Edit Note" : "Add Note"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="type">Note Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as NoteType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4" />
                    <span>Internal (Staff only)</span>
                  </div>
                </SelectItem>
                <SelectItem value="client_visible">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>Client Visible</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {formData.type === "internal"
                ? "Only visible to staff members"
                : "Visible to both staff and client"}
            </p>
          </div>

          {templates.length > 0 && (
            <div>
              <Label>Use Template</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {templates.slice(0, 4).map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                    className="justify-start text-left"
                  >
                    <FileText className="w-3 h-3 mr-2" />
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="content">Note Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              placeholder="Enter note content..."
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : note ? "Update" : "Add Note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
