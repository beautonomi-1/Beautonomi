"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface SegmentCriteria {
  min_bookings?: number;
  max_bookings?: number;
  min_spent?: number;
  max_spent?: number;
  last_booking_days?: number;
  tags?: string[];
  is_favorite?: boolean;
}

interface SegmentBuilderProps {
  criteria: SegmentCriteria;
  onCriteriaChange: (criteria: SegmentCriteria) => void;
  availableTags?: string[];
}

export default function SegmentBuilder({ criteria, onCriteriaChange, availableTags: _availableTags = [] }: SegmentBuilderProps) {
  const updateCriteria = (key: keyof SegmentCriteria, value: any) => {
    onCriteriaChange({ ...criteria, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-2 block">Booking Criteria</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_bookings" className="text-xs text-gray-500">Min Bookings</Label>
            <Input
              id="min_bookings"
              type="number"
              min="0"
              value={criteria.min_bookings || ""}
              onChange={(e) => updateCriteria("min_bookings", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="max_bookings" className="text-xs text-gray-500">Max Bookings</Label>
            <Input
              id="max_bookings"
              type="number"
              min="0"
              value={criteria.max_bookings || ""}
              onChange={(e) => updateCriteria("max_bookings", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Unlimited"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Spending Criteria</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_spent" className="text-xs text-gray-500">Min Spent ($)</Label>
            <Input
              id="min_spent"
              type="number"
              min="0"
              step="0.01"
              value={criteria.min_spent || ""}
              onChange={(e) => updateCriteria("min_spent", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="max_spent" className="text-xs text-gray-500">Max Spent ($)</Label>
            <Input
              id="max_spent"
              type="number"
              min="0"
              step="0.01"
              value={criteria.max_spent || ""}
              onChange={(e) => updateCriteria("max_spent", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Unlimited"
            />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="last_booking_days" className="text-sm font-medium mb-2 block">Last Booking</Label>
        <Select
          value={criteria.last_booking_days?.toString() || ""}
          onValueChange={(value) => updateCriteria("last_booking_days", value ? parseInt(value) : undefined)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Client Status</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_favorite"
            checked={criteria.is_favorite === true}
            onCheckedChange={(checked) => updateCriteria("is_favorite", checked ? true : undefined)}
          />
          <Label htmlFor="is_favorite" className="text-sm font-normal cursor-pointer">
            Only favorite clients
          </Label>
        </div>
      </div>

      {/* Tags filtering: hidden until implemented. availableTags prop reserved for future use. */}
    </div>
  );
}
