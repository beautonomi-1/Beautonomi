"use client";

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ProviderVerificationHub } from "@/components/verification/ProviderVerificationHub";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useApi } from "@/hooks/useApi";
import { providerVerificationSubtitle, verificationPolicyFromBundle } from "@/lib/verification/policy";
import { LoadingState } from "@/components/ui/LoadingState";

export default function VerificationScreen() {
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const verificationRequired = verificationPolicyFromBundle(bundle).required_for_providers;
  const env = bundle?.meta?.env ?? "production";

  const { data: statusData, loading, refresh } = useApi<{
    verification_plan: NonNullable<Parameters<typeof ProviderVerificationHub>[0]["statusData"]>["verification_plan"];
    payee_entity: NonNullable<Parameters<typeof ProviderVerificationHub>[0]["statusData"]>["payee_entity"];
    didit_available?: boolean;
    kyb_available?: boolean;
  }>(`/api/provider/verification/status?environment=${encodeURIComponent(env)}`);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <ScreenContainer scrollable noPadding>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Verification"
          subtitle={providerVerificationSubtitle(verificationRequired)}
          onBack={() => router.back()}
        />
      </View>
      {loading && !statusData ? (
        <LoadingState message="Loading verification…" />
      ) : (
        <ProviderVerificationHub
          env={env}
          statusData={statusData ?? null}
          onRefresh={onRefresh}
        />
      )}
    </ScreenContainer>
  );
}
