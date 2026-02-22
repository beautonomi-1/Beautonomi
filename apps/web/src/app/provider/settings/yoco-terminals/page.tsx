"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, CreditCard } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { PageHeader } from "@/components/provider/PageHeader";

interface YocoTerminal {
  id: string;
  device_id: string;
  device_name: string;
  location_name: string;
  active: boolean;
  created_at: string;
}

export default function YocoTerminalsPage() {
  const [terminals, setTerminals] = useState<YocoTerminal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<YocoTerminal | null>(null);
  const [formData, setFormData] = useState({
    device_id: "",
    device_name: "",
    api_key: "",
    secret_key: "",
    location_name: "",
  });

  useEffect(() => {
    loadTerminals();
  }, []);

  const loadTerminals = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data?: YocoTerminal[] }>("/api/provider/yoco/terminals");
      setTerminals(response?.data ?? []);
    } catch {
      toast.error("Failed to load terminals");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (terminal?: YocoTerminal) => {
    if (terminal) {
      setEditingTerminal(terminal);
      setFormData({
        device_id: terminal.device_id,
        device_name: terminal.device_name,
        api_key: "",
        secret_key: "",
        location_name: terminal.location_name || "",
      });
    } else {
      setEditingTerminal(null);
      setFormData({
        device_id: "",
        device_name: "",
        api_key: "",
        secret_key: "",
        location_name: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTerminal) {
        await fetcher.put(`/api/provider/yoco/terminals/${editingTerminal.id}`, formData);
        toast.success("Terminal updated successfully");
      } else {
        await fetcher.post("/api/provider/yoco/terminals", formData);
        toast.success("Terminal registered successfully");
      }
      setIsDialogOpen(false);
      loadTerminals();
    } catch (error: any) {
      toast.error(error.message || "Failed to save terminal");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this terminal?")) {
      return;
    }
    try {
      await fetcher.delete(`/api/provider/yoco/terminals/${id}`);
      toast.success("Terminal deleted successfully");
      loadTerminals();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete terminal");
    }
  };

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader
          title="Yoco Terminals"
          subtitle="Manage your Yoco payment terminals for accepting in-person payments"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Settings", href: "/provider/settings" },
            { label: "Yoco Terminals" }
          ]}
        />

        <div className="mb-4">
          <Button
            onClick={() => handleOpenDialog()}
            className="touch-target"
          >
            <Plus className="w-4 h-4 mr-2" />
            Register New Terminal
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading terminals...</div>
        ) : terminals.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No terminals registered. Click "Register New Terminal" to add one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {terminals.map((terminal) => (
              <div
                key={terminal.id}
                className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-gray-400" />
                    <div>
                      <h3 className="font-semibold text-sm sm:text-base">{terminal.device_name}</h3>
                      <p className="text-xs text-gray-500">{terminal.location_name}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenDialog(terminal)}
                      className="p-1 hover:bg-gray-100 rounded touch-target"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(terminal.id)}
                      className="p-1 hover:bg-red-50 rounded touch-target"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-xs sm:text-sm">
                  <p className="text-gray-600">
                    <span className="font-medium">Device ID:</span> {terminal.device_id}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Status:</span>{" "}
                    <span className={terminal.active ? "text-green-600" : "text-red-600"}>
                      {terminal.active ? "Active" : "Inactive"}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingTerminal ? "Edit Terminal" : "Register New Terminal"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="device_id">Device ID *</Label>
                <Input
                  id="device_id"
                  value={formData.device_id}
                  onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                  required
                  disabled={!!editingTerminal}
                  className="text-sm sm:text-base"
                />
              </div>
              <div>
                <Label htmlFor="device_name">Device Name *</Label>
                <Input
                  id="device_name"
                  value={formData.device_name}
                  onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                  required
                  className="text-sm sm:text-base"
                />
              </div>
              <div>
                <Label htmlFor="location_name">Location Name</Label>
                <Input
                  id="location_name"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  placeholder="Main Location"
                  className="text-sm sm:text-base"
                />
              </div>
              {!editingTerminal && (
                <>
                  <div>
                    <Label htmlFor="api_key">API Key *</Label>
                    <Input
                      id="api_key"
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      required
                      className="text-sm sm:text-base font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="secret_key">Secret Key *</Label>
                    <Input
                      id="secret_key"
                      type="password"
                      value={formData.secret_key}
                      onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                      required
                      className="text-sm sm:text-base font-mono"
                    />
                  </div>
                </>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="touch-target"
                >
                  Cancel
                </Button>
                <Button type="submit" className="touch-target">
                  {editingTerminal ? "Update" : "Register"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
