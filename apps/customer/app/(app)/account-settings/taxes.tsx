import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxInfo {
  country: string | null;
  vat_id: string | null;
  tax_id: string | null;
  tax_status: string | null;
}

interface TaxDocument {
  id: string;
  year: number | string;
  type: string;
  label?: string | null;
  download_url: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTaxStatus(status: string | null): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{value}</Text>
    </View>
  );
}

function DocumentCard({ doc, onDownload }: { doc: TaxDocument; onDownload: () => void }) {
  const hasUrl = Boolean(doc.download_url);
  return (
    <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100], flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{doc.label ?? doc.type ?? "Tax Document"}</Text>
        <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>{doc.year}</Text>
        {!hasUrl && (
          <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>Not yet issued</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={hasUrl ? onDownload : undefined}
        activeOpacity={hasUrl ? 0.7 : 1}
        style={{
          backgroundColor: hasUrl ? Colors.primary : Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          opacity: hasUrl ? 1 : 0.6,
        }}
      >
        <Text style={{ color: hasUrl ? Colors.white : Colors.gray[500], fontSize: 14, fontWeight: "600" }}>
          Download
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TaxesScreen() {
  useScreenTracking("Taxes");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);
  const [docs, setDocs] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [taxRes, docsRes] = await Promise.all([
        api.get<Record<string, unknown>>("/api/me/tax-info"),
        api.get<unknown>("/api/me/tax-documents"),
      ]);

      if (taxRes.error) {
        setError(taxRes.error.message || "Failed to load tax information");
      } else {
        const raw = taxRes.data ?? {};
        // API returns { tax_info: {...}, vat_id: string|null }
        // Merge top-level vat_id into the tax_info object so the UI can display it
        const taxInfoObj = (raw.tax_info as TaxInfo | null) ?? (raw as unknown as TaxInfo) ?? null;
        const topLevelVatId = (raw.vat_id as string | null) ?? null;
        if (taxInfoObj) {
          setTaxInfo({ ...taxInfoObj, vat_id: topLevelVatId ?? taxInfoObj.vat_id });
        } else if (topLevelVatId) {
          setTaxInfo({ country: null, vat_id: topLevelVatId, tax_id: null, tax_status: null });
        } else {
          setTaxInfo(null);
        }
      }

      if (docsRes.error) {
        setDocs([]);
        if (!taxRes.error) {
          setError("Tax info loaded but documents could not be fetched.");
        }
      } else {
        const rawDocs = docsRes.data;
        if (Array.isArray(rawDocs)) {
          setDocs(rawDocs as TaxDocument[]);
        } else {
          const obj = rawDocs as Record<string, unknown>;
          const items = ((obj?.documents ?? obj?.data ?? []) as TaxDocument[]);
          setDocs(Array.isArray(items) ? items : []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tax information");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      /* silently fail if URL can't be opened */
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading…</Text>
      </View>
    );
  }

  if (error && !taxInfo && docs.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: STACK_CONTENT_PADDING_BOTTOM, ...constraint }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
    >
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>Tax Information</Text>
        {taxInfo ? (
          <View style={{ backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.gray[100] }}>
            <InfoRow label="Country" value={taxInfo.country || "Not specified"} />
            <InfoRow label="VAT / Tax ID" value={taxInfo.vat_id || taxInfo.tax_id || "Not provided"} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Tax Status</Text>
              <View style={{ backgroundColor: Colors.primaryLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}>{formatTaxStatus(taxInfo.tax_status)}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: Colors.gray[100] }}>
            <Text style={{ color: Colors.gray[500], fontSize: 14, lineHeight: 20 }}>
              No tax information on file. Tax information may be required for certain services.
            </Text>
          </View>
        )}
      </View>
      <View>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>Tax Documents</Text>
        {docs.length === 0 ? (
          <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: Colors.gray[100] }}>
            <Text style={{ color: Colors.gray[500], fontSize: 14 }}>No tax documents available</Text>
          </View>
        ) : (
          docs.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDownload={() => handleDownload(doc.download_url)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}
