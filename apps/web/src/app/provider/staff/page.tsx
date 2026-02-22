"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Search, User, Mail, Phone, Home, Filter } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface StaffLocation {
  location_id: string;
  location_name?: string;
  location_city?: string;
  is_primary: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  locations?: StaffLocation[];
  primary_location_id?: string | null;
  mobileReady?: boolean;
}

export default function ProviderStaff() {
  const { selectedLocationId, salons: _salons } = useProviderPortal();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [mobileFilter, setMobileFilter] = useState<"all" | "mobile" | "not-mobile">("all");

  useEffect(() => {
    loadStaff();
  }, [selectedLocationId]);
  
  // If location is selected, filter staff to only those assigned to that location
  // If no location selected, show all staff

  const loadStaff = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = selectedLocationId
        ? `/api/provider/staff?location_id=${selectedLocationId}`
        : "/api/provider/staff";
      
      const response = await fetcher.get<{ data: StaffMember[] }>(url);
      setStaff(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load staff";
      setError(errorMessage);
      console.error("Error loading staff:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this staff member?")) return;

    try {
      await fetcher.delete(`/api/provider/staff/${id}`);
      toast.success("Staff member removed successfully");
      loadStaff();
    } catch {
      toast.error("Failed to remove staff member");
    }
  };

  const filteredStaff = staff.filter((member) => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    // Apply mobile filter
    if (mobileFilter === "mobile") {
      return member.mobileReady === true;
    } else if (mobileFilter === "not-mobile") {
      return member.mobileReady !== true;
    }
    
    return true;
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading staff..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Staff Management</h1>
            <p className="text-gray-600">Manage your team members</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Staff Member
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search staff by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={mobileFilter}
              onChange={(e) => setMobileFilter(e.target.value as "all" | "mobile" | "not-mobile")}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
            >
              <option value="all">All Staff</option>
              <option value="mobile">Mobile Ready Only</option>
              <option value="not-mobile">Not Mobile Ready</option>
            </select>
          </div>
        </div>

        {/* Staff List */}
        {error ? (
          <EmptyState
            title="Failed to load staff"
            description={error}
            action={{
              label: "Retry",
              onClick: loadStaff,
            }}
          />
        ) : filteredStaff.length === 0 ? (
          <EmptyState
            title="No staff members yet"
            description="Add your first team member to get started"
            action={{
              label: "Add Staff Member",
              onClick: () => setShowAddModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStaff.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                onEdit={() => setEditingStaff(member)}
                onDelete={() => handleDelete(member.id)}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {(showAddModal || editingStaff) && (
          <StaffModal
            staff={editingStaff}
            onClose={() => {
              setShowAddModal(false);
              setEditingStaff(null);
            }}
            onSave={() => {
              setShowAddModal(false);
              setEditingStaff(null);
              loadStaff();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function StaffCard({
  member,
  onEdit,
  onDelete,
}: {
  member: StaffMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={member.name}
              className="w-12 h-12 rounded-full"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-400" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{member.name}</h3>
              {member.mobileReady && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                  <Home className="w-3 h-3" />
                  Mobile Ready
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{member.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <span>{member.email}</span>
        </div>
        {member.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            <span>{member.phone}</span>
          </div>
        )}
      </div>

      {/* Location Assignments */}
      {member.locations && member.locations.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">Assigned Locations:</p>
          <div className="flex flex-wrap gap-1">
            {member.locations.map((loc) => (
              <span
                key={loc.location_id}
                className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                  loc.is_primary
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {loc.location_name || loc.location_city || "Location"}
                {loc.is_primary && " (Primary)"}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {(!member.locations || member.locations.length === 0) && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-gray-500 italic">No location assignments</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            member.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {member.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}

function StaffModal({
  staff,
  onClose,
  onSave,
}: {
  staff: StaffMember | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const { salons } = useProviderPortal();
  const [formData, setFormData] = useState({
    name: staff?.name || "",
    email: staff?.email || "",
    phone: staff?.phone || "",
    role: staff?.role || "staff",
    is_active: staff?.is_active ?? true,
    mobileReady: staff?.mobileReady ?? false,
  });
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    staff?.locations?.map(l => l.location_id) || []
  );
  const [primaryLocationId, setPrimaryLocationId] = useState<string | null>(
    staff?.primary_location_id || null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Update formData when staff changes (for editing)
  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || "",
        email: staff.email || "",
        phone: staff.phone || "",
        role: staff.role || "staff",
        is_active: staff.is_active ?? true,
        mobileReady: staff.mobileReady ?? false,
      });
      setSelectedLocations(staff.locations?.map(l => l.location_id) || []);
      setPrimaryLocationId(staff.primary_location_id || null);
    } else {
      // Reset form for new staff
      setFormData({
        name: "",
        email: "",
        phone: "",
        role: "staff",
        is_active: true,
        mobileReady: false,
      });
      setSelectedLocations([]);
      setPrimaryLocationId(null);
    }
  }, [staff]);

  // Load location assignments when editing
  useEffect(() => {
    if (staff?.id) {
      loadStaffLocations();
    }
  }, [staff?.id]);

  const loadStaffLocations = async () => {
    if (!staff?.id) return;
    try {
      setIsLoadingLocations(true);
      const response = await fetcher.get<{ data: Array<{ location_id: string; is_primary: boolean }> }>(
        `/api/provider/staff/${staff.id}/locations`
      );
      const assignments = response.data || [];
      setSelectedLocations(assignments.map(a => a.location_id));
      const primary = assignments.find(a => a.is_primary);
      setPrimaryLocationId(primary?.location_id || null);
    } catch (error) {
      console.error("Failed to load staff locations:", error);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const handleLocationToggle = (locationId: string) => {
    setSelectedLocations(prev => {
      if (prev.includes(locationId)) {
        // If removing primary location, clear it
        if (primaryLocationId === locationId) {
          setPrimaryLocationId(null);
        }
        return prev.filter(id => id !== locationId);
      } else {
        return [...prev, locationId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);

      // Save staff member first
      if (staff) {
        await fetcher.patch(`/api/provider/staff/${staff.id}`, formData);
      } else {
        const response = await fetcher.post<{ data: { id: string } }>("/api/provider/staff", formData);
        // If new staff, save locations after creation
        if (response.data?.id && selectedLocations.length > 0) {
          await fetcher.put(`/api/provider/staff/${response.data.id}/locations`, {
            location_ids: selectedLocations,
            primary_location_id: primaryLocationId || undefined,
          });
        }
      }

      // Update location assignments for existing staff
      if (staff?.id && selectedLocations.length > 0) {
        await fetcher.put(`/api/provider/staff/${staff.id}/locations`, {
          location_ids: selectedLocations,
          primary_location_id: primaryLocationId || undefined,
        });
      } else if (staff?.id && selectedLocations.length === 0) {
        // Remove all location assignments
        await fetcher.delete(`/api/provider/staff/${staff.id}/locations`);
      }

      toast.success(staff ? "Staff member updated" : "Staff member added");
      onSave();
    } catch {
      toast.error("Failed to save staff member");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {staff ? "Edit Staff Member" : "Add Staff Member"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="mobileReady"
              checked={formData.mobileReady}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, mobileReady: checked === true })
              }
            />
            <Label htmlFor="mobileReady" className="cursor-pointer">
              Mobile Ready (can perform at-home services)
            </Label>
          </div>

          <div>
            <Label htmlFor="role">Role *</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value })
              }
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active (can receive bookings)</Label>
          </div>

          {/* Location Assignments */}
          {salons && salons.length > 0 && (
            <div className="space-y-3 pt-4 border-t">
              <Label>Location Assignments</Label>
              <p className="text-sm text-gray-600">
                Select which locations this staff member can work at. You can assign them to multiple locations.
              </p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {salons.map((location) => (
                  <div key={location.id} className="flex items-start gap-3">
                    <Checkbox
                      id={`location-${location.id}`}
                      checked={selectedLocations.includes(location.id)}
                      onCheckedChange={() => handleLocationToggle(location.id)}
                      disabled={isLoadingLocations}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`location-${location.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {location.name}
                      </Label>
                      {location.city && (
                        <p className="text-xs text-gray-500">{location.city}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Primary Location Selection */}
              {selectedLocations.length > 0 && (
                <div className="pt-3 border-t">
                  <Label className="mb-2 block">Primary Location</Label>
                  <p className="text-sm text-gray-600 mb-2">
                    Select the primary location for this staff member (optional).
                  </p>
                  <RadioGroup
                    value={primaryLocationId || ""}
                    onValueChange={(value) => setPrimaryLocationId(value || null)}
                  >
                    <div className="space-y-2">
                      {selectedLocations.map((locId) => {
                        const location = salons.find(l => l.id === locId);
                        if (!location) return null;
                        return (
                          <div key={locId} className="flex items-center gap-2">
                            <RadioGroupItem value={locId} id={`primary-${locId}`} />
                            <Label htmlFor={`primary-${locId}`} className="cursor-pointer">
                              {location.name}
                              {location.city && ` (${location.city})`}
                            </Label>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="" id="primary-none" />
                        <Label htmlFor="primary-none" className="cursor-pointer text-gray-500">
                          No primary location
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : staff ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
