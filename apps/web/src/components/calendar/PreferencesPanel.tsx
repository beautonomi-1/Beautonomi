"use client";

import React from "react";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Settings2,
  Contrast,
  Eye,
  EyeOff,
  Clock,
  Palette,
  Grid3X3,
  Tag,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@beautonomi/i18n";

interface PreferencesPanelProps {
  className?: string;
  variant?: "button" | "icon";
  align?: "start" | "center" | "end";
}

/**
 * Calendar preferences popover panel
 * Provides quick access to visual preferences like high contrast mode,
 * show/hide canceled appointments, color scheme, etc.
 */
export function PreferencesPanel({
  className,
  variant = "icon",
  align = "end",
}: PreferencesPanelProps) {
  const {
    preferences,
    isLoaded,
    toggleHighContrastMode,
    toggleShowCanceledAppointments,
    toggleCompactMode,
    toggleShowIcons,
    updatePreference,
  } = useCalendarPreferences();
  const { t } = useTranslation();

  if (!isLoaded) {
    return null;
  }

  const triggerContent = variant === "button" ? (
    <Button variant="ghost" size="sm" className={cn("gap-2", className)}>
      <Settings2 className="w-4 h-4" />
      <span className="hidden md:inline">{t("web.calendar.preferencesPanel.preferences")}</span>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9", className)}
      aria-label={t("web.calendar.preferencesPanel.preferences")}
    >
      <Settings2 className="w-4 h-4" />
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">{t("web.calendar.preferencesPanel.title")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("web.calendar.preferencesPanel.subtitle")}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Display Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("web.calendar.preferencesPanel.display")}
            </h4>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Contrast className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="high-contrast" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.highContrast")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.highContrastHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="high-contrast"
                checked={preferences.highContrast}
                onCheckedChange={toggleHighContrastMode}
              />
            </div>

            {/* Show Canceled */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {preferences.showCanceled ? (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="show-canceled" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.showCanceled")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.showCanceledHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="show-canceled"
                checked={preferences.showCanceled}
                onCheckedChange={toggleShowCanceledAppointments}
              />
            </div>

            {/* Compact Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="compact-mode" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.compactMode")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.compactModeHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="compact-mode"
                checked={preferences.compactMode}
                onCheckedChange={toggleCompactMode}
              />
            </div>

            {/* Show Icons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="show-icons" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.showIcons")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.showIconsHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="show-icons"
                checked={preferences.showAppointmentIcons}
                onCheckedChange={toggleShowIcons}
              />
            </div>

            {/* Show Prices (Mangomint/Fresha style) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="show-prices" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.showPrices")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.showPricesHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="show-prices"
                checked={preferences.showPrices}
                onCheckedChange={(checked) => updatePreference("showPrices", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="notify-drag" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.notifyOnDrag")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.notifyOnDragHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="notify-drag"
                checked={preferences.notifyCustomerOnDrag !== false}
                onCheckedChange={(checked) => updatePreference("notifyCustomerOnDrag", checked)}
              />
            </div>
          </div>

          <Separator />

          {/* Color Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("web.calendar.preferencesPanel.colors")}
            </h4>

            {/* Color By */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-normal">{t("web.calendar.preferencesPanel.colorBy")}</Label>
              </div>
              <Select
                value={preferences.colorBy}
                onValueChange={(value: "status" | "service" | "team_member") =>
                  updatePreference("colorBy", value)
                }
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">{t("web.calendar.preferencesPanel.status")}</SelectItem>
                  <SelectItem value="service">{t("web.calendar.preferencesPanel.service")}</SelectItem>
                  <SelectItem value="team_member">{t("web.calendar.preferencesPanel.staff")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Time Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("web.calendar.preferencesPanel.timeGrid")}
            </h4>

            {/* Time Increment */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-normal">{t("web.calendar.preferencesPanel.timeSlots")}</Label>
              </div>
              <Select
                value={preferences.timeIncrementMinutes.toString()}
                onValueChange={(value) =>
                  updatePreference("timeIncrementMinutes", parseInt(value) as 5 | 10 | 15)
                }
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">{t("web.calendar.preferencesPanel.minutes", { count: 5 })}</SelectItem>
                  <SelectItem value="10">{t("web.calendar.preferencesPanel.minutes", { count: 10 })}</SelectItem>
                  <SelectItem value="15">{t("web.calendar.preferencesPanel.minutes", { count: 15 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scroll to Now */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="scroll-to-now" className="text-sm font-normal cursor-pointer">
                    {t("web.calendar.preferencesPanel.scrollToNow")}
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {t("web.calendar.preferencesPanel.scrollToNowHint")}
                  </p>
                </div>
              </div>
              <Switch
                id="scroll-to-now"
                checked={preferences.scrollToNow}
                onCheckedChange={(checked) => updatePreference("scrollToNow", checked)}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/30">
          <Button
            variant="link"
            size="sm"
            className="text-xs text-muted-foreground p-0 h-auto"
            onClick={() => window.location.href = "/provider/settings/calendar/display-preferences"}
          >
            {t("web.calendar.preferencesPanel.moreSettings")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default PreferencesPanel;
