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
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { RADIUS_CARD, RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { haptic } from "@/lib/haptics";

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
] as const;

export default function IdentityVerificationScreen() {
  useScreenTracking("Identity Verification");
  const [status, setStatus] = useState<{ verified: boolean; status: string; submitted_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>("license");
  const [country, setCountry] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ verified?: boolean; status?: string; submitted_at?: string }>("/api/me/verification");
      const data = res.data as any;
      setStatus({
        verified: data?.verified ?? false,
        status: data?.status ?? "none",
        submitted_at: data?.submitted_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to pick image");
    }
  };

  const submit = async () => {
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

      const res = await api.post<{ verification_id?: string; status?: string }>("/api/me/verification", formData as any);

      if (res.error) {
        Alert.alert("Upload failed", (res.error as any)?.message ?? "Could not upload document.");
        return;
      }
      haptic.success();
      Alert.alert("Submitted", "Your document has been submitted for verification. We'll notify you once it's reviewed.");
      setSelectedFile(null);
      setCountry("");
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (status?.verified) {
    return (
      <ScreenFrame loading={false} error={null}>
        <View style={{ padding: 20, alignItems: "center" }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="shield-checkmark" size={32} color="#059669" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Identity verified</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], textAlign: "center" }}>Your identity has been verified. Thank you.</Text>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" accessibilityLabel="Identity verification form" accessibilityRole="none">
        {status?.status === "pending" && (
          <View style={{ backgroundColor: "#FEF3C7", borderRadius: RADIUS_CARD, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E" }}>Under review</Text>
            <Text style={{ fontSize: 13, color: "#B45309", marginTop: 4 }}>Your document has been submitted. {"We'll"} notify you once verification is complete.</Text>
          </View>
        )}

        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Document type</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "600", color: documentType === opt.value ? "#fff" : Colors.gray[700] }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Country of issue</Text>
        <TextInput
          style={{ borderRadius: RADIUS_INPUT, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.gray[900], marginBottom: 16 }}
          value={country}
          onChangeText={setCountry}
          placeholder="e.g. South Africa"
          placeholderTextColor={Colors.gray[400]}
          autoCapitalize="words"
          accessibilityLabel="Country of issue"
          accessibilityRole="none"
        />

        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Document photo</Text>
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
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{selectedFile.fileName}</Text>
              <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 4 }}>Tap to change</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color={Colors.gray[400]} style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>Tap to select a photo of your document</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>JPEG, PNG or WebP (max 10MB)</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={submit}
          disabled={uploading || !selectedFile || !country.trim()}
          style={{
            backgroundColor: uploading || !selectedFile || !country.trim() ? Colors.gray[300] : Colors.primary,
            paddingVertical: 16,
            borderRadius: RADIUS_BUTTON,
            alignItems: "center",
          }}
          accessibilityLabel={uploading ? "Submitting verification" : "Submit for verification"}
          accessibilityRole="button"
          accessibilityState={{ disabled: uploading || !selectedFile || !country.trim() }}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Submit for verification</Text>
          )}
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 16, textAlign: "center" }}>
          Your document is stored securely and used only for identity verification. {"We'll"} review it within a few business days.
        </Text>
      </ScrollView>
    </ScreenFrame>
  );
}
