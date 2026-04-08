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
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { haptic } from "@/lib/haptics";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { APP_URL } from "@/config/public-env";

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
] as const;

interface VerificationStatus {
  verified: boolean;
  status: string;
  submitted_at?: string;
  sumsub_available: boolean;
  manual_verification?: {
    id: string;
    status: string;
    document_type: string;
    submitted_at: string;
  } | null;
}

export default function IdentityVerificationScreen() {
  useScreenTracking("Identity Verification");
  const { bundle } = useConfigBundle();
  const env = bundle?.meta?.env ?? "production";
  const countryPlaceholder = bundle?.meta?.tenant_region?.name?.trim()
    ? `e.g. ${bundle.meta.tenant_region.name}`
    : "e.g. South Africa";

  const [statusData, setStatusData] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual upload state
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>("license");
  const [country, setCountry] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);

  // SumSub launch state
  const [launching, setLaunching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<VerificationStatus>(
        `/api/me/verification?environment=${encodeURIComponent(env)}`
      );
      const d = res.data as any;
      setStatusData({
        verified: d?.verified ?? false,
        status: d?.status ?? "none",
        submitted_at: d?.submitted_at,
        sumsub_available: d?.sumsub_available ?? false,
        manual_verification: d?.manual_verification ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStatusData(null);
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── SumSub flow ────────────────────────────────────────────────────────
  const openSumsub = useCallback(async () => {
    haptic.light();
    setLaunching(true);
    try {
      const res = await api.get<{ access_token: string; refresh_token?: string }>(
        `/api/me/verification/sumsub/token?environment=${encodeURIComponent(env)}`
      );
      const access_token = res.data?.access_token;
      const refresh_token = (res.data as any)?.refresh_token;
      if (!access_token) {
        Alert.alert(
          "Automated verification unavailable",
          "Please use the manual document upload below to submit your ID."
        );
        return;
      }
      const base = (APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const hash = `token=${encodeURIComponent(access_token)}${
        refresh_token ? `&refresh_token=${encodeURIComponent(refresh_token)}` : ""
      }`;
      await Linking.openURL(`${base}/account-settings/verification/embed#${hash}`);
    } catch {
      Alert.alert("Error", "Could not start verification. Please use the manual upload below.");
    } finally {
      setLaunching(false);
    }
  }, [env]);

  // ─── Manual upload ───────────────────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm !== "granted") {
        Alert.alert("Permission needed", "Allow access to photos to upload your document.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        fileName: asset.fileName ?? `verification-${Date.now()}.jpg`,
      });
      haptic.light();
    } catch {
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const submitManual = async () => {
    if (!selectedFile || !country.trim()) {
      Alert.alert("Missing info", "Please select a document and enter the country of issue.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", {
        uri: selectedFile.uri,
        name: selectedFile.fileName,
        type: "image/jpeg",
      } as any);
      formData.append("document_type", documentType);
      formData.append("country", country.trim());

      const res = await api.post<{ verification_id?: string; status?: string }>(
        "/api/me/verification",
        formData as any
      );

      if (res.error) {
        Alert.alert("Upload failed", (res.error as any)?.message ?? "Could not upload document.");
        return;
      }
      haptic.success();
      Alert.alert(
        "Submitted",
        "Your document has been submitted. We'll notify you once it's reviewed — usually within 1–2 business days."
      );
      setSelectedFile(null);
      setCountry("");
      load();
    } catch {
      Alert.alert("Error", "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const isVerified = statusData?.verified;
  const isUnderReview =
    statusData?.status === "pending" ||
    statusData?.manual_verification?.status === "pending";
  const sumsubAvailable = statusData?.sumsub_available ?? false;

  // ─── Verified screen ────────────────────────────────────────────────────
  if (isVerified) {
    return (
      <ScreenFrame loading={false} error={null}>
        <View style={{ padding: 20, alignItems: "center" }}>
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
            Identity verified
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center" }}>
            Your identity has been verified. Thank you.
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Under review banner */}
        {isUnderReview && (
          <View
            style={{
              backgroundColor: "#FEF3C7",
              borderRadius: RADIUS_CARD,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E" }}>Under review</Text>
            <Text style={{ fontSize: 13, color: "#B45309", marginTop: 4 }}>
              Your document has been submitted. {"We'll"} notify you once verification is complete.
            </Text>
          </View>
        )}

        {/* SumSub automated option — shown when available AND not already under review */}
        {sumsubAvailable && !isUnderReview && (
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
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                    Verify instantly
                  </Text>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 6 }}>
              Automated ID check — takes about 2 minutes
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 16 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.gray[200] }} />
              <Text style={{ marginHorizontal: 12, fontSize: 12, color: Colors.gray[400] }}>or upload manually</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: Colors.gray[200] }} />
            </View>
          </View>
        )}

        {/* Info banner when SumSub not available */}
        {!sumsubAvailable && !isUnderReview && (
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
            <Text style={{ flex: 1, fontSize: 13, color: "#1e40af", lineHeight: 19 }}>
              Automated ID checks are not available on this build yet. Use manual upload below — photos should be clear and
              uncropped. We usually review within 1–2 business days and you will see status updates here.
            </Text>
          </View>
        )}

        {/* Manual upload form — always shown unless already under review */}
        {!isUnderReview && (
          <>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
              Document type
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 8 }}>
              {DOC_TYPES.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { setDocumentType(opt.value); haptic.light(); }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: RADIUS_INPUT,
                    backgroundColor: documentType === opt.value ? Colors.primary : Colors.gray[100],
                  }}
                  accessibilityLabel={opt.label}
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
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
              Country of issue
            </Text>
            <TextInput
              style={{
                borderRadius: RADIUS_INPUT,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 16,
                color: Colors.gray[900],
                marginBottom: 16,
              }}
              value={country}
              onChangeText={setCountry}
              placeholder={countryPlaceholder}
              placeholderTextColor={Colors.gray[400]}
              autoCapitalize="words"
            />

            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>
              Document photo
            </Text>
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
              accessibilityLabel={selectedFile ? "Change document photo" : "Select document photo"}
              accessibilityRole="button"
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
                  <Ionicons
                    name="cloud-upload-outline"
                    size={32}
                    color={Colors.gray[400]}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                    Tap to select a photo of your document
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>
                    JPEG, PNG or WebP (max 10 MB)
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={submitManual}
              disabled={uploading || !selectedFile || !country.trim()}
              style={{
                backgroundColor:
                  uploading || !selectedFile || !country.trim()
                    ? Colors.gray[300]
                    : Colors.primary,
                paddingVertical: 16,
                borderRadius: RADIUS_BUTTON,
                alignItems: "center",
              }}
              accessibilityLabel={uploading ? "Submitting" : "Submit for verification"}
              accessibilityRole="button"
            >
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
                  Submit for verification
                </Text>
              )}
            </TouchableOpacity>

            <Text
              style={{ fontSize: 12, color: Colors.gray[500], marginTop: 16, textAlign: "center" }}
            >
              Your document is stored securely and used only for identity verification.
            </Text>
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}
