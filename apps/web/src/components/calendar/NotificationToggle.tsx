"use client";

import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotificationToggleProps {
  /** Whether notifications should be sent */
  checked: boolean;
  /** Callback when toggle changes */
  onCheckedChange: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Compact mode (no description) */
  compact?: boolean;
}

/**
 * Notification toggle component for appointment actions
 * Used to let users choose whether to notify clients about changes
 */
export function NotificationToggle({
  checked,
  onCheckedChange,
  label = "Notify client",
  description = "Send notification about this change",
  disabled = false,
  className,
  compact = false,
}: NotificationToggleProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-2">
        {checked ? (
          <Bell className="w-4 h-4 text-blue-500" />
        ) : (
          <BellOff className="w-4 h-4 text-gray-400" />
        )}
        <div>
          <Label
            htmlFor="notification-toggle"
            className={cn(
              "text-sm font-normal cursor-pointer",
              disabled && "opacity-50"
            )}
          >
            {label}
          </Label>
          {!compact && (
            <p className="text-[10px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <Switch
        id="notification-toggle"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

interface ResendNotificationButtonProps {
  /** Callback when resend is clicked */
  onClick: () => void;
  /** Whether the button is loading */
  isLoading?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Label text */
  label?: string;
  /** Additional class names */
  className?: string;
  /** Variant style */
  variant?: "default" | "ghost" | "outline";
  /** Size */
  size?: "default" | "sm" | "xs";
}

/**
 * Button to resend a notification to the client
 */
export function ResendNotificationButton({
  onClick,
  isLoading = false,
  disabled = false,
  label = "Resend notification",
  className,
  variant = "ghost",
  size = "sm",
}: ResendNotificationButtonProps) {
  return (
    <Button
      variant={variant}
      size={size === "xs" ? "sm" : size}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "gap-1.5",
        size === "xs" && "h-7 text-xs px-2",
        className
      )}
    >
      <Send className={cn("w-3.5 h-3.5", isLoading && "animate-pulse")} />
      {label}
    </Button>
  );
}

export default NotificationToggle;
