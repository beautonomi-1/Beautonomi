"use client";

import React from "react";
import { cn } from "@/lib/utils";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, FolderOpen, LucideIcon } from "lucide-react";

interface ProviderEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/** Premium empty state mirroring the provider mobile app's EmptyState:
 *  a centered rounded-2xl gray-100 icon chip, 18px/600 title, calm body copy. */
export function ProviderEmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  className,
}: ProviderEmptyStateProps) {
  return (
    <div
      className={cn(
        "provider-card flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Icon className="h-7 w-7 text-gray-400" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="provider-btn-brand mt-6 px-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface ProviderLoadingStateProps {
  message?: string;
  className?: string;
}

export function ProviderLoadingState({ message = "Loading…", className }: ProviderLoadingStateProps) {
  return (
    <div
      className={cn(
        "provider-card provider-card-padding flex flex-col items-center justify-center py-12 gap-3",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

interface ProviderErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ProviderErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: ProviderErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn("rounded-2xl border-red-200 bg-red-50", className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-1">{message}</AlertDescription>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-3 min-h-[44px] touch-manipulation"
        >
          Try again
        </Button>
      )}
    </Alert>
  );
}

interface ProviderSuccessStateProps {
  title: string;
  message?: string;
  className?: string;
}

export function ProviderSuccessState({ title, message, className }: ProviderSuccessStateProps) {
  return (
    <Alert className={cn("rounded-2xl border-green-200 bg-green-50 text-green-900", className)}>
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle>{title}</AlertTitle>
      {message && <AlertDescription className="mt-1 text-green-700">{message}</AlertDescription>}
    </Alert>
  );
}

/** Re-export loading timeout for long-running provider fetches */
export { LoadingTimeout as ProviderLoadingTimeout };
