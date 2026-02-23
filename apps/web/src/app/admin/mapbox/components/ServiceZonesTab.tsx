"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { FetchError } from "@/lib/http/fetcher";
import { Plus, Edit, Trash2 } from "lucide-react";

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  const msg = e.message;
  if (!e.details) return msg;
  const details = Array.isArray(e.details)
    ? (e.details as Array<{ path?: string; message?: string }>)
        .map((d) => (d.path ? `${d.path}: ${d.message ?? ""}` : String(d.message ?? d)))
        .join("; ")
    : String(e.details);
  return details ? `${msg}: ${details}` : msg;
}
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlatformZone {
  id: string;
  name: string;
  zone_type: "postal_code" | "city" | "polygon" | "radius";
  postal_codes?: string[];
  cities?: string[];
  polygon_coordinates?: any;
  center_latitude?: number;
  center_longitude?: number;
  radius_km?: number;
  is_active: boolean;
  description?: string;
  created_by?: string;
}

export default function ServiceZonesTab() {
  const [zones, setZones] = useState<PlatformZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingZone, setEditingZone] = useState<PlatformZone | null>(null);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PlatformZone[] }>("/api/admin/platform-zones");
      setZones(response.data || []);
    } catch (error) {
      console.error("Error loading zones:", error);
      toast.error(formatFetchError(error, "Failed to load platform zones"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingZone(null);
    setShowDialog(true);
  };

  const handleEdit = (zone: PlatformZone) => {
    setEditingZone(zone);
    setShowDialog(true);
  };

  const handleDelete = async (zone: PlatformZone) => {
    if (!confirm(`Are you sure you want to delete "${zone.name}"? This will affect all providers who have selected this zone.`)) return;

    try {
      await fetcher.delete(`/api/admin/platform-zones/${zone.id}`);
      toast.success("Platform zone deleted");
      loadZones();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to delete platform zone"));
    }
  };

  const handleSave = async (zoneData: any) => {
    try {
      if (editingZone) {
        await fetcher.patch(`/api/admin/platform-zones/${editingZone.id}`, zoneData);
        toast.success("Platform zone updated");
      } else {
        await fetcher.post("/api/admin/platform-zones", zoneData);
        toast.success("Platform zone created");
      }
      setShowDialog(false);
      setEditingZone(null);
      loadZones();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to save platform zone"));
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading service zones..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">Manage platform service zones</p>
          <p className="text-xs text-gray-500 mt-1">
            Platform zones define where the platform is available. Providers can then select these zones and set their own pricing.
          </p>
        </div>
        <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
          <Plus className="w-4 h-4 mr-2" />
          Add Platform Zone
        </Button>
      </div>

      {zones.length === 0 ? (
        <EmptyState
          title="No platform zones"
          description="Create platform zones to define where the platform is available. Providers will be able to select these zones and set their own pricing."
          action={{
            label: "Add Platform Zone",
            onClick: handleCreate,
          }}
        />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {zones.map((zone) => (
                <tr key={zone.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{zone.name}</td>
                  <td className="px-6 py-4">
                    <Badge variant="outline">
                      {zone.zone_type === "postal_code" && "Postal Code"}
                      {zone.zone_type === "city" && "City"}
                      {zone.zone_type === "radius" && "Radius"}
                      {zone.zone_type === "polygon" && "Polygon"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {zone.zone_type === "postal_code" && zone.postal_codes
                      ? `${zone.postal_codes.length} postal codes`
                      : zone.zone_type === "city" && zone.cities
                      ? `${zone.cities.length} cities`
                      : zone.zone_type === "radius" && zone.radius_km
                      ? `${zone.radius_km} km radius`
                      : zone.zone_type === "polygon" && zone.polygon_coordinates
                      ? "Polygon zone"
                      : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={zone.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {zone.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(zone)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(zone)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDialog && (
        <ServiceZoneDialog
          zone={editingZone}
          onClose={() => {
            setShowDialog(false);
            setEditingZone(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ServiceZoneDialog({
  zone,
  onClose,
  onSave,
}: {
  zone: PlatformZone | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: zone?.name || "",
    zone_type: (zone?.zone_type || "postal_code") as PlatformZone["zone_type"],
    postal_codes: zone?.postal_codes || [] as string[],
    cities: zone?.cities || [] as string[],
    polygon_coordinates: zone?.polygon_coordinates || null,
    center_latitude: zone?.center_latitude || undefined,
    center_longitude: zone?.center_longitude || undefined,
    radius_km: zone?.radius_km || undefined,
    description: zone?.description || "",
    is_active: zone?.is_active ?? true,
  });
  const [postalCodeInput, setPostalCodeInput] = useState("");
  const [cityInput, setCityInput] = useState("");

  const handleAddPostalCode = () => {
    if (postalCodeInput.trim()) {
      setFormData({
        ...formData,
        postal_codes: [...(formData.postal_codes || []), postalCodeInput.trim()],
      });
      setPostalCodeInput("");
    }
  };

  const handleRemovePostalCode = (index: number) => {
    setFormData({
      ...formData,
      postal_codes: formData.postal_codes?.filter((_, i) => i !== index) || [],
    });
  };

  const handleAddCity = () => {
    if (cityInput.trim()) {
      setFormData({
        ...formData,
        cities: [...(formData.cities || []), cityInput.trim()],
      });
      setCityInput("");
    }
  };

  const handleRemoveCity = (index: number) => {
    setFormData({
      ...formData,
      cities: formData.cities?.filter((_, i) => i !== index) || [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{zone ? "Edit Platform Zone" : "Create Platform Zone"}</DialogTitle>
          <DialogDescription>
            Define a platform zone to control where the platform is available. Providers can then select these zones and set their own pricing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Zone Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Johannesburg Central, Cape Town Metro"
              required
            />
          </div>

          <div>
            <Label htmlFor="zone_type">Zone Type *</Label>
            <select
              id="zone_type"
              value={formData.zone_type}
              onChange={(e) => setFormData({ ...formData, zone_type: e.target.value as PlatformZone["zone_type"] })}
              className="w-full p-2 border rounded-md"
            >
              <option value="postal_code">Postal Code</option>
              <option value="city">City</option>
              <option value="radius">Radius</option>
              <option value="polygon">Polygon</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {formData.zone_type === "postal_code" && "Match addresses by postal/zip codes"}
              {formData.zone_type === "city" && "Match addresses by city names"}
              {formData.zone_type === "radius" && "Match addresses within a radius from a center point"}
              {formData.zone_type === "polygon" && "Match addresses within a custom polygon boundary"}
            </p>
          </div>

          {formData.zone_type === "postal_code" && (
            <div>
              <Label>Postal Codes *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={postalCodeInput}
                  onChange={(e) => setPostalCodeInput(e.target.value)}
                  placeholder="Enter postal code"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPostalCode();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddPostalCode} variant="outline">
                  Add
                </Button>
              </div>
              {formData.postal_codes && formData.postal_codes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.postal_codes.map((code, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {code}
                      <button
                        type="button"
                        onClick={() => handleRemovePostalCode(index)}
                        className="ml-1 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {formData.zone_type === "city" && (
            <div>
              <Label>Cities *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Enter city name"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCity();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddCity} variant="outline">
                  Add
                </Button>
              </div>
              {formData.cities && formData.cities.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.cities.map((city, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {city}
                      <button
                        type="button"
                        onClick={() => handleRemoveCity(index)}
                        className="ml-1 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {formData.zone_type === "radius" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="center_latitude">Center Latitude *</Label>
                  <Input
                    id="center_latitude"
                    type="number"
                    step="any"
                    value={formData.center_latitude || ""}
                    onChange={(e) => setFormData({ ...formData, center_latitude: parseFloat(e.target.value) || undefined })}
                    placeholder="-26.2041"
                  />
                </div>
                <div>
                  <Label htmlFor="center_longitude">Center Longitude *</Label>
                  <Input
                    id="center_longitude"
                    type="number"
                    step="any"
                    value={formData.center_longitude || ""}
                    onChange={(e) => setFormData({ ...formData, center_longitude: parseFloat(e.target.value) || undefined })}
                    placeholder="28.0473"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="radius_km">Radius (km) *</Label>
                <Input
                  id="radius_km"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formData.radius_km || ""}
                  onChange={(e) => setFormData({ ...formData, radius_km: parseFloat(e.target.value) || undefined })}
                  placeholder="10"
                />
              </div>
            </div>
          )}

          {formData.zone_type === "polygon" && (
            <div>
              <Label>Polygon Coordinates</Label>
              <p className="text-xs text-gray-500 mb-2">
                Polygon zones require GeoJSON coordinates. Use the API or contact support for polygon zone creation.
              </p>
              <p className="text-xs text-amber-600">
                Note: Interactive polygon editor coming soon. For now, polygon zones must be created via API.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span>Active (available for providers to select)</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {zone ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
