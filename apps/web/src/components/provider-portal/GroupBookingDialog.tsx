"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, X, User, Home, Building2, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { GroupBooking, GroupBookingParticipant, TeamMember, ServiceItem, Appointment } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

interface GroupBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: GroupBooking | null;
  onSuccess?: () => void;
  defaultDate?: Date;
  defaultTime?: string;
  defaultTeamMemberId?: string;
  existingAppointments?: Appointment[]; // For creating from existing appointments
}

export function GroupBookingDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
  defaultDate,
  defaultTime,
  defaultTeamMemberId,
  existingAppointments = [],
}: GroupBookingDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [participants, setParticipants] = useState<Partial<GroupBookingParticipant>[]>([]);
  const [providerLocations, setProviderLocations] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    scheduled_date: booking?.scheduled_date || (defaultDate ? format(defaultDate, "yyyy-MM-dd") : new Date().toISOString().split("T")[0]),
    scheduled_time: booking?.scheduled_time || defaultTime || "10:00",
    duration_minutes: booking?.duration_minutes || 60,
    team_member_id: booking?.team_member_id || defaultTeamMemberId || "",
    service_id: booking?.service_id || "",
    service_name: booking?.service_name || "",
    notes: booking?.notes || "",
    // Location support
    location_type: "at_salon" as "at_salon" | "at_home",
    location_id: "",
    address_line1: "",
    address_city: "",
    address_postal_code: "",
    travel_fee: 0,
  });

  useEffect(() => {
    if (open) {
      loadData();
      
      // If creating from existing appointments, populate participants
      if (existingAppointments.length > 0 && !booking) {
        const firstAppt = existingAppointments[0];
        setFormData({
          scheduled_date: firstAppt.scheduled_date,
          scheduled_time: firstAppt.scheduled_time,
          duration_minutes: firstAppt.duration_minutes,
          team_member_id: firstAppt.team_member_id,
          service_id: firstAppt.service_id,
          service_name: firstAppt.service_name,
          notes: "",
          location_type: firstAppt.location_type || "at_salon",
          location_id: firstAppt.location_id || "",
          address_line1: firstAppt.address_line1 || "",
          address_city: firstAppt.address_city || "",
          address_postal_code: firstAppt.address_postal_code || "",
          travel_fee: firstAppt.travel_fee || 0,
        });
        
        // Convert appointments to participants
        setParticipants(existingAppointments.map((apt) => ({
          client_name: apt.client_name,
          client_email: apt.client_email,
          client_phone: apt.client_phone,
          service_id: apt.service_id,
          service_name: apt.service_name,
          price: apt.price,
        })));
      } else if (booking) {
        setFormData({
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          duration_minutes: booking.duration_minutes,
          team_member_id: booking.team_member_id,
          service_id: booking.service_id,
          service_name: booking.service_name,
          notes: booking.notes || "",
          location_type: booking.location_type || "at_salon",
          location_id: booking.location_id || "",
          address_line1: booking.address_line1 || "",
          address_city: booking.address_city || "",
          address_postal_code: booking.address_postal_code || "",
          travel_fee: booking.travel_fee || 0,
        });
        setParticipants(booking.participants.map((p) => ({
          client_name: p.client_name,
          client_email: p.client_email,
          client_phone: p.client_phone,
          service_id: p.service_id,
          service_name: p.service_name,
          price: p.price,
        })));
      } else {
        setFormData({
          scheduled_date: new Date().toISOString().split("T")[0],
          scheduled_time: "10:00",
          duration_minutes: 60,
          team_member_id: "",
          service_id: "",
          service_name: "",
          notes: "",
          location_type: "at_salon",
          location_id: "",
          address_line1: "",
          address_city: "",
          address_postal_code: "",
          travel_fee: 0,
        });
        setParticipants([]);
      }
    }
  }, [open, booking]);

  const loadData = async () => {
    try {
      const [categories, members] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
      ]);
      setServices(categories.flatMap((cat) => cat.services));
      setTeamMembers(members);
      
      // Load provider locations
      try {
        const locResponse = await fetch("/api/provider/locations");
        if (locResponse.ok) {
          const locData = await locResponse.json();
          setProviderLocations(locData.data || []);
        }
      } catch (locError) {
        console.error("Failed to load provider locations:", locError);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleAddParticipant = () => {
    setParticipants([
      ...participants,
      {
        client_name: "",
        client_email: "",
        client_phone: "",
        service_id: formData.service_id,
        service_name: formData.service_name,
        price: 0,
      },
    ]);
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const handleParticipantChange = (index: number, field: string, value: any) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "service_id") {
      const service = services.find((s) => s.id === value);
      updated[index].service_name = service?.name || "";
      updated[index].price = service?.price || 0;
    }
    setParticipants(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const bookingData: Partial<GroupBooking> = {
        scheduled_date: formData.scheduled_date,
        scheduled_time: formData.scheduled_time,
        duration_minutes: formData.duration_minutes,
        team_member_id: formData.team_member_id,
        team_member_name: teamMembers.find((m) => m.id === formData.team_member_id)?.name,
        service_id: formData.service_id,
        service_name: formData.service_name,
        total_price: participants.reduce((sum, p) => sum + (p.price || 0), 0) + (formData.travel_fee || 0),
        notes: formData.notes,
        // Location support
        location_type: formData.location_type,
        location_id: formData.location_type === "at_salon" ? formData.location_id : undefined,
        address_line1: formData.location_type === "at_home" ? formData.address_line1 : undefined,
        address_city: formData.location_type === "at_home" ? formData.address_city : undefined,
        address_postal_code: formData.location_type === "at_home" ? formData.address_postal_code : undefined,
        travel_fee: formData.location_type === "at_home" ? formData.travel_fee : 0,
        participants: participants.map((p) => ({
          id: `part-${Date.now()}-${Math.random()}`,
          group_booking_id: "",
          client_name: p.client_name || "",
          client_email: p.client_email,
          client_phone: p.client_phone,
          service_id: p.service_id || formData.service_id,
          service_name: p.service_name || formData.service_name,
          price: p.price || 0,
          checked_in: false,
          checked_out: false,
        })) as GroupBookingParticipant[],
      };

      if (booking) {
        await providerApi.updateGroupBooking(booking.id, bookingData);
        toast.success("Group booking updated");
      } else {
        await providerApi.createGroupBooking(bookingData);
        toast.success("Group booking created");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save group booking:", error);
      toast.error("Failed to save group booking");
    } finally {
      setIsLoading(false);
    }
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        options.push(time);
      }
    }
    return options;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold">
            {booking ? "Edit Group Booking" : existingAppointments.length > 0 ? "Create Group Booking from Appointments" : "New Group Booking"}
          </DialogTitle>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {existingAppointments.length > 0 
              ? `${existingAppointments.length} appointment(s) selected. Add more participants or create the group booking.`
              : "Schedule multiple clients together in one appointment"}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Date and Time - Mobile First */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="scheduled_date" className="text-sm sm:text-base">Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal min-h-[44px] touch-manipulation mt-1.5",
                      !formData.scheduled_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.scheduled_date ? format(new Date(formData.scheduled_date), "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.scheduled_date ? new Date(formData.scheduled_date) : undefined}
                    onSelect={(date) =>
                      date && setFormData({ ...formData, scheduled_date: format(date, "yyyy-MM-dd") })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="scheduled_time" className="text-sm sm:text-base">Time *</Label>
              <Select
                value={formData.scheduled_time}
                onValueChange={(value) => setFormData({ ...formData, scheduled_time: value })}
                required
              >
                <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateTimeOptions().map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Team Member, Service, Duration - Mobile First */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="team_member_id" className="text-sm sm:text-base">Team Member *</Label>
              <Select
                value={formData.team_member_id}
                onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
                required
              >
                <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="service_id" className="text-sm sm:text-base">Service *</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) => {
                  const service = services.find((s) => s.id === value);
                  setFormData({
                    ...formData,
                    service_id: value,
                    service_name: service?.name || "",
                  });
                }}
                required
              >
                <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="duration_minutes" className="text-sm sm:text-base">Duration (min) *</Label>
              <Input
                id="duration_minutes"
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 60 })
                }
                min={15}
                step={15}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
          </div>

          <Separator />

          {/* Location Support */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <h3 className="text-sm sm:text-base font-semibold mb-1">Location</h3>
              <p className="text-xs text-gray-500">Choose where this group booking will take place</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, location_type: "at_salon" })}
                className={cn(
                  "p-4 border-2 rounded-lg text-left transition-all",
                  formData.location_type === "at_salon"
                    ? "border-[#FF0077] bg-[#FF0077]/5"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <Building2 className={cn(
                    "w-5 h-5",
                    formData.location_type === "at_salon" ? "text-[#FF0077]" : "text-gray-400"
                  )} />
                  <div>
                    <div className="font-medium text-sm sm:text-base">At Salon</div>
                    <div className="text-xs text-gray-500">Service at your location</div>
                  </div>
                </div>
              </button>
              
              <button
                type="button"
                onClick={() => setFormData({ ...formData, location_type: "at_home" })}
                className={cn(
                  "p-4 border-2 rounded-lg text-left transition-all",
                  formData.location_type === "at_home"
                    ? "border-[#FF0077] bg-[#FF0077]/5"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <Home className={cn(
                    "w-5 h-5",
                    formData.location_type === "at_home" ? "text-[#FF0077]" : "text-gray-400"
                  )} />
                  <div>
                    <div className="font-medium text-sm sm:text-base">At Home</div>
                    <div className="text-xs text-gray-500">Service at client location</div>
                  </div>
                </div>
              </button>
            </div>

            {formData.location_type === "at_salon" && (
              <div>
                <Label htmlFor="location_id" className="text-sm sm:text-base">Salon Location</Label>
                <Select
                  value={formData.location_id}
                  onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                >
                  <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {providerLocations.length > 0 ? (
                      providerLocations.map((loc: any) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}{loc.address ? ` - ${loc.address}` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="main">Main Location</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.location_type === "at_home" && (
              <div className="space-y-3 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="address_line1" className="text-sm sm:text-base">Address Line 1 *</Label>
                  <Input
                    id="address_line1"
                    value={formData.address_line1}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                    placeholder="Street address"
                    className="mt-1.5 min-h-[44px] touch-manipulation"
                    required={formData.location_type === "at_home"}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="address_city" className="text-sm sm:text-base">City</Label>
                    <Input
                      id="address_city"
                      value={formData.address_city}
                      onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                      placeholder="City"
                      className="mt-1.5 min-h-[44px] touch-manipulation"
                    />
                  </div>
                  <div>
                    <Label htmlFor="address_postal_code" className="text-sm sm:text-base">Postal Code</Label>
                    <Input
                      id="address_postal_code"
                      value={formData.address_postal_code}
                      onChange={(e) => setFormData({ ...formData, address_postal_code: e.target.value })}
                      placeholder="Postal code"
                      className="mt-1.5 min-h-[44px] touch-manipulation"
                    />
                  </div>
                </div>
                {formData.travel_fee > 0 && (
                  <div className="p-2 bg-white rounded border">
                    <div className="text-xs text-gray-600">Travel Fee: R{formData.travel_fee.toFixed(2)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Participants Section - Mobile First */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm sm:text-base font-semibold">Participants</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  {participants.length} participant{participants.length !== 1 ? "s" : ""} added
                </p>
              </div>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleAddParticipant}
                className="min-h-[44px] touch-manipulation"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Add Participant</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
            
            <div className="space-y-2 sm:space-y-3 max-h-[400px] overflow-y-auto border rounded-lg p-3 sm:p-4">
              {participants.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500 mb-2">
                    No participants added yet
                  </p>
                  <p className="text-xs text-gray-400">
                    Click "Add Participant" to add clients to this group booking
                  </p>
                </div>
              ) : (
                participants.map((participant, index) => (
                  <div key={index} className="p-3 sm:p-4 bg-gray-50 rounded-lg border space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-[#FF0077]" />
                        </div>
                        <div>
                          <div className="font-medium text-sm sm:text-base">
                            Participant {index + 1}
                          </div>
                          {participant.client_name && (
                            <div className="text-xs text-gray-500">{participant.client_name}</div>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveParticipant(index)}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0 touch-manipulation"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs sm:text-sm">Client Name *</Label>
                        <Input
                          value={participant.client_name || ""}
                          onChange={(e) =>
                            handleParticipantChange(index, "client_name", e.target.value)
                          }
                          placeholder="Enter client name"
                          required
                          className="mt-1.5 min-h-[44px] touch-manipulation text-sm sm:text-base"
                        />
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Phone</Label>
                        <Input
                          type="tel"
                          value={participant.client_phone || ""}
                          onChange={(e) =>
                            handleParticipantChange(index, "client_phone", e.target.value)
                          }
                          placeholder="+27 82 123 4567"
                          className="mt-1.5 min-h-[44px] touch-manipulation text-sm sm:text-base"
                        />
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Email</Label>
                        <Input
                          type="email"
                          value={participant.client_email || ""}
                          onChange={(e) =>
                            handleParticipantChange(index, "client_email", e.target.value)
                          }
                          placeholder="email@example.com"
                          className="mt-1.5 min-h-[44px] touch-manipulation text-sm sm:text-base"
                        />
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Service</Label>
                        <Select
                          value={participant.service_id || formData.service_id}
                          onValueChange={(value) => handleParticipantChange(index, "service_id", value)}
                        >
                          <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation text-sm sm:text-base">
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Price (R) *</Label>
                        <Input
                          type="number"
                          value={participant.price || 0}
                          onChange={(e) =>
                            handleParticipantChange(index, "price", parseFloat(e.target.value) || 0)
                          }
                          min={0}
                          step={0.01}
                          className="mt-1.5 min-h-[44px] touch-manipulation text-sm sm:text-base"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || participants.length === 0}
              className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {isLoading ? "Saving..." : booking ? "Update Group Booking" : "Create Group Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}