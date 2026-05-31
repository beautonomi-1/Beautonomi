/**
 * Identity verification (KYC) – status + start flow.
 *
 * When SumSub is configured → launches the embed URL in the device browser.
 * When SumSub is NOT configured → shows a manual document-upload form that
 * posts to /api/me/verification (same flow used by customer identity screen).
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { launchImageLibraryWithPermission } from "@/lib/native-permissions";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

type VerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

interface VerificationStatusResponse {
  status: VerificationStatus;
  sumsub_available: boolean;
  sumsub_applicant_id?: string | null;
  rejection_reason?: string | null;
  manual_verification?: {
    id: string;
    status: string;
    document_type: string;
    submitted_at: string;
    rejection_reason?: string | null;
  } | null;
  last_reviewed_at?: string | null;
  updated_at?: string | null;
}

const STATUS_CONFIG: Record<
  VerificationStatus,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  pending: { label: "Not started", icon: "time-outline", color: "#6b7280", bg: "bg-gray-100" },
  in_progress: { label: "Under review", icon: "hourglass-outline", color: "#f59e0b", bg: "bg-amber-100" },
  approved: { label: "Verified", icon: "checkmark-circle", color: "#22c55e", bg: "bg-green-100" },
  rejected: { label: "Rejected", icon: "close-circle", color: "#ef4444", bg: "bg-red-100" },
  reset: { label: "Reset", icon: "refresh-outline", color: "#6366f1", bg: "bg-indigo-100" },
};

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
] as const;

export default function VerificationScreen() {
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Manual upload state
  const [docType, setDocType] = useState<string>("license");
  const [country, setCountry] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const env = bundle?.meta?.env ?? "production";

  const { data, loading, error, refresh } = useApi<VerificationStatusResponse>(
    `/api/provider/verification/status?environment=${encodeURIComponent(env)}`
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const statusData = data as VerificationStatusResponse | undefined;
  const status = statusData?.status ?? "pending";
  const sumsubAvailable = statusData?.sumsub_available ?? false;
  const config = STATUS_CONFIG[status];

  const isApproved = status === "approved";
  const isUnderReview =
    status === "in_progress" || statusData?.manual_verification?.status === "pending";
  const canAct = !isApproved && !isUnderReview;

  // ─── SumSub flow ────────────────────────────────────────────────────────
  const openVerificationFlow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLaunching(true);
    try {
      const res = await api.get<{ access_token: string; refresh_token?: string }>(
        `/api/provider/verification/sumsub/token?environment=${encodeURIComponent(env)}`
      );
      const access_token = res.data?.access_token;
      const refresh_token = res.data?.refresh_token;
      if (!access_token) {
        Alert.alert(
          "Automated verification unavailable",
          "Please use the manual document upload below to submit your ID for review."
        );
        return;
      }
      const baseUrl = getWebProviderBaseUrl().replace(/\/$/, "");
      const hash = `token=${encodeURIComponent(access_token)}${refresh_token ? `&refresh_token=${encodeURIComponent(refresh_token)}` : ""}`;
      pushInAppBrowser(router, `${baseUrl}/provider/verification/embed#${hash}`, "Verification");
    } catch {
      Alert.alert("Error", "Could not start verification. Please use the manual upload below.");
    } finally {
      setLaunching(false);
    }
  }, [env, router]);

  // ─── Manual upload ───────────────────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.9,
        },
        {
          title: "Permission needed",
          message: "Allow access to photos to upload your document.",
        },
      );
      if (!result) return;
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({ uri: asset.uri, fileName: asset.fileName ?? `verification-${Date.now()}.jpg` });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const submitManual = async () => {
    if (!selectedFile || !country.trim()) {
      Alert.alert("Missing info", "Please select a document photo and enter the country of issue.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri: selectedFile.uri,
        name: selectedFile.fileName,
        type: "image/jpeg",
      });
      formData.append("document_type", docType);
      formData.append("country", country.trim());

      const res = await api.post<{ verification_id?: string }>("/api/me/verification", formData);
      if (res.error) {
        Alert.alert("Upload failed", getApiErrorMessage(res.error, "Could not upload document."));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Document submitted",
        "Your ID has been submitted. Our team will review it within 1–2 business days and notify you."
      );
      setSelectedFile(null);
      setCountry("");
      refresh();
    } catch {
      Alert.alert("Error", "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Identity verification" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Identity verification" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Identity verification"
        subtitle="Required for compliance"
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={twStyle("px-4 pt-6")}>
          {/* Status badge */}
          <View style={[twStyle(`rounded-2xl p-6 items-center ${config.bg}`)]}>
            <View
              style={[
                twStyle("w-16 h-16 rounded-full items-center justify-center mb-4"),
                { backgroundColor: `${config.color}30` },
              ]}
            >
              <Ionicons name={config.icon} size={32} color={config.color} />
            </View>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>{config.label}</Text>
            <Text style={twStyle("mt-2 text-center text-gray-600")}>
              {isApproved
                ? "Your identity is verified."
                : isUnderReview
                  ? "Your document is under review. We'll notify you once it's processed."
                  : status === "rejected"
                    ? "Verification was not approved. Please submit your ID again."
                    : "Upload a government-issued ID so our team can verify your identity."}
            </Text>
          </View>

          {/* Rejection reason — tells the provider exactly what to fix */}
          {status === "rejected" && statusData?.rejection_reason ? (
            <View style={twStyle("mt-4 rounded-2xl bg-red-50 p-4")}>
              <View style={twStyle("flex-row items-start gap-2")}>
                <Ionicons name="alert-circle-outline" size={18} color="#ef4444" style={{ marginTop: 1 }} />
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-red-800 mb-1")}>Why it was declined</Text>
                  <Text style={twStyle("text-sm text-red-700")}>{statusData.rejection_reason}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* SumSub button — only when available and action is needed */}
          {sumsubAvailable && canAct && (
            <View style={twStyle("mt-6")}>
              <ActionButton
                label={launching ? "Starting…" : "Start automated verification"}
                variant="secondary"
                onPress={openVerificationFlow}
                fullWidth
                icon="open-outline"
                iconPosition="right"
                loading={launching}
                disabled={launching}
              />
              <Text style={twStyle("mt-3 text-center text-sm text-gray-500")}>
                Opens the verification flow in-app.
              </Text>
            </View>
          )}

          {/* Manual upload — always available so providers have a fallback even
              when SumSub is offered (camera issues, unsupported document, etc.). */}
          {canAct && (
            <View style={twStyle("mt-6")}>
              {sumsubAvailable && (
                <View style={twStyle("flex-row items-center mb-5")}>
                  <View style={twStyle("flex-1 h-px bg-gray-200")} />
                  <Text style={twStyle("mx-3 text-xs font-medium text-gray-400")}>OR UPLOAD MANUALLY</Text>
                  <View style={twStyle("flex-1 h-px bg-gray-200")} />
                </View>
              )}
              {/* Info banner */}
              <View style={twStyle("bg-blue-50 rounded-xl p-4 mb-5")}>
                <View style={twStyle("flex-row items-start gap-3")}>
                  <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
                  <Text style={twStyle("flex-1 text-sm text-blue-700")}>
                    {sumsubAvailable
                      ? "Prefer to upload your ID instead? Submit a copy and our team will review it within 1–2 business days."
                      : "Our automated verification is being set up. Upload a copy of your ID and our team will review it within 1–2 business days."}
                  </Text>
                </View>
              </View>

              {/* Document type */}
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2")}>Document type</Text>
              <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
                {DOC_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => { setDocType(opt.value); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: docType === opt.value ? Colors.primary : Colors.gray[100],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: docType === opt.value ? "#fff" : Colors.gray[700],
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Country */}
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2")}>Country of issue</Text>
              <TextInput
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: "#fff",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: Colors.gray[900],
                  marginBottom: 16,
                }}
                value={country}
                onChangeText={setCountry}
                placeholder="e.g. South Africa"
                placeholderTextColor={Colors.gray[400]}
                autoCapitalize="words"
              />

              {/* File picker */}
              <Text style={twStyle("text-sm font-semibold text-gray-700 mb-2")}>Document photo</Text>
              <TouchableOpacity
                onPress={pickDocument}
                style={{
                  borderRadius: 16,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: selectedFile ? Colors.primary : Colors.gray[300],
                  backgroundColor: selectedFile ? "#FDF2F8" : Colors.gray[50],
                  padding: 24,
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                {selectedFile ? (
                  <>
                    <Ionicons name="document-attach" size={32} color={Colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                      {selectedFile.fileName}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 4 }}>Tap to change</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={32} color={Colors.gray[400]} style={{ marginBottom: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                      Tap to select your ID photo
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                      JPEG or PNG · max 10 MB
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Submit */}
              <TouchableOpacity
                onPress={submitManual}
                disabled={uploading || !selectedFile || !country.trim()}
                style={{
                  backgroundColor:
                    uploading || !selectedFile || !country.trim() ? Colors.gray[300] : Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: "center",
                }}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                    Submit for verification
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={twStyle("mt-4 text-center text-xs text-gray-500")}>
                Your document is stored securely and used only for identity verification.
              </Text>
            </View>
          )}

          {/* Under review message */}
          {isUnderReview && !isApproved && (
            <View style={twStyle("mt-6 bg-amber-50 rounded-2xl p-5")}>
              <View style={twStyle("flex-row items-center gap-2 mb-2")}>
                <Ionicons name="hourglass-outline" size={18} color="#f59e0b" />
                <Text style={twStyle("text-sm font-semibold text-amber-800")}>Document under review</Text>
              </View>
              <Text style={twStyle("text-sm text-amber-700")}>
                Your document has been received. Our team will review it within 1-2 business days and you&apos;ll be notified once complete.
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
              Identity verification helps us prevent fraud and meet regulatory requirements. Your information is processed securely by our team.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
