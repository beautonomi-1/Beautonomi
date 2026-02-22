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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, MapPin } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";

interface CityWaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCity?: string;
}

export default function CityWaitlistModal({
  open,
  onOpenChange,
  defaultCity = "",
}: CityWaitlistModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    city_name: defaultCity,
    name: user?.full_name || "",
    email: user?.email || "",
    phone: "",
    is_building_owner: false,
    building_address: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.city_name.trim()) {
      toast.error("Please enter a city name");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetcher.post<{ data?: { entry?: { message?: string } } }>("/api/public/city-waitlist", formData);
      
      toast.success(response?.data?.entry?.message || "Successfully joined the waitlist!");
      onOpenChange(false);
      
      // Reset form
      setFormData({
        city_name: defaultCity,
        name: user?.full_name || "",
        email: user?.email || "",
        phone: "",
        is_building_owner: false,
        building_address: "",
        notes: "",
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to join waitlist. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Join City Waitlist
          </DialogTitle>
          <DialogDescription>
            We'll notify you when Beautonomi becomes available in your city.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city_name">City Name *</Label>
            <Input
              id="city_name"
              value={formData.city_name}
              onChange={(e) => setFormData({ ...formData, city_name: e.target.value })}
              placeholder="e.g., New York, Los Angeles"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Your Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Your full name"
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_building_owner"
              checked={formData.is_building_owner}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_building_owner: checked === true })
              }
            />
            <Label
              htmlFor="is_building_owner"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I'm a building owner interested in making my property Beautonomi-friendly
            </Label>
          </div>

          {formData.is_building_owner && (
            <div className="space-y-2">
              <Label htmlFor="building_address">Building Address</Label>
              <Input
                id="building_address"
                value={formData.building_address}
                onChange={(e) => setFormData({ ...formData, building_address: e.target.value })}
                placeholder="Street address, City, State"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Tell us more about your interest..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
              disabled={isSubmitting || !formData.city_name.trim() || !formData.name.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  Join Waitlist
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
