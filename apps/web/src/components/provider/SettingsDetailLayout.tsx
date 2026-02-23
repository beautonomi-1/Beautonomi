"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Breadcrumb, { BreadcrumbItem } from "@/components/ui/breadcrumb";

export interface SettingsDetailLayoutProps {
  title?: string;
  subtitle?: string;
  description?: string;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  isSaving?: boolean; // For backward compatibility
  backHref?: string;
  breadcrumbs?: BreadcrumbItem[];
  showCloseButton?: boolean;
}

export function SettingsDetailLayout({
  title,
  subtitle,
  description,
  children,
  onSave,
  saveLabel = "Save Changes",
  saveDisabled = false,
  isSaving = false, // For backward compatibility
  backHref = "/provider/settings",
  breadcrumbs,
  showCloseButton = true,
}: SettingsDetailLayoutProps) {
  const effectiveSubtitle = subtitle ?? description;
  // Use isSaving if provided, otherwise use saveDisabled
  const disabled = isSaving || saveDisabled;
  const label = isSaving ? "Saving..." : saveLabel;
  const searchParams = useSearchParams();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  // Check for returnTo query parameter
  useEffect(() => {
    const returnTo = searchParams.get("returnTo");
    if (returnTo) {
      try {
        const decoded = decodeURIComponent(returnTo);
        queueMicrotask(() => setReturnUrl(decoded));
      } catch (e) {
        console.error("Invalid returnTo parameter:", e);
      }
    }
  }, [searchParams]);

  // Use returnUrl if available, otherwise use backHref
  const finalBackHref = returnUrl || backHref;

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Breadcrumbs */}
      {breadcrumbs && (
        <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
        <div className="flex-1 w-full min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 mb-2 min-w-0">
            {showCloseButton && (
              <Link
                href={finalBackHref}
                className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              {title && <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-900 truncate">{title}</h1>}
              {effectiveSubtitle && <p className="text-xs sm:text-sm text-gray-600 mt-1 break-words">{effectiveSubtitle}</p>}
            </div>
          </div>
        </div>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={disabled}
            className="bg-[#FF0077] hover:bg-[#D60565] text-white w-full sm:w-auto flex-shrink-0 min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {label}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">{children}</div>
    </div>
  );
}
