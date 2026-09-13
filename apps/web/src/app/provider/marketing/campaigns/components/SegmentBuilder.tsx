"use client";
import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RADIX_SELECT_ANY } from "@/lib/ui/select-radix-sentinels";

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
  const { t } = useTranslation();
  const updateCriteria = (key: keyof SegmentCriteria, value: any) => {
    onCriteriaChange({ ...criteria, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-2 block">{t("web.provider.pages.marketing/segment-builder.bookingCriteria")}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_bookings" className="text-xs text-gray-500">{t("web.provider.pages.marketing/segment-builder.minBookings")}</Label>
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
            <Label htmlFor="max_bookings" className="text-xs text-gray-500">{t("web.provider.pages.marketing/segment-builder.maxBookings")}</Label>
            <Input
              id="max_bookings"
              type="number"
              min="0"
              value={criteria.max_bookings || ""}
              onChange={(e) => updateCriteria("max_bookings", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder={t("web.provider.common.unlimited")}
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">{t("web.provider.pages.marketing/segment-builder.spendingCriteria")}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_spent" className="text-xs text-gray-500">{t("web.provider.pages.marketing/segment-builder.minSpent")}</Label>
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
            <Label htmlFor="max_spent" className="text-xs text-gray-500">{t("web.provider.pages.marketing/segment-builder.maxSpent")}</Label>
            <Input
              id="max_spent"
              type="number"
              min="0"
              step="0.01"
              value={criteria.max_spent || ""}
              onChange={(e) => updateCriteria("max_spent", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder={t("web.provider.common.unlimited")}
            />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="last_booking_days" className="text-sm font-medium mb-2 block">{t("web.provider.pages.marketing/segment-builder.lastBooking")}</Label>
        <Select
          value={
            criteria.last_booking_days != null
              ? String(criteria.last_booking_days)
              : RADIX_SELECT_ANY
          }
          onValueChange={(value) =>
            updateCriteria(
              "last_booking_days",
              value === RADIX_SELECT_ANY ? undefined : parseInt(value, 10)
            )
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t("web.provider.pages.marketing/segment-builder.anyTime")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RADIX_SELECT_ANY}>{t("web.provider.pages.marketing/segment-builder.anyTime")}</SelectItem>
            <SelectItem value="7">{t("web.provider.pages.marketing/segment-builder.last7Days")}</SelectItem>
            <SelectItem value="30">{t("web.provider.pages.marketing/segment-builder.last30Days")}</SelectItem>
            <SelectItem value="60">{t("web.provider.pages.marketing/segment-builder.last60Days")}</SelectItem>
            <SelectItem value="90">{t("web.provider.pages.marketing/segment-builder.last90Days")}</SelectItem>
            <SelectItem value="180">{t("web.provider.pages.marketing/segment-builder.last6Months")}</SelectItem>
            <SelectItem value="365">{t("web.provider.pages.marketing/segment-builder.lastYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">{t("web.provider.pages.marketing/segment-builder.clientStatus")}</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_favorite"
            checked={criteria.is_favorite === true}
            onCheckedChange={(checked) => updateCriteria("is_favorite", checked ? true : undefined)}
          />
          <Label htmlFor="is_favorite" className="text-sm font-normal cursor-pointer">
            {t("web.provider.pages.marketing/segment-builder.onlyFavorites")}
          </Label>
        </div>
      </div>

      {/* Tags filtering: hidden until implemented. availableTags prop reserved for future use. */}
    </div>
  );
}
