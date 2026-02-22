"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { YocoDevice } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreditCard, Plus, MoreVertical, CheckCircle2, XCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/provider-portal/Money";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

export default function YocoDevicesPage() {
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<YocoDevice | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    device_id: "",
    location_id: "",
    is_active: true,
  });

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listYocoDevices();
      setDevices(data);
    } catch (error) {
      console.error("Failed to load devices:", error);
      toast.error("Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingDevice(null);
    setFormData({
      name: "",
      device_id: "",
      location_id: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (device: YocoDevice) => {
    setEditingDevice(device);
    setFormData({
      name: device.name,
      device_id: device.device_id,
      location_id: device.location_id || "",
      is_active: device.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingDevice) {
        await providerApi.updateYocoDevice(editingDevice.id, formData);
        toast.success("Device updated successfully");
      } else {
        await providerApi.createYocoDevice(formData);
        toast.success("Device added successfully");
      }
      setIsDialogOpen(false);
      loadDevices();
    } catch (error) {
      console.error("Failed to save device:", error);
      toast.error("Failed to save device");
    }
  };

  const handleToggleActive = async (device: YocoDevice) => {
    try {
      await providerApi.updateYocoDevice(device.id, { is_active: !device.is_active });
      toast.success(`Device ${!device.is_active ? "activated" : "deactivated"}`);
      loadDevices();
    } catch (error) {
      console.error("Failed to update device:", error);
      toast.error("Failed to update device");
    }
  };

  const handleDelete = async (device: YocoDevice) => {
    if (!confirm(`Are you sure you want to delete "${device.name}"?`)) return;
    
    try {
      await providerApi.deleteYocoDevice(device.id);
      toast.success("Device deleted successfully");
      loadDevices();
    } catch (error) {
      console.error("Failed to delete device:", error);
      toast.error("Failed to delete device");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading devices..." />;
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
    { label: "Yoco Devices" },
  ];

  return (
    <SettingsDetailLayout title="Yoco Payment Devices" subtitle="Manage your Yoco Web POS devices" breadcrumbs={breadcrumbs}>
      <PageHeader
        title="Yoco Payment Devices"
        subtitle="Manage your Yoco Web POS devices"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add Device
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingDevice ? "Edit Device" : "Add New Device"}
                </DialogTitle>
                <DialogDescription>
                  Connect a Yoco Web POS device to accept card payments
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Device Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Main Counter Terminal"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="device_id">Yoco Device ID</Label>
                  <Input
                    id="device_id"
                    placeholder="webpos-device-abc123"
                    value={formData.device_id}
                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Get this from your Yoco dashboard after creating a Web POS device
                  </p>
                </div>
                <div>
                  <Label htmlFor="location_id">Location (Optional)</Label>
                  <Select
                    value={formData.location_id || "none"}
                    onValueChange={(value) => setFormData({ ...formData, location_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No location</SelectItem>
                      <SelectItem value="location-1">Main Branch</SelectItem>
                      <SelectItem value="location-2">Sandton Branch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!formData.name || !formData.device_id}>
                  {editingDevice ? "Update" : "Add"} Device
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {devices.length === 0 ? (
        <SectionCard className="p-12 text-center">
          <EmptyState
            title="No payment devices"
            description="Add your first Yoco Web POS device to start accepting card payments"
            action={{
              label: "Add Device",
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <SectionCard key={device.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <CreditCard className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{device.name}</h3>
                    <p className="text-xs text-gray-500">{device.device_id}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(device)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(device)}>
                      {device.is_active ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(device)}
                      className="text-red-600"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm">
                {device.location_name && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-3 h-3" />
                    <span>{device.location_name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Status:</span>
                  <Badge variant={device.is_active ? "default" : "secondary"}>
                    {device.is_active ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </Badge>
                </div>
                {device.total_transactions !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Transactions:</span>
                    <span className="font-medium">{device.total_transactions}</span>
                  </div>
                )}
                {device.total_amount !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-medium">
                      <Money amount={device.total_amount / 100} />
                    </span>
                  </div>
                )}
                {device.last_used && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Last used:</span>
                    <span>{new Date(device.last_used).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </SettingsDetailLayout>
  );
}
