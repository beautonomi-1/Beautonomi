'use client';

import { Badge } from '@/components/ui/badge';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle } from 'lucide-react';

interface FeatureStatusBadgeProps {
  featureKey: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Component that displays the status of a feature flag as a badge
 * 
 * @example
 * <FeatureStatusBadge featureKey="booking_online" showLabel />
 */
export default function FeatureStatusBadge({
  featureKey,
  showLabel = false,
  size = 'md',
}: FeatureStatusBadgeProps) {
  const { enabled, loading } = useFeatureFlag(featureKey);

  if (loading) {
    return (
      <Skeleton className={`${
        size === 'sm' ? 'h-5 w-16' : size === 'md' ? 'h-6 w-20' : 'h-7 w-24'
      }`} />
    );
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge
      variant={enabled ? 'default' : 'secondary'}
      className={`${sizeClasses[size]} flex items-center gap-1.5`}
    >
      {enabled ? (
        <CheckCircle2 className={`${size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
      ) : (
        <XCircle className={`${size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
      )}
      {showLabel && (
        <span>{enabled ? 'Enabled' : 'Disabled'}</span>
      )}
    </Badge>
  );
}
