"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Salon, YocoDevice } from "@/lib/provider-portal/types";
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
import { CreditCard, Plus, MoreVertical, CheckCircle2, XCircle, MapPin, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/provider-portal/Money";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

export default function YocoDevicesPage() {
  const { bundle, isLoading: isConfigLoading } = useConfigBundle();
  const yocoEnabled = bundle?.flags?.payment_yoco?.enabled === true;
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<YocoDevice | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    location_id: "",
    is_active: true,
    credential_mode: "web_pos" as "web_pos" | "virtual_checkout",
  });

  useEffect(() => {
    loadPageData();
  }, [yocoEnabled]);

  const loadPageData = async () => {
    if (!yocoEnabled) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [deviceData, salonData] = await Promise.all([
        providerApi.listYocoDevices(),
        providerApi.getSalons(),
      ]);
      setDevices(deviceData);
      setSalons(salonData);
    } catch (error) {
      console.error("Failed to load devices or locations:", error);
      toast.error("Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingDevice(null);
    setFormData({
      name: "",
      location_id: "",
      is_active: true,
      credential_mode: "web_pos",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (device: YocoDevice) => {
    setEditingDevice(device);
    setFormData({
      name: device.name,
      location_id: device.location_id || "",
      is_active: device.is_active,
      credential_mode: device.credential_mode === "virtual_checkout" ? "virtual_checkout" : "web_pos",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formData.name.trim();
    if (!name) {
      toast.error("Device name is required");
      return;
    }
    const locationId: string | null = formData.location_id ? formData.location_id : null;
    try {
      if (editingDevice) {
        await providerApi.updateYocoDevice(editingDevice.id, {
          name,
          location_id: locationId,
          is_active: formData.is_active,
        });
        toast.success("Device updated successfully");
      } else {
        await providerApi.createYocoDevice({
          name,
          location_id: locationId,
          is_active: formData.is_active,
          credential_mode: formData.credential_mode,
        });
        toast.success("Device added successfully");
      }
      setIsDialogOpen(false);
      loadPageData();
    } catch (error) {
      console.error("Failed to save device:", error);
      toast.error("Failed to save device");
    }
  };

  const handleToggleActive = async (device: YocoDevice) => {
    try {
      await providerApi.updateYocoDevice(device.id, { is_active: !device.is_active });
      toast.success(`Device ${!device.is_active ? "activated" : "deactivated"}`);
      loadPageData();
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
      loadPageData();
    } catch (error) {
      console.error("Failed to delete device:", error);
      toast.error("Failed to delete device");
    }
  };

  if (isConfigLoading || isLoading) {
    return <LoadingTimeout loadingMessage="Loading devices..." />;
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
    { label: "Yoco Devices" },
  ];

  if (!yocoEnabled) {
    return (
      <SettingsDetailLayout title="Yoco Payment Devices" subtitle="Yoco is currently unavailable" breadcrumbs={breadcrumbs}>
        <SectionCard>
          <div className="py-8 text-center">
            <CreditCard className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Yoco payments are disabled</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Yoco devices and hosted checkout are hidden because the platform has disabled Yoco for this market.
            </p>
          </div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

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
                  {editingDevice
                    ? "Update this Web POS device. The Yoco device ID is assigned by Yoco and cannot be changed here."
                    : "Register a Web POS device: Beautonomi calls Yoco's create-device API with the name you enter; Yoco returns the device ID used for charges."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Device name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Main counter terminal"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                {editingDevice ? (
                  <div>
                    <Label htmlFor="yoco_device_id_readonly">Yoco device ID</Label>
                    <Input
                      id="yoco_device_id_readonly"
                      readOnly
                      value={editingDevice.device_id}
                      className="mt-1 bg-muted"
                    />
                    <p className="text-xs text-gray-500 mt-1">Assigned by Yoco when the device was created</p>
                  </div>
                ) : null}
                {!editingDevice ? (
                  <div>
                    <Label htmlFor="credential_mode">Device type</Label>
                    <Select
                      value={formData.credential_mode}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          credential_mode: value === "virtual_checkout" ? "virtual_checkout" : "web_pos",
                        })
                      }
                    >
                      <SelectTrigger id="credential_mode" className="mt-1">
                        <SelectValue placeholder="Choose device type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web_pos">Physical Web POS terminal</SelectItem>
                        <SelectItem value="virtual_checkout">Virtual checkout link / QR</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Virtual checkout uses your Yoco Checkout secret key and does not create a physical terminal.
                    </p>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="location_id">Location (optional)</Label>
                  <Select
                    value={formData.location_id || "none"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, location_id: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger id="location_id" className="mt-1">
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All locations</SelectItem>
                      {salons.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Active</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!formData.name.trim()}>
                  {editingDevice ? "Update" : "Add"} device
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <SectionCard className="mb-6 bg-amber-50/50 border-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Refunds:</strong> Card refunds for Yoco payments are processed in your{" "}
            <a
              href="https://dashboard.yoco.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Yoco dashboard
            </a>
            . When you refund a payment there, we sync the refund to the booking automatically.
          </div>
        </div>
      </SectionCard>

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
