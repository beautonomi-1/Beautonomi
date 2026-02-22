import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { fetcher } from '@/lib/http/fetcher';

interface UsageData {
  feature_type: string;
  current_usage: number;
  limit_value: number | null;
  percentage_used: number;
  is_unlimited: boolean;
  can_use: boolean;
  warning_threshold: boolean;
}

export function useSubscriptionLimits() {
  const { user } = useAuth();
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsage = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: UsageData[] }>(
          '/api/provider/usage-summary'
        );
        setUsageData(response.data || []);
      } catch (err: any) {
        console.error('Error loading usage summary:', err);
        setError(err.message || 'Failed to load usage data');
        setUsageData([]);
      } finally {
        setLoading(false);
      }
    };

    loadUsage();
    // Refresh every 5 minutes
    const interval = setInterval(loadUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const getUsageForFeature = (featureType: string): UsageData | null => {
    return usageData.find((u) => u.feature_type === featureType) || null;
  };

  const canUseFeature = (featureType: string): boolean => {
    const usage = getUsageForFeature(featureType);
    if (!usage) return true; // If no limit data, allow
    return usage.can_use;
  };

  const isNearLimit = (featureType: string): boolean => {
    const usage = getUsageForFeature(featureType);
    if (!usage) return false;
    return usage.warning_threshold && usage.percentage_used < 100;
  };

  const isAtLimit = (featureType: string): boolean => {
    const usage = getUsageForFeature(featureType);
    if (!usage) return false;
    return !usage.can_use;
  };

  return {
    usageData,
    loading,
    error,
    getUsageForFeature,
    canUseFeature,
    isNearLimit,
    isAtLimit,
    refresh: async () => {
      if (!user) return;
      try {
        setLoading(true);
        const response = await fetcher.get<{ data: UsageData[] }>(
          '/api/provider/usage-summary'
        );
        setUsageData(response.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to refresh usage data');
      } finally {
        setLoading(false);
      }
    },
  };
}
