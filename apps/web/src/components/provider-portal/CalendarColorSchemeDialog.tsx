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
import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarColorScheme, ServiceItem, TeamMember } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";

interface CalendarColorSchemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme?: CalendarColorScheme | null;
  onSuccess?: () => void;
}

export function CalendarColorSchemeDialog({
  open,
  onOpenChange,
  scheme,
  onSuccess,
}: CalendarColorSchemeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [formData, setFormData] = useState({
    name: scheme?.name || "",
    description: scheme?.description || "",
    color: scheme?.color || "#FF0077",
    icon: scheme?.icon || "",
    applies_to: scheme?.applies_to || "service",
    service_id: scheme?.service_id || "",
    status: scheme?.status || "",
    team_member_id: scheme?.team_member_id || "",
    is_default: scheme?.is_default || false,
  });

  useEffect(() => {
    if (open) {
      loadData();
      if (scheme) {
        setFormData({
          name: scheme.name,
          description: scheme.description || "",
          color: scheme.color,
          icon: scheme.icon || "",
          applies_to: scheme.applies_to,
          service_id: scheme.service_id || "",
          status: scheme.status || "",
          team_member_id: scheme.team_member_id || "",
          is_default: scheme.is_default,
        });
      } else {
        setFormData({
          name: "",
          description: "",
          color: "#FF0077",
          icon: "",
          applies_to: "service",
          service_id: "",
          status: "",
          team_member_id: "",
          is_default: false,
        });
      }
    }
  }, [open, scheme]);

  const loadData = async () => {
    try {
      const [categories, members] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
      ]);
      setServices(categories.flatMap((cat) => cat.services));
      setTeamMembers(members);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const schemeData: Partial<CalendarColorScheme> = {
        name: formData.name,
        description: formData.description || undefined,
        color: formData.color,
        icon: formData.icon || undefined,
        applies_to: formData.applies_to as any,
        service_id: formData.applies_to === "service" ? formData.service_id || undefined : undefined,
        status: formData.applies_to === "status" ? (formData.status as any) : undefined,
        team_member_id: formData.applies_to === "team_member" ? formData.team_member_id || undefined : undefined,
        is_default: formData.is_default,
      };

      if (scheme) {
        await providerApi.updateCalendarColorScheme(scheme.id, schemeData);
        toast.success("Color scheme updated");
      } else {
        await providerApi.createCalendarColorScheme(schemeData);
        toast.success("Color scheme created");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save color scheme:", error);
      toast.error("Failed to save color scheme");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="px-0 sm:px-0">
          <DialogTitle className="text-base sm:text-lg">
            {scheme ? "Edit Color Scheme" : "New Color Scheme"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-0 sm:px-0">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Hair Services, Completed Appointments"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="color">Color *</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 sm:w-20"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#FF0077"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="icon">Icon (Optional)</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Icon name or URL"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="applies_to">Applies To *</Label>
            <Select
              value={formData.applies_to}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  applies_to: value as any,
                  service_id: "",
                  status: "",
                  team_member_id: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="team_member">Team Member</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.applies_to === "service" && (
            <div>
              <Label htmlFor="service_id">Service</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
              >
                <SelectTrigger>
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
          )}

          {formData.applies_to === "status" && (
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="started">Started</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.applies_to === "team_member" && (
            <div>
              <Label htmlFor="team_member_id">Team Member</Label>
              <Select
                value={formData.team_member_id}
                onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
              >
                <SelectTrigger>
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
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_default: !!checked })
              }
            />
            <Label htmlFor="is_default" className="cursor-pointer">
              Set as default
            </Label>
          </div>

          <DialogFooter className="px-0 sm:px-0 pt-4 sm:pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto"
            >
              {isLoading ? "Saving..." : scheme ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}