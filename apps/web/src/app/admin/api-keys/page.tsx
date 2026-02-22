"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Copy, Key, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  rate_limit_per_minute: number;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Key visibility state reserved for future "show key" toggle
  const [_isKeyVisible, _setIsKeyVisible] = useState<Record<string, boolean>>({});  
  const [newKey, setNewKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    permissions: [] as string[],
    rate_limit_per_minute: 60,
    rate_limit_per_hour: 1000,
    rate_limit_per_day: 10000,
    expires_at: "",
  });

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ keys: ApiKey[] }>("/api/admin/api-keys");
      setKeys(response.keys || []);
    } catch (error) {
      console.error("Failed to load API keys:", error);
      toast.error("Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingKey(null);
    setNewKey(null);
    setFormData({
      name: "",
      permissions: [],
      rate_limit_per_minute: 60,
      rate_limit_per_hour: 1000,
      rate_limit_per_day: 10000,
      expires_at: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (key: ApiKey) => {
    setEditingKey(key);
    setNewKey(null);
    setFormData({
      name: key.name,
      permissions: key.permissions || [],
      rate_limit_per_minute: key.rate_limit_per_minute,
      rate_limit_per_hour: key.rate_limit_per_hour,
      rate_limit_per_day: key.rate_limit_per_day,
      expires_at: key.expires_at ? new Date(key.expires_at).toISOString().split("T")[0] : "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
      return;
    }

    try {
      await fetcher.delete(`/api/admin/api-keys/${id}`);
      toast.success("API key deleted successfully");
      loadKeys();
    } catch (error) {
      console.error("Failed to delete API key:", error);
      toast.error("Failed to delete API key");
    }
  };

  const handleSave = async () => {
    try {
      if (editingKey) {
        await fetcher.patch(`/api/admin/api-keys/${editingKey.id}`, {
          ...formData,
          expires_at: formData.expires_at || null,
        });
        toast.success("API key updated successfully");
      } else {
        const response = await fetcher.post<{ key: ApiKey & { api_key?: string } }>(
          "/api/admin/api-keys",
          {
            ...formData,
            expires_at: formData.expires_at || null,
          }
        );
        if (response.key.api_key) {
          setNewKey(response.key.api_key);
          toast.success("API key created successfully");
        }
      }
      setIsDialogOpen(false);
      loadKeys();
    } catch (error) {
      console.error("Failed to save API key:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save API key");
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  const togglePermission = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const availablePermissions = [
    "read:users",
    "write:users",
    "read:bookings",
    "write:bookings",
    "read:providers",
    "write:providers",
    "read:finance",
    "write:finance",
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading API keys..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-gray-600 mt-1">Manage API keys for external integrations</p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </div>

        {newKey && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-semibold text-yellow-900">API Key Created</h3>
                </div>
                <p className="text-sm text-yellow-800 mb-3">
                  Please copy this API key now. You won&apos;t be able to see it again!
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={newKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyKey(newKey)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewKey(null)}
              >
                ×
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <EmptyState
            icon={Key}
            title="No API keys"
            description="Create your first API key to get started"
            action={{
              label: "Create API Key",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Rate Limits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {key.key_prefix}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.slice(0, 2).map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {p}
                          </Badge>
                        ))}
                        {key.permissions.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{key.permissions.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500">
                        {key.rate_limit_per_minute}/min
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                      {key.expires_at && new Date(key.expires_at) < new Date() && (
                        <Badge className="bg-red-100 text-red-800 ml-2">Expired</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {key.last_used_at ? (
                        <span className="text-sm text-gray-500">
                          {new Date(key.last_used_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(key)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(key.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingKey ? "Edit API Key" : "Create API Key"}
              </DialogTitle>
              <DialogDescription>
                {editingKey
                  ? "Update API key settings and permissions"
                  : "Create a new API key for external integrations"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Production API Key"
                  required
                />
              </div>

              <div>
                <Label>Permissions</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availablePermissions.map((permission) => (
                    <div
                      key={permission}
                      className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50"
                      onClick={() => togglePermission(permission)}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{permission}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="rate_limit_per_minute">Rate Limit (per minute)</Label>
                  <Input
                    id="rate_limit_per_minute"
                    type="number"
                    value={formData.rate_limit_per_minute}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rate_limit_per_minute: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="rate_limit_per_hour">Rate Limit (per hour)</Label>
                  <Input
                    id="rate_limit_per_hour"
                    type="number"
                    value={formData.rate_limit_per_hour}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rate_limit_per_hour: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="rate_limit_per_day">Rate Limit (per day)</Label>
                  <Input
                    id="rate_limit_per_day"
                    type="number"
                    value={formData.rate_limit_per_day}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rate_limit_per_day: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="expires_at">Expiration Date (optional)</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-[#FF0077] hover:bg-[#D60565]">
                {editingKey ? "Update" : "Create"} API Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
