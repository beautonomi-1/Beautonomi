/**
 * Identity verification screen.
 *
 * When SumSub is configured (sumsub_available === true):
 *   → Launches the SumSub Web SDK inside a device browser via a signed embed URL.
 *
 * When SumSub is not yet configured (sumsub_available === false):
 *   → Shows a manual document-upload form (POST /api/me/verification).
 *     Admin reviews the document and approves manually.
 */
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  AppState,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { haptic } from "@/lib/haptics";
import { launchImageLibraryWithPermission } from "@/lib/native-permissions";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getBackendUrl } from "@/config/public-env";
import { CountryOfIssuePicker } from "@/components/CountryOfIssuePicker";
import { formatVerificationCountryDisplay } from "@beautonomi/utils";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "license", labelKey: "docTypeLicense" },
  { value: "passport", labelKey: "docTypePassport" },
  { value: "identity", labelKey: "docTypeIdentity" },
] as const;

interface VerificationSubmission {
  id: string;
  document_type: string;
  country: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  has_document_file: boolean;
}

interface VerificationStatus {
  verified: boolean;
  status: string;
  submitted_at?: string;
  sumsub_available: boolean;
  can_submit_verification?: boolean;
  submissions?: VerificationSubmission[];
  manual_verification?: {
    id: string;
    status: string;
    document_type: string;
    submitted_at: string;
  } | null;
}

export default function IdentityVerificationScreen() {
  useScreenTracking("Identity Verification");
  const { t } = useTranslation();
  const iv = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.identityVerification.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const { bundle } = useConfigBundle();
  const env = bundle?.meta?.env ?? "production";
  const [statusData, setStatusData] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual upload state
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>("license");
  const [country, setCountry] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string; mimeType?: string } | null>(null);

  // SumSub launch state
  const [launching, setLaunching] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.get<VerificationStatus>(
        `/api/me/verification?environment=${encodeURIComponent(env)}`
      );
      if (res.error) {
        if (!silent) setError(res.error.message || iv("loadStatusFailed"));
        if (!silent) setStatusData(null);
        return;
      }
      const d = res.data as Record<string, unknown> | null;
      setStatusData({
        verified: Boolean(d?.verified),
        status: (d?.status as string) ?? "none",
        submitted_at: d?.submitted_at as string | undefined,
        sumsub_available: Boolean(d?.sumsub_available),
        can_submit_verification: Boolean(d?.can_submit_verification),
        submissions: Array.isArray(d?.submissions)
          ? (d.submissions as VerificationSubmission[])
          : [],
        manual_verification: (d?.manual_verification as VerificationStatus["manual_verification"]) ?? null,
      });
      setLastRefreshedAt(new Date());
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : iv("loadFailed"));
      if (!silent) setStatusData(null);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [env, iv]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void load({ silent: true });
      }
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (launching || uploading) return;
    const poll = setInterval(() => {
      void load({ silent: true });
    }, 30000);
    return () => clearInterval(poll);
  }, [launching, uploading, load]);

  // ─── SumSub flow ────────────────────────────────────────────────────────
  const openSumsub = useCallback(async () => {
    haptic.light();
    setLaunching(true);
    try {
      const res = await api.get<{ access_token: string; refresh_token?: string }>(
        `/api/me/verification/sumsub/token?environment=${encodeURIComponent(env)}`
      );
      if (res.error) {
        Alert.alert(errTitle, res.error.message || iv("startError"));
        return;
      }
      const access_token = res.data?.access_token;
      const refresh_token = (res.data as any)?.refresh_token;
      if (!access_token) {
        Alert.alert(iv("tokenMissingTitle"), iv("tokenMissingBody"));
        return;
      }
      const base = getBackendUrl().replace(/\/$/, "");
      if (!base) {
        Alert.alert(iv("appUrlMissingTitle"), iv("appUrlMissingBody"));
        return;
      }
      const hash = `token=${encodeURIComponent(access_token)}${
        refresh_token ? `&refresh_token=${encodeURIComponent(refresh_token)}` : ""
      }`;
      await Linking.openURL(`${base}/account-settings/verification/embed#${hash}`);
    } catch {
      Alert.alert(errTitle, iv("startVerificationFailed"));
    } finally {
      setLaunching(false);
    }
  }, [env, errTitle, iv]);

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
          title: iv("photoPermissionTitle"),
          message: iv("photoPermissionBody"),
        },
      );
      if (!result) return;
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        fileName: asset.fileName ?? `verification-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? undefined,
      });
      haptic.light();
    } catch {
      Alert.alert(errTitle, iv("pickImageFailed"));
    }
  };

  const submitManual = async () => {
    if (!selectedFile || !country) {
      Alert.alert(iv("missingInfoTitle"), iv("missingInfoBody"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri: selectedFile.uri,
        name: selectedFile.fileName,
        type: selectedFile.mimeType || "image/jpeg",
      });
      formData.append("document_type", documentType);
      formData.append("country", country);

      const res = await api.post<{ verification_id?: string; status?: string }>(
        "/api/me/verification",
        formData
      );

      if (res.error) {
        Alert.alert(iv("uploadAlertTitle"), getApiErrorMessage(res.error, iv("uploadFailed")));
        return;
      }
      haptic.success();
      Alert.alert(iv("submittedTitle"), iv("submittedBody"));
      setSelectedFile(null);
      setCountry("");
      await load({ silent: true });
    } catch {
      Alert.alert(errTitle, iv("uploadRetry"));
    } finally {
      setUploading(false);
    }
  };

  const isVerified = statusData?.verified;
  const canSubmit = statusData?.can_submit_verification ?? false;
  const submissions = statusData?.submissions ?? [];
  // Only show "under review" when actual submission records are in a blocking state.
  // Do NOT fire on statusData.status alone — the users table column can be stale
  // (e.g. 'pending' with no user_verifications rows) after a failed submission.
  const isUnderReview =
    submissions.some((s) =>
      ["pending", "in_progress", "submitted", "under_review"].includes(s.status),
    ) ||
    (!!statusData?.manual_verification &&
      ["pending", "in_progress", "submitted", "under_review"].includes(
        statusData.manual_verification.status,
      ));
  const sumsubAvailable = statusData?.sumsub_available ?? false;

  const statusLabel = useCallback(
    (s: string) => {
      const key =
        {
          pending: "status_pending",
          approved: "status_approved",
          rejected: "status_rejected",
          in_progress: "status_in_progress",
          submitted: "status_submitted",
          under_review: "status_under_review",
          none: "status_none",
        }[s] ?? "status_unknown";
      return iv(key);
    },
    [iv],
  );

  const docTypeLabel = useCallback(
    (documentType: string) => {
      if (documentType === "sumsub") return iv("docTypeSumsub");
      const opt = DOCUMENT_TYPE_OPTIONS.find((o) => o.value === documentType);
      return opt ? iv(opt.labelKey) : documentType;
    },
    [iv],
  );

  const formatWhen = useCallback((iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }, []);

  const formatLastRefreshed = useCallback((date: Date | null) => {
    if (!date) return null;
    try {
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, []);

  const openSubmissionDocument = useCallback(
    async (row: VerificationSubmission) => {
      if (!row.has_document_file) {
        Alert.alert(iv("submissionsSectionTitle"), iv("noDocumentFile"));
        return;
      }
      haptic.light();
      try {
        const res = await api.get<{ signed_url?: string }>(
          `/api/me/verification/${encodeURIComponent(row.id)}/view`,
        );
        if (res.error) {
          Alert.alert(errTitle, res.error.message || iv("openDocumentFailed"));
          return;
        }
        const url = res.data?.signed_url;
        if (!url) {
          Alert.alert(errTitle, iv("openDocumentFailed"));
          return;
        }
        await Linking.openURL(url);
      } catch (e) {
        Alert.alert(errTitle, e instanceof Error ? e.message : iv("openDocumentFailed"));
      }
    },
    [errTitle, iv],
  );

  return (
    <ScreenFrame loading={loading} error={error} onRetry={() => void load()} scrollable={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load({ silent: true });
            }}
            tintColor={Colors.primary}
          />
        }
      >
        <TouchableOpacity
          onPress={() => {
            haptic.light();
            void load({ silent: true });
          }}
          disabled={refreshing}
          style={{
            alignSelf: "flex-start",
            borderRadius: RADIUS_BUTTON,
            backgroundColor: refreshing ? Colors.gray[200] : Colors.gray[100],
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
          accessibilityRole="button"
          accessibilityLabel="Refresh verification status"
          accessibilityHint="Reloads identity verification status from the server"
        >
          <Ionicons name="refresh" size={14} color={Colors.primary} />
          <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "600" }}>
            {refreshing ? "Refreshing..." : "Refresh status"}
          </Text>
        </TouchableOpacity>
        {formatLastRefreshed(lastRefreshedAt) ? (
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 16 }}>
            Last updated at {formatLastRefreshed(lastRefreshedAt)}
          </Text>
        ) : null}

        {isVerified && (
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#D1FAE5",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="shield-checkmark" size={32} color="#059669" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>
              {iv("verifiedTitle")}
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center", marginBottom: 8 }}>
              {iv("verifiedBody")}
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], textAlign: "center", lineHeight: 18 }}>
              {iv("verifiedHistoryHint")}
            </Text>
          </View>
        )}

        {/* Under review banner */}
        {!isVerified && isUnderReview && (
          <View
            style={{
              backgroundColor: "#FEF3C7",
              borderRadius: RADIUS_CARD,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E" }}>{iv("underReviewTitle")}</Text>
            <Text style={{ fontSize: 13, color: "#B45309", marginTop: 4 }}>{iv("underReviewBody")}</Text>
          </View>
        )}

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>
            {iv("submissionsSectionTitle")}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12, lineHeight: 18 }}>
            {iv("submissionsSectionSubtitle")}
          </Text>
          {submissions.length === 0 && !isVerified ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                backgroundColor: Colors.gray[50],
                borderRadius: RADIUS_CARD,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                padding: 16,
              }}
            >
              <Ionicons name="document-outline" size={20} color={Colors.gray[400]} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700], marginBottom: 4 }}>
                  No submissions yet
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 18 }}>
                  Upload a government-issued ID below to get verified. Your document is reviewed securely.
                </Text>
              </View>
            </View>
          ) : submissions.length === 0 ? (
            <Text style={{ fontSize: 14, color: Colors.gray[500], fontStyle: "italic" }}>{iv("submissionsEmpty")}</Text>
          ) : (
            submissions.map((row) => (
              <View
                key={row.id}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: RADIUS_CARD,
                  padding: 14,
                  marginBottom: 10,
                  backgroundColor: Colors.white,
                }}
              >
                <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 20 }}>
                  {iv("submissionMeta", {
                    type: docTypeLabel(row.document_type),
                    country: formatVerificationCountryDisplay(row.country),
                    when: formatWhen(row.submitted_at),
                  })}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                  {statusLabel(row.status)}
                </Text>
                {row.rejection_reason ? (
                  <Text style={{ fontSize: 12, color: "#B45309", marginTop: 6 }}>
                    {iv("rejectedReason", { reason: row.rejection_reason })}
                  </Text>
                ) : null}
                {row.has_document_file ? (
                  <TouchableOpacity
                    onPress={() => void openSubmissionDocument(row)}
                    style={{
                      alignSelf: "flex-start",
                      marginTop: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: RADIUS_BUTTON,
                      backgroundColor: Colors.gray[100],
                    }}
                    accessibilityLabel={iv("viewDocument")}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{iv("viewDocument")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* SumSub automated option — shown when available AND user may submit */}
        {canSubmit && sumsubAvailable && (
          <View style={{ marginBottom: 24 }}>
            <TouchableOpacity
              onPress={openSumsub}
              disabled={launching}
              style={{
                backgroundColor: launching ? Colors.gray[300] : Colors.primary,
                paddingVertical: 16,
                borderRadius: RADIUS_BUTTON,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {launching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{iv("verifyInstantly")}</Text>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 6 }}>{iv("sumsubSubtext")}</Text>

            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 16 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.gray[200] }} />
              <Text style={{ marginHorizontal: 12, fontSize: 12, color: Colors.gray[400] }}>{iv("orUploadManually")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.gray[200] }} />
            </View>
          </View>
        )}

        {/* Info banner when SumSub not available */}
        {canSubmit && !sumsubAvailable && (
          <View
            style={{
              backgroundColor: "#EFF6FF",
              borderRadius: RADIUS_CARD,
              padding: 16,
              marginBottom: 20,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
            <Text style={{ flex: 1, fontSize: 13, color: "#1e40af", lineHeight: 19 }}>{iv("manualOnlyInfo")}</Text>
          </View>
        )}

        {/* Manual upload form */}
        {canSubmit && (
          <>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{iv("documentType")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 }}>
              {DOCUMENT_TYPE_OPTIONS.map((opt) => {
                const label = iv(opt.labelKey);
                return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { setDocumentType(opt.value); haptic.light(); }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: RADIUS_INPUT,
                    backgroundColor: documentType === opt.value ? Colors.primary : Colors.gray[100],
                  }}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: documentType === opt.value }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: documentType === opt.value ? "#fff" : Colors.gray[700],
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
                );
              })}
            </View>

            <CountryOfIssuePicker
              value={country}
              onChange={setCountry}
              label={iv("countryOfIssue")}
              tenantRegionCode={bundle?.meta?.tenant_region?.code}
              tenantRegionName={bundle?.meta?.tenant_region?.name}
            />

            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>{iv("documentPhoto")}</Text>
            <TouchableOpacity
              onPress={pickDocument}
              style={{
                borderRadius: RADIUS_CARD,
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: selectedFile ? Colors.primary : Colors.gray[300],
                backgroundColor: selectedFile ? "#FDF2F8" : Colors.gray[50],
                padding: 24,
                alignItems: "center",
                marginBottom: 20,
              }}
              accessibilityLabel={selectedFile ? iv("a11yChangeDocumentPhoto") : iv("a11ySelectDocumentPhoto")}
              accessibilityRole="button"
            >
              {selectedFile ? (
                <>
                  <Ionicons name="document-attach" size={32} color={Colors.primary} style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                    {selectedFile.fileName}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 4 }}>{iv("tapToChange")}</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={32}
                    color={Colors.gray[400]}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>{iv("selectDocumentPhoto")}</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>{iv("fileTypesHint")}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={submitManual}
              disabled={uploading || !selectedFile || !country}
              style={{
                backgroundColor:
                  uploading || !selectedFile || !country
                    ? Colors.gray[300]
                    : Colors.primary,
                paddingVertical: 16,
                borderRadius: RADIUS_BUTTON,
                alignItems: "center",
              }}
              accessibilityLabel={uploading ? iv("a11ySubmitting") : iv("a11ySubmitVerification")}
              accessibilityRole="button"
            >
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{iv("submitForVerification")}</Text>
              )}
            </TouchableOpacity>

            <Text
              style={{ fontSize: 12, color: Colors.gray[500], marginTop: 16, textAlign: "center" }}
            >
              {iv("footerSecure")}
            </Text>
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
