'use client';

import { ReactNode } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { Skeleton } from '@/components/ui/skeleton';

interface FeatureFlagGuardProps {
  featureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}

/**
 * Component that conditionally renders children based on feature flag status
 * 
 * @example
 * <FeatureFlagGuard featureKey="booking_online">
 *   <OnlineBookingButton />
 * </FeatureFlagGuard>
 */
export default function FeatureFlagGuard({
  featureKey,
  children,
  fallback = null,
  showLoading = false,
}: FeatureFlagGuardProps) {
  const { enabled, loading } = useFeatureFlag(featureKey);

  if (loading && showLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (loading) {
    return null;
  }

  return enabled ? <>{children}</> : <>{fallback}</>;
}
