/**
 * Dynamic provider verification hub — entity selection + server-driven steps.
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import * as WebBrowser from "expo-web-browser";
import { formatDiditLaunchError } from "@/lib/identity-verification/userFacingDiditErrors";
import { ProviderEntityTypeSelector, type PayeeEntityData } from "./ProviderEntityTypeSelector";
import { ProviderVerificationPanel } from "./ProviderVerificationPanel";
import { useTranslation } from "@beautonomi/i18n";

type VerificationStep = "person_kyc" | "business_kyb" | "manual_upload" | "manual_business_review";

type StepInfo = {
  step: VerificationStep;
  required: boolean;
  label: string;
  description: string;
  status: string;
  locked?: boolean;
};

type VerificationPlanPayload = {
  required_steps: VerificationStep[];
  optional_steps: VerificationStep[];
  progress: { completed: number; total: number };
  steps: StepInfo[];
  is_complete: boolean;
  effective_summary: string;
};

type StatusPayload = {
  verification_plan: VerificationPlanPayload | null;
  payee_entity: PayeeEntityData | null;
  didit_available?: boolean;
  kyb_available?: boolean;
};

function stepStatusLabel(status: string, vh: (key: string) => string, locked?: boolean): string {
  if (locked) return vh("completeIdentityFirst");
  if (status === "approved") return vh("done");
  if (status === "not_required") return vh("notNeeded");
  if (status === "pending_review") return vh("underReview");
  if (status === "in_progress" || status === "session_created") return vh("inProgress");
  if (status === "rejected") return vh("actionNeeded");
  return vh("notStarted");
}

function stepStatusColor(status: string, locked?: boolean): string {
  if (locked) return "#9ca3af";
  if (status === "approved") return "#22c55e";
  if (status === "pending_review") return "#3b82f6";
  if (status === "rejected") return "#ef4444";
  if (status === "in_progress" || status === "session_created") return "#f59e0b";
  return "#6b7280";
}

type Props = {
  env: string;
  statusData: StatusPayload | null;
  onRefresh: () => Promise<void>;
  identityPanelFooter?: React.ReactNode;
};

export function ProviderVerificationHub({
  env,
  statusData,
  onRefresh,
  identityPanelFooter,
}: Props) {
  const { t } = useTranslation();
  const vh = (key: string, opts?: Record<string, unknown>) => t(`provider.mobile.components.providerVerificationHub.${key}`, opts) as string;
  const [expandedStep, setExpandedStep] = useState<VerificationStep | null>("person_kyc");
  const [kybLaunching, setKybLaunching] = useState(false);

  const plan = statusData?.verification_plan ?? null;
  const payeeEntity = statusData?.payee_entity;

  const startBusinessVerification = useCallback(async () => {
    setKybLaunching(true);
    try {
      const res = await api.post<{
        url?: string;
        session_token?: string;
        is_existing?: boolean;
      }>("/api/provider/identity-verification/business-session", {
        language_code: "en",
      });
      if (res.error) throw new Error(getApiErrorMessage(res.error));
      const url = res.data?.url;
      if (!url) throw new Error(vh("noUrl"));
      await WebBrowser.openBrowserAsync(url, {
        dismissButtonStyle: "close",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
      await onRefresh();
    } catch (err) {
      Alert.alert(
        vh("alertTitle"),
        formatDiditLaunchError(getApiErrorMessage(err), { manualAvailable: false }),
      );
    } finally {
      setKybLaunching(false);
    }
  }, [onRefresh, t]);

  const onEntitySaved = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  if (!payeeEntity) {
    return (
      <View style={twStyle("py-4")}>
        <ActivityIndicator />
      </View>
    );
  }

  const progress = plan?.progress ?? { completed: 0, total: 0 };
  const allSteps = plan?.steps ?? [];

  return (
    <View style={twStyle("gap-6")}>
      <ProviderEntityTypeSelector initial={payeeEntity} onSaved={onEntitySaved} />

      {plan && (
        <View style={twStyle("gap-3")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <Text style={twStyle("text-base font-semibold text-slate-900")}>{vh("yourVerification")}</Text>
            {progress.total > 0 && (
              <Text style={twStyle("text-sm text-slate-600")}>
                {vh("progressComplete", { completed: progress.completed, total: progress.total })}
              </Text>
            )}
          </View>
          {plan.is_complete ? (
            <View style={twStyle("rounded-2xl bg-green-50 border border-green-200 p-4")}>
              <Text style={twStyle("font-semibold text-green-800")}>
{vh("verifiedLive")}
              </Text>
            </View>
          ) : (
            <Text style={twStyle("text-sm text-slate-600")}>{plan.effective_summary}</Text>
          )}

          {allSteps.map((step, index) => {
            const expanded = expandedStep === step.step;
            const color = stepStatusColor(step.status, step.locked);
            const canStartKyb =
              step.step === "business_kyb" &&
              !step.locked &&
              statusData?.kyb_available &&
              step.status !== "approved" &&
              step.status !== "pending_review";

            return (
              <View
                key={step.step}
                style={twStyle("rounded-2xl border border-slate-200 overflow-hidden bg-white")}
              >
                <TouchableOpacity
                  onPress={() => setExpandedStep(expanded ? null : step.step)}
                  style={twStyle("flex-row items-center gap-3 p-4")}
                >
                  <View
                    style={twStyle(
                      step.status === "approved"
                        ? "h-8 w-8 rounded-full items-center justify-center bg-green-100"
                        : "h-8 w-8 rounded-full items-center justify-center bg-slate-100",
                    )}
                  >
                    {step.status === "approved" ? (
                      <Ionicons name="checkmark" size={18} color={color} />
                    ) : (
                      <Text style={twStyle("text-sm font-bold text-slate-600")}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-slate-900")}>{step.label}</Text>
                    <Text style={twStyle("text-xs text-slate-500")}>
                      {stepStatusLabel(step.status, vh, step.locked)}
                      {!step.required ? vh("optional") : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#94a3b8"
                  />
                </TouchableOpacity>

                {expanded && step.step === "person_kyc" && (
                  <View style={twStyle("border-t border-slate-100 px-2 pb-2")}>
                    <ProviderVerificationPanel
                      footer={identityPanelFooter}
                      onApproved={() => void onRefresh()}
                    />
                  </View>
                )}

                {expanded && step.step === "business_kyb" && (
                  <View style={twStyle("border-t border-slate-100 p-4 gap-3")}>
                    <Text style={twStyle("text-sm text-slate-600")}>{step.description}</Text>
                    {canStartKyb && (
                      <TouchableOpacity
                        onPress={() => void startBusinessVerification()}
                        disabled={kybLaunching}
                        style={twStyle("rounded-xl bg-[#FF0077] py-3 items-center")}
                      >
                        {kybLaunching ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={twStyle("font-semibold text-white")}>
                            {step.status === "not_started" ? vh("startBusiness") : vh("continue")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                    {step.status === "approved" && (
                      <Text style={twStyle("text-sm text-green-700 font-medium")}>
                        {vh("businessVerified")}
                      </Text>
                    )}
                  </View>
                )}

                {expanded && step.step === "manual_business_review" && (
                  <View style={twStyle("border-t border-slate-100 p-4 gap-2")}>
                    <Text style={twStyle("text-sm text-slate-600")}>
                      {vh("manualReviewBody")}
                    </Text>
                    {step.status === "approved" ? (
                      <Text style={twStyle("text-sm text-green-700 font-medium")}>
                        {vh("reviewApproved")}
                      </Text>
                    ) : (
                      <Text style={twStyle("text-xs text-slate-500")}>
                        {vh("statusAfterReview", { status: stepStatusLabel(step.status, vh) })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
