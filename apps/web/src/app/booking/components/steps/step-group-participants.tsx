"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingState } from "../booking-flow";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { fetcher } from "@/lib/http/fetcher";

interface StepGroupParticipantsProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
  maxGroupSize: number;
  availableServices: Array<{
    id: string;
    title: string;
    price: number;
    duration: number;
  }>;
}

export default function StepGroupParticipants({
  bookingState,
  updateBookingState,
  onNext: _onNext,
  providerSlug,
  maxGroupSize: initialMaxGroupSize,
  availableServices,
}: StepGroupParticipantsProps) {
  const [maxGroupSize, setMaxGroupSize] = useState(initialMaxGroupSize);
  const [participants, setParticipants] = useState(
    bookingState.groupParticipants || [
      {
        id: "1",
        name: bookingState.clientInfo?.firstName 
          ? `${bookingState.clientInfo.firstName} ${bookingState.clientInfo.lastName}`.trim()
          : "You",
        email: bookingState.clientInfo?.email || "",
        phone: bookingState.clientInfo?.phone || "",
        serviceIds: bookingState.selectedServices.map(s => s.id),
        notes: "",
      },
    ]
  );
  const [showParticipantDialog, setShowParticipantDialog] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<string | null>(null);
  const [participantForm, setParticipantForm] = useState({
    name: "",
    email: "",
    phone: "",
    serviceIds: [] as string[],
    notes: "",
  });

  useEffect(() => {
    updateBookingState({ groupParticipants: participants });
  }, [participants]);

  useEffect(() => {
    // Fetch max group size from provider settings
    const loadGroupBookingSettings = async () => {
      if (!providerSlug) return;
      try {
        const response = await fetcher.get<{
          data: { maxGroupSize: number };
        }>(`/api/public/providers/${encodeURIComponent(providerSlug)}/group-booking-settings`);
        if (response.data?.maxGroupSize) {
          setMaxGroupSize(response.data.maxGroupSize);
        }
      } catch (error) {
        // Use default if API fails
        console.error("Failed to load group booking settings:", error);
      }
    };
    loadGroupBookingSettings();
  }, [providerSlug]);

  const handleAddParticipant = () => {
    if (participants.length >= maxGroupSize) {
      return;
    }
    setEditingParticipant(null);
    setParticipantForm({
      name: "",
      email: "",
      phone: "",
      serviceIds: [],
      notes: "",
    });
    setShowParticipantDialog(true);
  };

  const handleEditParticipant = (participantId: string) => {
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return;
    
    setEditingParticipant(participantId);
    setParticipantForm({
      name: participant.name,
      email: participant.email || "",
      phone: participant.phone || "",
      serviceIds: participant.serviceIds,
      notes: participant.notes || "",
    });
    setShowParticipantDialog(true);
  };

  const handleSaveParticipant = () => {
    if (!participantForm.name.trim()) {
      return;
    }

    if (editingParticipant) {
      setParticipants(prev =>
        prev.map(p =>
          p.id === editingParticipant
            ? { ...p, ...participantForm }
            : p
        )
      );
    } else {
      const newParticipant = {
        id: Date.now().toString(),
        ...participantForm,
      };
      setParticipants(prev => [...prev, newParticipant]);
    }

    setShowParticipantDialog(false);
    setEditingParticipant(null);
  };

  const handleRemoveParticipant = (participantId: string) => {
    if (participants.length === 1) {
      return; // Can't remove the last participant
    }
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const toggleServiceForParticipant = (participantId: string, serviceId: string) => {
    setParticipants(prev =>
      prev.map(p => {
        if (p.id === participantId) {
          const serviceIds = p.serviceIds.includes(serviceId)
            ? p.serviceIds.filter(id => id !== serviceId)
            : [...p.serviceIds, serviceId];
          return { ...p, serviceIds };
        }
        return p;
      })
    );
  };

  const calculateTotal = () => {
    return participants.reduce((total, participant) => {
      const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
        const service = availableServices.find(s => s.id === serviceId);
        return sum + (service?.price || 0);
      }, 0);
      return total + participantTotal;
    }, 0);
  };

  const currency = bookingState.selectedServices[0]?.currency || "ZAR";

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Add Participants
        </h2>
        <p className="text-gray-600">
          Add people to your group booking ({participants.length}/{maxGroupSize})
        </p>
      </div>

      {/* Participants List */}
      <div className="space-y-3">
        {participants.map((participant) => {
          const participantServices = participant.serviceIds
            .map(id => availableServices.find(s => s.id === id))
            .filter(Boolean) as typeof availableServices;
          const participantTotal = participantServices.reduce((sum, s) => sum + s.price, 0);

          return (
            <motion.div
              key={participant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 border border-gray-200 rounded-lg bg-white"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-pink-50 rounded-lg">
                    <User className="w-5 h-5 text-[#FF0077]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{participant.name}</h3>
                    {participant.email && (
                      <p className="text-sm text-gray-600">{participant.email}</p>
                    )}
                    {participant.phone && (
                      <p className="text-sm text-gray-600">{participant.phone}</p>
                    )}
                  </div>
                </div>
                {participants.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveParticipant(participant.id)}
                    className="text-red-600 hover:text-red-700 touch-target"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Services for this participant */}
              <div className="mt-3">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">
                  Services for {participant.name}
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleServiceForParticipant(participant.id, service.id)}
                      className={`p-3 border-2 rounded-lg text-left transition-all touch-target ${
                        participant.serviceIds.includes(service.id)
                          ? "border-[#FF0077] bg-pink-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">{service.title}</p>
                          <p className="text-xs text-gray-600">
                            {formatCurrency(service.price, currency)}
                          </p>
                        </div>
                        {participant.serviceIds.includes(service.id) && (
                          <div className="w-5 h-5 rounded-full bg-[#FF0077] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {participantServices.length > 0 && (
                  <p className="text-sm text-gray-600 mt-2">
                    {participantServices.length} service(s) • {formatCurrency(participantTotal, currency)}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditParticipant(participant.id)}
                className="w-full mt-3 touch-target"
              >
                Edit Details
              </Button>
            </motion.div>
          );
        })}
      </div>

      {/* Add Participant Button */}
      {participants.length < maxGroupSize && (
        <Button
          onClick={handleAddParticipant}
          variant="outline"
          className="w-full touch-target"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Participant
        </Button>
      )}

      {/* Summary */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900">Total</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#FF0077]">
              {formatCurrency(calculateTotal(), currency)}
            </p>
            <p className="text-sm text-gray-600">
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Participant Dialog */}
      <Dialog open={showParticipantDialog} onOpenChange={setShowParticipantDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingParticipant ? "Edit Participant" : "Add Participant"}
            </DialogTitle>
            <DialogDescription>
              Enter participant information for the group booking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="participant-name">Name *</Label>
              <Input
                id="participant-name"
                value={participantForm.name}
                onChange={(e) =>
                  setParticipantForm({ ...participantForm, name: e.target.value })
                }
                placeholder="Participant name"
                required
                className="touch-target"
              />
            </div>

            <div>
              <Label htmlFor="participant-email">Email (Optional)</Label>
              <Input
                id="participant-email"
                type="email"
                value={participantForm.email}
                onChange={(e) =>
                  setParticipantForm({ ...participantForm, email: e.target.value })
                }
                placeholder="participant@example.com"
                className="touch-target"
              />
            </div>

            <div>
              <Label htmlFor="participant-phone">Phone (Optional)</Label>
              <Input
                id="participant-phone"
                type="tel"
                value={participantForm.phone}
                onChange={(e) =>
                  setParticipantForm({ ...participantForm, phone: e.target.value })
                }
                placeholder="+27 11 123 4567"
                className="touch-target"
              />
            </div>

            <div>
              <Label htmlFor="participant-notes">Special Notes (Optional)</Label>
              <Textarea
                id="participant-notes"
                value={participantForm.notes}
                onChange={(e) =>
                  setParticipantForm({ ...participantForm, notes: e.target.value })
                }
                placeholder="Any special requirements or notes..."
                rows={3}
                className="touch-target"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowParticipantDialog(false)}
                className="touch-target"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveParticipant}
                disabled={!participantForm.name.trim()}
                className="touch-target"
              >
                {editingParticipant ? "Update" : "Add"} Participant
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
