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
              {title && <h1 className="text-2xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight truncate">{title}</h1>}
              {effectiveSubtitle && <p className="text-sm text-gray-500 mt-1.5 break-words">{effectiveSubtitle}</p>}
            </div>
          </div>
        </div>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={disabled}
            className="provider-btn-brand px-5"
          >
            {label}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">{children}</div>

      {/* Mobile sticky save bar — fixed at viewport bottom on small screens */}
      {onSave && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t p-3 md:hidden safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
          <Button
            onClick={onSave}
            disabled={disabled}
            className="provider-btn-brand w-full min-h-[48px] text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}
