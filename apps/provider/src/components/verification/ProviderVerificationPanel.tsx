/**
 * Reusable provider identity-verification (KYC) panel (Didit).
 *
 * Replaces the previous Sumsub-based panel. Encapsulates:
 *   - Confirm-legal-details step (inline validation, provider-specific copy)
 *   - Didit native SDK launch via @didit-protocol/sdk-react-native
 *   - Manual document-upload fallback (when manual_available)
 *   - All 10 normalized status states (3B UX blueprint)
 *   - Optimistic "checking" after SDK return — status confirmed by webhook
 *
 * Route path is UNCHANGED so `finalize-onboarding.test.ts` contract holds.
 */
import { useCallback, useState, useRef, useEffect, type ReactNode } from "react";
import {
  View, Text, ScrollView, RefreshControl, Alert,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { launchDidit } from "@/lib/identity-verification/launchDidit";
import { formatDiditLaunchError } from "@/lib/identity-verification/userFacingDiditErrors";
import { useIdentityVerification } from "@/lib/identity-verification/useIdentityVerification";
import { launchImageLibraryWithPermission, PERMISSION_COPY } from "@/lib/native-permissions";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import { CountryOfIssuePicker } from "@/components/CountryOfIssuePicker";
import { LegalDetailsConfirmForm } from "@/components/verification/LegalDetailsConfirmForm";
import { verificationPolicyFromBundle } from "@/lib/verification/policy";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { webPrivacyPolicyUrl } from "@/lib/legal-web";

export type NormalizedVerificationStatus =
  | "not_started" | "session_created" | "in_progress" | "pending_review"
  | "approved" | "rejected" | "expired" | "abandoned" | "requires_retry" | "errored";

// Keep legacy VerificationStatus alias for backward compat with `verify-identity.tsx`
export type VerificationStatus = NormalizedVerificationStatus;

export interface ProviderVerificationPanelProps {
  footer?: ReactNode;
  onStatusChange?: (status: NormalizedVerificationStatus) => void;
  onApproved?: () => void;
}

const STATUS_CONFIG: Record<
  NormalizedVerificationStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  not_started:    { label: "Not started",      icon: "time-outline",           color: "#6b7280", bg: "bg-gray-100" },
  session_created:{ label: "Not started",      icon: "time-outline",           color: "#6b7280", bg: "bg-gray-100" },
  in_progress:    { label: "In progress",      icon: "hourglass-outline",      color: "#f59e0b", bg: "bg-amber-100" },
  pending_review: { label: "Under review",     icon: "hourglass-outline",      color: "#3b82f6", bg: "bg-blue-100" },
  approved:       { label: "Verified",         icon: "checkmark-circle",       color: "#22c55e", bg: "bg-green-100" },
  rejected:       { label: "Not verified",     icon: "close-circle",           color: "#ef4444", bg: "bg-red-100" },
  expired:        { label: "Session expired",  icon: "alert-circle-outline",   color: "#f59e0b", bg: "bg-amber-100" },
  abandoned:      { label: "Not completed",    icon: "alert-circle-outline",   color: "#f59e0b", bg: "bg-amber-100" },
  requires_retry: { label: "Retry required",   icon: "refresh-outline",        color: "#6366f1", bg: "bg-indigo-100" },
  errored:        { label: "Unavailable",      icon: "alert-circle-outline",   color: "#6b7280", bg: "bg-gray-100" },
};

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
] as const;

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ProviderVerificationPanel({
  footer,
  onStatusChange,
  onApproved,
}: ProviderVerificationPanelProps) {
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showConfirmDetails, setShowConfirmDetails] = useState(false);

  // Manual upload state
  const [docType, setDocType] = useState<string>("license");
  const [manualCountry, setManualCountry] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Didit session hook
  const {
    status, loading: statusLoading, legalDetails, legalDetailsErrors,
    setLegalDetails, validateAndGetErrors, startPolling, refresh: refreshStatus,
  } = useIdentityVerification("provider");

  // Policy + availability from the canonical verification status endpoint.
  const env = bundle?.meta?.env ?? "production";
  const { data: legacyStatus, error, refresh: refreshLegacy } = useApi<{
    didit_available?: boolean;
    manual_available?: boolean;
    verification_mode?: string;
    rejection_reason?: string | null;
    required_for_providers?: boolean;
    verification_plan?: {
      is_complete?: boolean;
      required_steps?: string[];
      effective_summary?: string;
    } | null;
  }>(`/api/provider/verification/status?environment=${encodeURIComponent(env)}`);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void refreshLegacy();
    }, [refreshStatus, refreshLegacy])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshStatus(), refreshLegacy()]).catch(() => {});
    setRefreshing(false);
  }, [refreshStatus, refreshLegacy]);

  const diditAvailable = legacyStatus?.didit_available === true;
  const manualAvailable = legacyStatus?.manual_available !== false;
  const verificationOff = legacyStatus?.verification_mode === "off";
  const rejectionReason = legacyStatus?.rejection_reason;
  const verificationRequired =
    legacyStatus?.required_for_providers ??
    verificationPolicyFromBundle(bundle).required_for_providers;

  // Notify parent on status transitions (hooks must run before any early return)
  const prevStatusRef = useRef<NormalizedVerificationStatus | null>(status);
  useEffect(() => {
    if (status == null) return;
    if (prevStatusRef.current !== status) {
      onStatusChange?.(status);
      if (status === "approved") onApproved?.();
      prevStatusRef.current = status;
    }
  }, [status, onStatusChange, onApproved]);

  // ─── Didit flow ──────────────────────────────────────────────────────────
  const openDiditVerification = useCallback(async () => {
    // Validate legal details first
    const errors = validateAndGetErrors();
    if (Object.keys(errors).length > 0) {
      setShowConfirmDetails(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLaunching(true);
    try {
      const result = await launchDidit({
        persona: "provider",
        languageCode: bundle?.meta?.env === "staging" ? "en" : "en",
        confirmedLegalDetails: legalDetails.firstName ? legalDetails : undefined,
      });

      if (!result.ok && result.error) {
        Alert.alert(
          "Verification unavailable",
          formatDiditLaunchError(result.error, { manualAvailable }),
        );
        return;
      }

      // SDK returned — start polling for webhook-confirmed status
      // Never trust SDK result directly; wait for webhook
      startPolling();
      await refreshStatus();
    } catch {
      Alert.alert("Error", "Could not start verification. Please try again.");
    } finally {
      setLaunching(false);
    }
  }, [validateAndGetErrors, legalDetails, bundle, startPolling, refreshStatus, manualAvailable]);

  if (statusLoading && status == null) {
    return <View style={twStyle("flex-1 items-center justify-center py-12")}><LoadingState /></View>;
  }

  const effectiveStatus = status ?? "not_started";
  const config = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.not_started;
  const isApproved      = effectiveStatus === "approved";
  const isUnderReview   = effectiveStatus === "in_progress" || effectiveStatus === "pending_review";
  const canAct          = !isApproved && !isUnderReview;
  const needsRetry      = effectiveStatus === "rejected" || effectiveStatus === "expired" || effectiveStatus === "abandoned" || effectiveStatus === "requires_retry";
  const planIncomplete = legacyStatus?.verification_plan?.is_complete === false;
  const businessVerificationPending =
    planIncomplete &&
    (legacyStatus?.verification_plan?.required_steps?.includes("business_kyb") ||
      legacyStatus?.verification_plan?.required_steps?.includes("manual_business_review"));
  const displayConfig =
    businessVerificationPending && effectiveStatus !== "rejected"
      ? {
          label: "Business verification pending",
          icon: "hourglass-outline" as keyof typeof Ionicons.glyphMap,
          color: "#3b82f6",
          bg: "bg-blue-100",
        }
      : config;
  const statusLabel = displayConfig.label;
  const statusMessage = businessVerificationPending
    ? legacyStatus?.verification_plan?.effective_summary
      ? `Your personal identity is verified. ${legacyStatus.verification_plan.effective_summary}`
      : "Your personal identity is verified. Complete business verification to finish setup and go live."
    : isApproved
      ? "Your identity is verified."
      : isUnderReview
        ? "Your verification is under review. We'll notify you once it's confirmed."
        : effectiveStatus === "rejected"
          ? "Verification was not approved. Please try again."
          : effectiveStatus === "expired" || effectiveStatus === "abandoned"
            ? "Your session ended. Start a new verification."
            : verificationRequired
              ? "Required for your marketplace — verify with your government ID or passport to earn the Verified trust badge."
              : "Optional — verify with your government ID or passport to earn the Verified trust badge.";

  // ─── Manual upload ───────────────────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const result = await launchImageLibraryWithPermission(
        { mediaTypes: ["images"], allowsEditing: false, quality: 0.9 },
        PERMISSION_COPY.photosDocument,
      );
      if (!result || result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({ uri: asset.uri, fileName: asset.fileName ?? `verification-${Date.now()}.jpg` });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const submitManual = async () => {
    if (!selectedFile || !manualCountry) {
      Alert.alert("Missing info", "Please select a document photo and choose the country of issue.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", { uri: selectedFile.uri, name: selectedFile.fileName, type: "image/jpeg" });
      formData.append("document_type", docType);
      formData.append("country", manualCountry);
      const res = await api.post<{ verification_id?: string }>("/api/me/verification", formData);
      if (res.error) {
        Alert.alert("Upload failed", getApiErrorMessage(res.error, "Could not upload document."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Document submitted", "Our team will review it within 1–2 business days and notify you.");
      setSelectedFile(null);
      setManualCountry("");
      await refreshStatus();
    } catch {
      Alert.alert("Error", "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (error && !legacyStatus) {
    return <View style={twStyle("flex-1 justify-center px-4")}><ErrorState message={error} onRetry={onRefresh} /></View>;
  }

  return (
    <ScrollView
      style={twStyle("flex-1")}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={twStyle("px-4 pt-6")}>
        {/* Status badge */}
        <View style={[twStyle(`rounded-2xl p-6 items-center ${displayConfig.bg}`)]}>
          <View style={[twStyle("w-16 h-16 rounded-full items-center justify-center mb-4"), { backgroundColor: `${displayConfig.color}30` }]}>
            <Ionicons name={displayConfig.icon} size={32} color={displayConfig.color} />
          </View>
          <Text style={twStyle("text-lg font-semibold text-gray-900")}>{statusLabel}</Text>
          <Text style={twStyle("mt-2 text-center text-gray-600 text-sm")}>
            {statusMessage}
          </Text>
        </View>

        {/* Important: use legal name notice */}
        {canAct && diditAvailable && (
          <View style={twStyle("mt-4 rounded-xl bg-amber-50 p-4")}>
            <View style={twStyle("flex-row items-start gap-2")}>
              <Ionicons name="warning-outline" size={18} color="#d97706" style={{ marginTop: 1 }} />
              <Text style={twStyle("flex-1 text-sm text-amber-800 leading-snug")}>
                Use your real legal name and details exactly as they appear on your ID or passport. Nicknames or mismatched details will cause verification to fail.
              </Text>
            </View>
          </View>
        )}

        {/* Provider note: verifying yourself, not your business */}
        {canAct && diditAvailable && (
          <View style={twStyle("mt-3 rounded-xl bg-blue-50 p-4")}>
            <View style={twStyle("flex-row items-start gap-2")}>
              <Ionicons name="information-circle-outline" size={18} color="#3b82f6" style={{ marginTop: 1 }} />
              <Text style={twStyle("flex-1 text-sm text-blue-700 leading-snug")}>
                You&apos;re verifying your own identity as the owner or representative. If your salon is a registered business, your payout account can be in the business name — that&apos;s expected.
              </Text>
            </View>
          </View>
        )}

        {/* Confirm legal details form */}
        {(canAct || needsRetry) && diditAvailable && showConfirmDetails && (
          <LegalDetailsConfirmForm
            values={legalDetails}
            errors={legalDetailsErrors}
            onChange={setLegalDetails}
            onSubmit={() => { setShowConfirmDetails(false); void openDiditVerification(); }}
            onCancel={() => setShowConfirmDetails(false)}
            tenantRegionCode={bundle?.meta?.tenant_region?.code}
            tenantRegionName={bundle?.meta?.tenant_region?.name}
            isProvider
          />
        )}

        {/* Rejection reason */}
        {effectiveStatus === "rejected" && rejectionReason ? (
          <View style={twStyle("mt-4 rounded-2xl bg-red-50 p-4")}>
            <View style={twStyle("flex-row items-start gap-2")}>
              <Ionicons name="alert-circle-outline" size={18} color="#ef4444" style={{ marginTop: 1 }} />
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-semibold text-red-800 mb-1")}>Why it was declined</Text>
                <Text style={twStyle("text-sm text-red-700")}>{rejectionReason}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Didit button — hidden while the confirm form is open (form has its own CTA) */}
        {diditAvailable && (canAct || needsRetry) && !showConfirmDetails && (
          <View style={twStyle("mt-6")}>
            <ActionButton
              label={launching ? "Starting…" : (needsRetry ? "Try again" : "Start verification")}
              variant="secondary"
              onPress={() => {
                setShowConfirmDetails(true);
              }}
              fullWidth
              icon="shield-checkmark-outline"
              iconPosition="right"
              loading={launching}
              disabled={launching}
            />
            <Text style={twStyle("mt-3 text-center text-xs text-gray-500")}>
              Powered by Didit · runs fully in-app · takes about 2 minutes
            </Text>
          </View>
        )}

        {/* Consent disclosure */}
        {diditAvailable && (canAct || needsRetry) && (
          <Text style={twStyle("mt-3 text-center text-xs text-gray-400")}>
            By proceeding you agree to our{" "}
            <Text
              style={twStyle("font-semibold text-gray-600 underline")}
              onPress={() => pushInAppBrowser(router, webPrivacyPolicyUrl(), "Privacy Policy")}
            >
              Privacy Policy
            </Text>{" "}
            and Didit&apos;s end-user terms.
          </Text>
        )}

        {/* Verification off */}
        {verificationOff && canAct && (
          <View style={twStyle("mt-6 rounded-2xl bg-gray-50 p-5")}>
            <View style={twStyle("flex-row items-center gap-2 mb-2")}>
              <Ionicons name="ban-outline" size={18} color="#6b7280" />
              <Text style={twStyle("text-sm font-semibold text-gray-700")}>Verification unavailable</Text>
            </View>
            <Text style={twStyle("text-sm text-gray-600")}>
              Identity verification is currently unavailable. Contact support if you need assistance.
            </Text>
          </View>
        )}

        {/* Manual upload divider */}
        {diditAvailable && canAct && manualAvailable && (
          <View style={twStyle("flex-row items-center mt-6 mb-2")}>
            <View style={twStyle("flex-1 h-px bg-gray-200")} />
            <Text style={twStyle("mx-3 text-xs font-medium text-gray-400")}>OR UPLOAD MANUALLY</Text>
            <View style={twStyle("flex-1 h-px bg-gray-200")} />
          </View>
        )}

        {/* Manual upload form */}
        {canAct && manualAvailable && (
          <View style={twStyle("mt-3")}>
            <View style={twStyle("bg-blue-50 rounded-xl p-4 mb-5")}>
              <View style={twStyle("flex-row items-start gap-3")}>
                <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
                <Text style={twStyle("flex-1 text-sm text-blue-700")}>
                  Upload a copy of your ID and our team will review it within 1–2 business days.
                </Text>
              </View>
            </View>

            <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2")}>Document type</Text>
            <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
              {DOC_TYPES.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { setDocType(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Document type ${opt.label}`}
                  accessibilityState={{ selected: docType === opt.value }}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: docType === opt.value ? Colors.primary : Colors.gray[100] }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: docType === opt.value ? "#fff" : Colors.gray[700] }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <CountryOfIssuePicker
              value={manualCountry}
              onChange={setManualCountry}
              tenantRegionCode={bundle?.meta?.tenant_region?.code}
              tenantRegionName={bundle?.meta?.tenant_region?.name}
            />

            <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2 mt-4")}>Document photo</Text>
            <TouchableOpacity
              onPress={pickDocument}
              accessibilityRole="button"
              style={{ borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: selectedFile ? Colors.primary : Colors.gray[300], backgroundColor: selectedFile ? "#FDF2F8" : Colors.gray[50], padding: 24, alignItems: "center", marginBottom: 20 }}
            >
              {selectedFile ? (
                <>
                  <Ionicons name="document-attach" size={32} color={Colors.primary} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{selectedFile.fileName}</Text>
                  <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 4 }}>Tap to change</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={32} color={Colors.gray[400]} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>Tap to select your ID photo</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>JPEG or PNG · max 10 MB</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={submitManual}
              disabled={uploading || !selectedFile || !manualCountry}
              accessibilityRole="button"
              style={{ backgroundColor: uploading || !selectedFile || !manualCountry ? Colors.gray[300] : Colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: "center" }}
            >
              {uploading ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Submit for verification</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Under review message */}
        {isUnderReview && !isApproved && (
          <View style={twStyle("mt-6 bg-blue-50 rounded-2xl p-5")}>
            <View style={twStyle("flex-row items-center gap-2 mb-2")}>
              <Ionicons name="hourglass-outline" size={18} color="#3b82f6" />
              <Text style={twStyle("text-sm font-semibold text-blue-800")}>
                {effectiveStatus === "pending_review" ? "Under review" : "Document under review"}
              </Text>
            </View>
            <Text style={twStyle("text-sm text-blue-700")}>
              {effectiveStatus === "pending_review"
                ? "We're reviewing your documents — this can take a few minutes if additional checks are running. You can continue setup; we'll notify you when verification is complete."
                : "Your verification is being reviewed. We'll notify you once it's confirmed — no action needed."}
            </Text>
          </View>
        )}

        {/* Why we verify */}
        <View style={twStyle("mt-8 rounded-2xl bg-slate-50 p-4")}>
          <View style={twStyle("flex-row items-center mb-2")}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#475569" />
            <Text style={twStyle("ml-2 text-sm font-semibold text-gray-700")}>Why we verify</Text>
          </View>
          <Text style={twStyle("text-sm text-gray-600 leading-5")}>
            Identity verification helps us prevent fraud and meet regulatory requirements. Your information is processed securely.
          </Text>
        </View>

        {footer ? <View style={twStyle("mt-6")}>{footer}</View> : null}
      </View>
    </ScrollView>
  );
}
