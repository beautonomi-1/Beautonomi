import React from "react";
import type { EmptyStateProps } from "../types";
import { Button } from "./Button";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {icon ? <div className="mb-4">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-xs text-sm text-gray-500 leading-relaxed">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button variant="primary" size="md" onPress={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
