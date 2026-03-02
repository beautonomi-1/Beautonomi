import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from "react-native";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

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
    <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
    </View>
  );
}

function DocumentCard({
  doc,
  onDownload,
}: {
  doc: TaxDocument;
  onDownload: () => void;
}) {
  return (
    <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100 flex-row items-center justify-between">
      <View className="flex-1 mr-3">
        <Text className="font-medium text-gray-900">
          {doc.label ?? doc.type ?? "Tax Document"}
        </Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          {doc.year}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDownload}
        activeOpacity={0.7}
        className="bg-primary px-4 py-2 rounded-lg"
      >
        <Text className="text-white text-sm font-semibold">Download</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TaxesScreen() {
  useScreenTracking("Taxes");

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
        api.get<TaxInfo>("/api/me/tax-info"),
        api.get<TaxDocument[]>("/api/me/tax-documents"),
      ]);

      if (taxRes.error) {
        setError(taxRes.error.message || "Failed to load tax information");
      } else {
        const raw = taxRes.data;
        const obj = raw as unknown as Record<string, unknown>;
        if (obj?.tax_info) {
          setTaxInfo(obj.tax_info as TaxInfo);
        } else {
          setTaxInfo((raw as TaxInfo) ?? null);
        }
      }

      const rawDocs = docsRes.data;
      if (Array.isArray(rawDocs)) {
        setDocs(rawDocs);
      } else {
        const obj = rawDocs as unknown as Record<string, unknown>;
        const items = (obj?.documents ?? obj?.data ?? []) as TaxDocument[];
        setDocs(Array.isArray(items) ? items : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tax information");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const [taxRes, docsRes] = await Promise.all([
          api.get<TaxInfo>("/api/me/tax-info"),
          api.get<TaxDocument[]>("/api/me/tax-documents"),
        ]);

        if (cancelled) return;

        if (taxRes.error) {
          setError(taxRes.error.message || "Failed to load tax information");
        } else {
          const raw = taxRes.data;
          const obj = raw as unknown as Record<string, unknown>;
          if (obj?.tax_info) {
            setTaxInfo(obj.tax_info as TaxInfo);
          } else {
            setTaxInfo((raw as TaxInfo) ?? null);
          }
        }

        const rawDocs = docsRes.data;
        if (Array.isArray(rawDocs)) {
          setDocs(rawDocs);
        } else {
          const obj = rawDocs as unknown as Record<string, unknown>;
          const items = (obj?.documents ?? obj?.data ?? []) as TaxDocument[];
          setDocs(Array.isArray(items) ? items : []);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load tax information");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      /* silently fail if URL can't be opened */
    });
  }, []);

  // Loading state
  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading…</Text>
      </View>
    );
  }

  // Error state
  if (error && !taxInfo && docs.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        <TouchableOpacity
          onPress={() => load()}
          className="bg-primary px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{
        padding: SCREEN_PADDING,
        paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={Colors.primary}
        />
      }
    >
      {/* ── Section 1: Tax Information ── */}
      <View className="mb-6">
        <Text className="text-lg font-semibold text-gray-900 mb-3">
          Tax Information
        </Text>

        {taxInfo ? (
          <View className="bg-white rounded-xl px-4 border border-gray-100">
            <InfoRow
              label="Country"
              value={taxInfo.country || "Not specified"}
            />
            <InfoRow
              label="VAT / Tax ID"
              value={taxInfo.vat_id || taxInfo.tax_id || "Not provided"}
            />
            <View className="flex-row justify-between items-center py-3">
              <Text className="text-sm text-gray-500">Tax Status</Text>
              <View className="bg-primary-light px-3 py-1 rounded-full">
                <Text className="text-xs font-semibold text-primary">
                  {formatTaxStatus(taxInfo.tax_status)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View className="bg-white rounded-xl p-5 border border-gray-100">
            <Text className="text-gray-500 text-sm leading-5">
              No tax information on file. Tax information may be required for
              certain services.
            </Text>
          </View>
        )}
      </View>

      {/* ── Section 2: Tax Documents ── */}
      <View>
        <Text className="text-lg font-semibold text-gray-900 mb-3">
          Tax Documents
        </Text>

        {docs.length === 0 ? (
          <View className="bg-white rounded-xl p-5 border border-gray-100">
            <Text className="text-gray-500 text-sm">
              No tax documents available
            </Text>
          </View>
        ) : (
          docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDownload={() => handleDownload(doc.download_url)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
