"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, User, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface GroupGuest {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  services: string[];
  notes?: string;
}

interface GroupAppointmentBookingProps {
  onGuestsChange: (guests: GroupGuest[]) => void;
  availableServices: Array<{ id: string; name: string; duration: number; price: number }>;
  maxGuests?: number;
}

export default function GroupAppointmentBooking({
  onGuestsChange,
  availableServices,
  maxGuests = 10,
}: GroupAppointmentBookingProps) {
  const [guests, setGuests] = useState<GroupGuest[]>([
    {
      id: "1",
      name: "You",
      services: [],
    },
  ]);
  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GroupGuest | null>(null);
  const [guestForm, setGuestForm] = useState<Omit<GroupGuest, "id">>({
    name: "",
    email: "",
    phone: "",
    services: [],
    notes: "",
  });

  const handleAddGuest = () => {
    if (guests.length >= maxGuests) {
      alert(`Maximum ${maxGuests} guests allowed per group booking`);
      return;
    }
    setEditingGuest(null);
    setGuestForm({
      name: "",
      email: "",
      phone: "",
      services: [],
      notes: "",
    });
    setShowGuestDialog(true);
  };

  const handleEditGuest = (guest: GroupGuest) => {
    setEditingGuest(guest);
    setGuestForm({
      name: guest.name,
      email: guest.email || "",
      phone: guest.phone || "",
      services: guest.services,
      notes: guest.notes || "",
    });
    setShowGuestDialog(true);
  };

  const handleSaveGuest = () => {
    if (!guestForm.name.trim()) {
      alert("Please enter a name for the guest");
      return;
    }

    if (editingGuest) {
      const updated = guests.map((g) =>
        g.id === editingGuest.id
          ? { ...g, ...guestForm, id: editingGuest.id }
          : g
      );
      setGuests(updated);
      onGuestsChange(updated);
    } else {
      const newGuest: GroupGuest = {
        id: Date.now().toString(),
        ...guestForm,
      };
      const updated = [...guests, newGuest];
      setGuests(updated);
      onGuestsChange(updated);
    }

    setShowGuestDialog(false);
    setEditingGuest(null);
  };

  const handleRemoveGuest = (id: string) => {
    if (guests.length === 1) {
      alert("At least one guest is required");
      return;
    }
    const updated = guests.filter((g) => g.id !== id);
    setGuests(updated);
    onGuestsChange(updated);
  };

  const toggleServiceForGuest = (guestId: string, serviceId: string) => {
    const updated = guests.map((guest) => {
      if (guest.id === guestId) {
        const services = guest.services.includes(serviceId)
          ? guest.services.filter((s) => s !== serviceId)
          : [...guest.services, serviceId];
        return { ...guest, services };
      }
      return guest;
    });
    setGuests(updated);
    onGuestsChange(updated);
  };

  const totalServices = guests.reduce(
    (sum, guest) => sum + guest.services.length,
    0
  );
  const totalPrice = guests.reduce((sum, guest) => {
    const guestPrice = guest.services.reduce((serviceSum, serviceId) => {
      const service = availableServices.find((s) => s.id === serviceId);
      return serviceSum + (service?.price || 0);
    }, 0);
    return sum + guestPrice;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Group Appointment</h2>
          <p className="text-sm text-gray-600">
            Add multiple guests for this booking
          </p>
        </div>
        <Button
          onClick={handleAddGuest}
          disabled={guests.length >= maxGuests}
          variant="outline"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Guest
        </Button>
      </div>

      <div className="space-y-3">
        {guests.map((guest) => (
          <Card key={guest.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {guest.name}
                </CardTitle>
                {guest.id !== "1" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveGuest(guest.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {guest.email && <span>{guest.email}</span>}
                {guest.phone && <span>• {guest.phone}</span>}
              </div>

              <div>
                <Label className="text-sm">Services for {guest.name}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {availableServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleServiceForGuest(guest.id, service.id)}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        guest.services.includes(service.id)
                          ? "border-[#FF0077] bg-pink-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{service.name}</p>
                          <p className="text-xs text-gray-600">
                            {service.duration} min • ZAR {service.price}
                          </p>
                        </div>
                        {guest.services.includes(service.id) && (
                          <div className="w-5 h-5 rounded-full bg-[#FF0077] flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {guest.services.length > 0 && (
                <div className="text-sm text-gray-600">
                  {guest.services.length} service
                  {guest.services.length !== 1 ? "s" : ""} selected
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditGuest(guest)}
                className="w-full"
              >
                Edit Guest Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Guests</p>
              <p className="text-xl font-semibold">{guests.length}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Services</p>
              <p className="text-xl font-semibold">{totalServices}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Price</p>
              <p className="text-xl font-semibold">ZAR {totalPrice.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guest Dialog */}
      <Dialog open={showGuestDialog} onOpenChange={setShowGuestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGuest ? "Edit Guest" : "Add Guest"}
            </DialogTitle>
            <DialogDescription>
              Enter guest information for the group booking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="guest-name">Name *</Label>
              <Input
                id="guest-name"
                value={guestForm.name}
                onChange={(e) =>
                  setGuestForm({ ...guestForm, name: e.target.value })
                }
                placeholder="Guest name"
                required
              />
            </div>

            <div>
              <Label htmlFor="guest-email">Email (Optional)</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestForm.email}
                onChange={(e) =>
                  setGuestForm({ ...guestForm, email: e.target.value })
                }
                placeholder="guest@example.com"
              />
            </div>

            <div>
              <Label htmlFor="guest-phone">Phone (Optional)</Label>
              <Input
                id="guest-phone"
                type="tel"
                value={guestForm.phone}
                onChange={(e) =>
                  setGuestForm({ ...guestForm, phone: e.target.value })
                }
                placeholder="+27 11 123 4567"
              />
            </div>

            <div>
              <Label htmlFor="guest-notes">Special Notes (Optional)</Label>
              <textarea
                id="guest-notes"
                value={guestForm.notes}
                onChange={(e) =>
                  setGuestForm({ ...guestForm, notes: e.target.value })
                }
                placeholder="Any special requirements or notes..."
                className="w-full p-2 border rounded-md"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowGuestDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveGuest}>
                {editingGuest ? "Update" : "Add"} Guest
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
