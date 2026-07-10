"use client";

import { useEffect, useState } from "react";
import {
  paycloudApi,
  type PaycloudReadinessBlocker,
  type PaycloudReadinessWarning,
  type PaycloudSettings,
  type PaycloudTerminalSummary,
} from "@/lib/provider-portal/paycloud-api";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";

export interface PaycloudCollectReadyState {
  ready: boolean;
  loading: boolean;
  blockers: PaycloudReadinessBlocker[];
  warnings: PaycloudReadinessWarning[];
  settings: PaycloudSettings | null;
  terminals: PaycloudTerminalSummary | null;
}

export function usePaycloudCollectReady(): PaycloudCollectReadyState {
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blockers, setBlockers] = useState<PaycloudReadinessBlocker[]>([]);
  const [warnings, setWarnings] = useState<PaycloudReadinessWarning[]>([]);
  const [settings, setSettings] = useState<PaycloudSettings | null>(null);
  const [terminals, setTerminals] = useState<PaycloudTerminalSummary | null>(null);

  useEffect(() => {
    if (!paycloudEnabled) {
      setReady(false);
      setLoading(false);
      setBlockers([]);
      setWarnings([]);
      setSettings(null);
      setTerminals(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    paycloudApi
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setReady(Boolean(s.ready));
        setBlockers(s.blockers ?? []);
        setWarnings(s.warnings ?? []);
        setSettings(s);
        setTerminals(s.terminals ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setBlockers([]);
          setWarnings([]);
          setSettings(null);
          setTerminals(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paycloudEnabled]);

  return {
    ready: paycloudEnabled && ready,
    loading,
    blockers,
    warnings,
    settings,
    terminals,
  };
}
