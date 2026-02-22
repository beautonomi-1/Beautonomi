"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { format } from "date-fns";

interface AddToWaitlistButtonProps {
  providerId: string;
  serviceId?: string;
  staffId?: string;
  preferredDate?: Date;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function AddToWaitlistButton({
  providerId,
  serviceId,
  staffId,
  preferredDate,
  preferredTimeStart,
  preferredTimeEnd,
  onSuccess,
  variant = "outline",
  size = "default",
  className,
}: AddToWaitlistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    service_id: serviceId || "",
    staff_id: staffId || "",
    preferred_date: preferredDate ? format(preferredDate, "yyyy-MM-dd") : "",
    preferred_time_start: preferredTimeStart || "",
    preferred_time_end: preferredTimeEnd || "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error("Please enter your name");
      return;
    }

    if (!formData.service_id) {
      toast.error("Please select a service");
      return;
    }

    setIsSubmitting(true);
    try {
      await fetcher.post("/api/public/waitlist", {
        provider_id: providerId,
        ...formData,
      });

      toast.success("Added to waitlist! We'll notify you when a spot becomes available.");
      setIsOpen(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        service_id: serviceId || "",
        staff_id: staffId || "",
        preferred_date: preferredDate ? format(preferredDate, "yyyy-MM-dd") : "",
        preferred_time_start: preferredTimeStart || "",
        preferred_time_end: preferredTimeEnd || "",
        notes: "",
      });
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add to waitlist. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <Clock className="w-4 h-4 mr-2" />
        Join Waitlist
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Join Waitlist</DialogTitle>
            <DialogDescription>
              We'll notify you when a spot becomes available for this service.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+27 123 456 789"
                />
              </div>
            </div>

            {!serviceId && (
              <div className="space-y-2">
                <Label htmlFor="service">Service *</Label>
                <Select
                  value={formData.service_id}
                  onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Services will be loaded from API */}
                    <SelectItem value="placeholder">Loading services...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="preferred_date">Preferred Date</Label>
              <Input
                id="preferred_date"
                type="date"
                value={formData.preferred_date}
                onChange={(e) => setFormData({ ...formData, preferred_date: e.target.value })}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preferred_time_start">Preferred Time Start</Label>
                <Input
                  id="preferred_time_start"
                  type="time"
                  value={formData.preferred_time_start}
                  onChange={(e) => setFormData({ ...formData, preferred_time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred_time_end">Preferred Time End</Label>
                <Input
                  id="preferred_time_end"
                  type="time"
                  value={formData.preferred_time_end}
                  onChange={(e) => setFormData({ ...formData, preferred_time_end: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any special requests or notes..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
                disabled={isSubmitting || !formData.name || !formData.service_id}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    Join Waitlist
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
