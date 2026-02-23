"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, MapPin, Save, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RoleGuard from "@/components/auth/RoleGuard";

interface Provider {
  id: string;
  name: string;
  max_service_distance_km: number | null;
  is_distance_filter_enabled: boolean | null;
}

export default function AdminDistanceSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editForm, setEditForm] = useState({
    max_service_distance_km: 10,
    is_distance_filter_enabled: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Provider[] }>("/api/admin/providers");
      setProviders(response.data || []);
    } catch (error) {
      console.error("Error loading providers:", error);
      toast.error("Failed to load providers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setEditForm({
      max_service_distance_km: provider.max_service_distance_km || 10,
      is_distance_filter_enabled: provider.is_distance_filter_enabled || false,
    });
  };

  const handleSave = async () => {
    if (!editingProvider) return;

    try {
      setIsSaving(true);
      await fetcher.patch(
        `/api/admin/providers/${editingProvider.id}/distance-settings`,
        editForm
      );
      toast.success("Distance settings updated successfully");
      setEditingProvider(null);
      loadProviders();
    } catch (error) {
      toast.error("Failed to update distance settings");
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProviders = providers.filter((provider) =>
    provider.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <LoadingTimeout loadingMessage="Loading providers..." />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Provider Distance Settings</h1>
          <p className="text-sm text-gray-600">
            Manage distance settings for all providers
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search providers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Providers Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider Name</TableHead>
              <TableHead>Distance Filter</TableHead>
              <TableHead>Max Distance (km)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProviders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  {searchQuery ? "No providers found" : "No providers available"}
                </TableCell>
              </TableRow>
            ) : (
              filteredProviders.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>
                  <TableCell>
                    {provider.is_distance_filter_enabled ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.max_service_distance_km
                      ? `${provider.max_service_distance_km} km`
                      : "Not set"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(provider)}
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Distance Settings</DialogTitle>
            <DialogDescription>
              Update distance settings for {editingProvider?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_distance_filter_enabled">Enable Distance Filter</Label>
                <p className="text-xs text-gray-600 mt-1">
                  Limit house call bookings to customers within specified distance
                </p>
              </div>
              <input
                type="checkbox"
                id="is_distance_filter_enabled"
                checked={editForm.is_distance_filter_enabled}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    is_distance_filter_enabled: e.target.checked,
                  })
                }
                className="w-5 h-5"
              />
            </div>

            {editForm.is_distance_filter_enabled && (
              <div>
                <Label htmlFor="max_service_distance_km">Maximum Distance (km)</Label>
                <Input
                  id="max_service_distance_km"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={editForm.max_service_distance_km}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      max_service_distance_km: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Maximum distance provider is willing to travel (1-100 km)
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingProvider(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RoleGuard>
  );
}
