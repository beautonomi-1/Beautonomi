"use client";

import React, { useState, useEffect } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TeamMember, ServiceItem } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { format } from "date-fns";
import { 
  Calendar, 
  Clock, 
  Search, 
  X, 
  Plus,
  ChevronRight,
  Loader2
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

interface QuickBookingPopoverProps {
  trigger: React.ReactNode;
  selectedDate: Date;
  selectedTime: string;
  selectedTeamMemberId: string;
  teamMembers: TeamMember[];
  onSuccess?: () => void;
  onOpenFullDialog?: () => void;
}

export function QuickBookingPopover({
  trigger,
  selectedDate,
  selectedTime,
  selectedTeamMemberId,
  teamMembers,
  onSuccess,
  onOpenFullDialog,
}: QuickBookingPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  const [formData, setFormData] = useState({
    client_name: "",
    team_member_id: selectedTeamMemberId,
    service_id: "",
    scheduled_time: selectedTime,
  });

  // Load services when popover opens
  useEffect(() => {
    if (open) {
      loadServices();
      setFormData({
        client_name: "",
        team_member_id: selectedTeamMemberId,
        service_id: "",
        scheduled_time: selectedTime,
      });
      setSelectedClient(null);
      setClientSearchQuery("");
    }
  }, [open, selectedTeamMemberId, selectedTime]);

  // Search clients
  useEffect(() => {
    const searchClients = async () => {
      if (clientSearchQuery.length >= 2) {
        try {
          const response = await fetch(`/api/provider/clients?search=${encodeURIComponent(clientSearchQuery)}`);
          if (response.ok) {
            const data = await response.json();
            setClientSearchResults(data.data || []);
          }
        } catch (error) {
          console.error("Error searching clients:", error);
        }
      } else {
        setClientSearchResults([]);
      }
    };

    const timer = setTimeout(searchClients, 300);
    return () => clearTimeout(timer);
  }, [clientSearchQuery]);

  const loadServices = async () => {
    try {
      const categories = await providerApi.listServiceCategories();
      const allServices = categories.flatMap((cat) => cat.services);
      setServices(allServices);
    } catch (error) {
      console.error("Failed to load services:", error);
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setFormData({
      ...formData,
      client_name: `${client.first_name} ${client.last_name}`,
    });
    setClientSearchQuery("");
    setClientSearchResults([]);
  };

  const handleQuickBook = async () => {
    if (!formData.service_id || !formData.team_member_id) {
      return;
    }

    setIsLoading(true);
    try {
      const selectedService = services.find((s) => s.id === formData.service_id);
      const selectedMember = teamMembers.find((m) => m.id === formData.team_member_id);

      await providerApi.createAppointment({
        client_name: formData.client_name || "Walk-in",
        team_member_id: formData.team_member_id,
        team_member_name: selectedMember?.name || "",
        service_id: formData.service_id,
        service_name: selectedService?.name || "",
        scheduled_date: format(selectedDate, "yyyy-MM-dd"),
        scheduled_time: formData.scheduled_time,
        duration_minutes: selectedService?.duration_minutes || 60,
        price: selectedService?.price || 0,
        status: "booked",
      });

      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to create appointment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedService = services.find((s) => s.id === formData.service_id);
  const _selectedMember = teamMembers.find((m) => m.id === formData.team_member_id);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0 shadow-xl" 
        align="start"
        side="right"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b bg-gradient-to-r from-[#1a1f3c] to-[#252a4a] text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Quick Book</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-white/80">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{format(selectedDate, "EEE, MMM d")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{selectedTime}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Client Search */}
          <div>
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Client
            </Label>
            {selectedClient ? (
              <div className="mt-1.5 flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs font-medium">
                      {selectedClient.first_name.charAt(0)}{selectedClient.last_name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {selectedClient.first_name} {selectedClient.last_name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setSelectedClient(null);
                    setFormData({ ...formData, client_name: "" });
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="mt-1.5 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search or type name..."
                  value={clientSearchQuery || formData.client_name}
                  onChange={(e) => {
                    setClientSearchQuery(e.target.value);
                    setFormData({ ...formData, client_name: e.target.value });
                  }}
                  className="pl-9 h-10"
                />
                {clientSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {clientSearchResults.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className="w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => handleSelectClient(client)}
                      >
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-[10px] font-medium">
                            {client.first_name.charAt(0)}{client.last_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {client.first_name} {client.last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {client.email || client.phone}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Service Selection */}
          <div>
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Service
            </Label>
            <Select
              value={formData.service_id}
              onValueChange={(value) => setFormData({ ...formData, service_id: value })}
            >
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{service.name}</span>
                      <span className="text-xs text-gray-500">
                        {service.duration_minutes}min · R{service.price}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Staff Member */}
          <div>
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              With
            </Label>
            <Select
              value={formData.team_member_id}
              onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
            >
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue placeholder="Select staff" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="bg-[#1a1f3c] text-white text-[10px]">
                          {member.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{member.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary */}
          {selectedService && (
            <div className="p-3 bg-[#FF0077]/5 border border-[#FF0077]/10 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Duration</span>
                <span className="font-medium">{selectedService.duration_minutes} min</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-gray-600">Price</span>
                <span className="font-bold text-[#FF0077]">R{selectedService.price.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              setOpen(false);
              onOpenFullDialog?.();
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            More Options
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
            onClick={handleQuickBook}
            disabled={isLoading || !formData.service_id}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-1.5" />
            )}
            Book
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
