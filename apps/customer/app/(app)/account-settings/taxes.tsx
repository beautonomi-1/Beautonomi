import { useEffect, useState, useCallback, useMemo } from "react";
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
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { getBackendUrl } from "@/config/public-env";
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
  /** When set (absolute https or /api/...), the app enables Download. */
  download_url?: string | null;
  document_url?: string | null;
  status?: string;
  issued_at?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTaxStatus(status: string | null): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

/** API returns `tax_info` JSONB (country, tax_id, …) plus optional top-level `vat_id`. */
function parseTaxPayload(raw: Record<string, unknown>): TaxInfo | null {
  const topVat = typeof raw.vat_id === "string" && raw.vat_id.trim() ? raw.vat_id.trim() : null;
  const ti = raw.tax_info;
  if (ti && typeof ti === "object" && !Array.isArray(ti)) {
    const o = ti as Record<string, unknown>;
    const country = typeof o.country === "string" ? o.country : null;
    const tax_id = typeof o.tax_id === "string" ? o.tax_id : null;
    const nestedVat = typeof o.vat_id === "string" ? o.vat_id : null;
    const tax_status = typeof o.tax_status === "string" ? o.tax_status : null;
    const vat_id = topVat ?? nestedVat;
    if (country || tax_id || vat_id || tax_status) {
      return { country, vat_id, tax_id, tax_status };
    }
  }
  if (topVat) return { country: null, vat_id: topVat, tax_id: null, tax_status: null };
  return null;
}

function resolveDownloadUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const base = getBackendUrl().replace(/\/$/, "");
  if (!base) return null;
  return `${base}${u.startsWith("/") ? u : `/${u}`}`;
}

/** Non-empty URL from either field — backend may send `download_url` and/or `document_url`. */
function getDocumentDownloadSource(doc: TaxDocument): string {
  const a = typeof doc.download_url === "string" ? doc.download_url.trim() : "";
  const b = typeof doc.document_url === "string" ? doc.document_url.trim() : "";
  return a || b;
}

function normalizeTaxDocument(raw: unknown, index: number): TaxDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id =
    typeof o.id === "string" && o.id.trim()
      ? o.id.trim()
      : `tax-doc-${index}-${typeof o.year === "number" ? o.year : "row"}`;
  const year = typeof o.year === "number" ? o.year : typeof o.year === "string" ? o.year : new Date().getFullYear();
  const type = typeof o.type === "string" ? o.type : "document";
  const label = typeof o.label === "string" ? o.label : null;
  const download_url = typeof o.download_url === "string" ? o.download_url : null;
  const document_url = typeof o.document_url === "string" ? o.document_url : null;
  const status = typeof o.status === "string" ? o.status : undefined;
  const issued_at = typeof o.issued_at === "string" ? o.issued_at : null;
  return {
    id,
    year,
    type,
    label,
    download_url,
    document_url,
    status,
    issued_at,
  };
}

function parseTaxDocumentsPayload(payload: unknown): TaxDocument[] {
  if (Array.isArray(payload)) {
    return payload.map((row, i) => normalizeTaxDocument(row, i)).filter(Boolean) as TaxDocument[];
  }
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    const inner = o.documents ?? o.data ?? o.items;
    if (Array.isArray(inner)) {
      return inner.map((row, i) => normalizeTaxDocument(row, i)).filter(Boolean) as TaxDocument[];
    }
    if (inner && typeof inner === "object" && Array.isArray((inner as { documents?: unknown }).documents)) {
      const arr = (inner as { documents: unknown[] }).documents;
      return arr.map((row, i) => normalizeTaxDocument(row, i)).filter(Boolean) as TaxDocument[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.gray[100],
      }}
    >
      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{value}</Text>
    </View>
  );
}

function DocumentCard({ doc, onDownload }: { doc: TaxDocument; onDownload: (url: string) => void }) {
  const rawUrl = getDocumentDownloadSource(doc);
  const hasUrl = Boolean(rawUrl);

  let subtitle = String(doc.year ?? "");
  if (doc.issued_at && hasUrl) {
    try {
      const d = new Date(doc.issued_at);
      if (Number.isFinite(d.getTime())) {
        subtitle = `${subtitle} · Issued ${d.toLocaleDateString()}`;
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <View
      style={{
        backgroundColor: Colors.white,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.gray[100],
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{doc.label ?? doc.type ?? "Tax document"}</Text>
        <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 2 }}>{subtitle}</Text>
        {!hasUrl && (
          <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 4 }}>
            {doc.status === "not_issued" || !doc.status ? "Not yet issued — download appears when a file is available." : formatTaxStatus(doc.status ?? null)}
          </Text>
        )}
        {hasUrl && (
          <Text style={{ fontSize: 12, color: Colors.success, marginTop: 4, fontWeight: "500" }}>Ready to download</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={hasUrl ? () => onDownload(rawUrl) : undefined}
        disabled={!hasUrl}
        activeOpacity={hasUrl ? 0.7 : 1}
        style={{
          backgroundColor: hasUrl ? Colors.primary : Colors.gray[200],
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          opacity: hasUrl ? 1 : 0.65,
        }}
        accessibilityRole="button"
        accessibilityLabel={hasUrl ? `Download ${doc.label ?? "tax document"}` : "Download unavailable"}
        accessibilityHint={hasUrl ? "Opens the PDF or file in your browser" : undefined}
        accessibilityState={{ disabled: !hasUrl }}
      >
        <Text style={{ color: hasUrl ? Colors.white : Colors.gray[500], fontSize: 14, fontWeight: "600" }}>
          {hasUrl ? "Download" : "Unavailable"}
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
  const router = useRouter();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint =
    isTablet || Platform.OS === "web" ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const webBaseUrl = getBackendUrl()?.trim();

  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);
  const [docs, setDocs] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setFatalError(null);
    setDocumentsError(null);

    try {
      const [taxRes, docsRes] = await Promise.all([
        api.get<Record<string, unknown>>("/api/me/tax-info"),
        api.get<unknown>("/api/me/tax-documents"),
      ]);

      if (taxRes.error) {
        setFatalError(taxRes.error.message || "Failed to load tax information");
        setTaxInfo(null);
      } else {
        const raw = (taxRes.data ?? {}) as Record<string, unknown>;
        setTaxInfo(parseTaxPayload(raw));
      }

      if (docsRes.error) {
        setDocs([]);
        setDocumentsError(docsRes.error.message || "Could not load tax document list.");
      } else {
        const rawDocs = docsRes.data as unknown;
        const parsed = parseTaxDocumentsPayload(rawDocs);
        setDocs(parsed);
      }
    } catch (e) {
      setFatalError(e instanceof Error ? e.message : "Failed to load tax information");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = useCallback((url: string) => {
    const resolved = resolveDownloadUrl(url);
    if (!resolved) return;
    Linking.openURL(resolved).catch(() => {
      /* silently fail if URL can't be opened */
    });
  }, []);

  const openWebTaxSettings = useCallback(() => {
    const base = webBaseUrl?.replace(/\/$/, "") ?? "";
    if (!base) return;
    const url = `${base}/account-settings/taxes`;
    router.push({
      pathname: "/(app)/in-app-browser",
      params: { url: encodeURIComponent(url), title: "Tax & VAT settings" },
    });
  }, [router, webBaseUrl]);

  const hasAnyContent = useMemo(() => taxInfo !== null || docs.length > 0, [taxInfo, docs.length]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading…</Text>
      </View>
    );
  }

  if (fatalError && !hasAnyContent) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{fatalError}</Text>
        <TouchableOpacity
          onPress={() => load()}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: STACK_CONTENT_PADDING_BOTTOM, ...constraint }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
    >
      <View
        style={{
          marginBottom: 16,
          padding: 14,
          borderRadius: 12,
          backgroundColor: "#EFF6FF",
          borderWidth: 1,
          borderColor: "#BFDBFE",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>About tax & VAT on mobile</Text>
        <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 20 }}>
          This screen shows a read-only summary of taxpayer details we have on file and any annual summaries the platform issues.
          Editing tax numbers, VAT ID, and address — and managing invoice settings — is done on the website for now (web-first by
          design). Fully native forms would be a follow-up if you want parity without opening the site.
        </Text>
        <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 20, marginTop: 10 }}>
          When real PDFs or files exist in storage, the API should return <Text style={{ fontWeight: "600" }}>download_url</Text>{" "}
          (absolute URL or a path such as <Text style={{ fontWeight: "600" }}>/api/…</Text>) and/or <Text style={{ fontWeight: "600" }}>document_url</Text>{" "}
          — the Download button enables automatically for that row.
        </Text>
        {webBaseUrl ? (
          <TouchableOpacity
            onPress={openWebTaxSettings}
            style={{
              marginTop: 12,
              alignSelf: "flex-start",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: Colors.primary,
            }}
            accessibilityRole="button"
            accessibilityLabel="Open tax and VAT settings on the website"
          >
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>Edit tax & VAT on the web</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ marginTop: 10, fontSize: 12, color: Colors.gray[600] }}>
            Set EXPO_PUBLIC_APP_URL in your build to open the web tax settings screen.
          </Text>
        )}
      </View>

      {fatalError && hasAnyContent ? (
        <View
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FECACA",
          }}
        >
          <Text style={{ fontSize: 13, color: "#991B1B" }}>{fatalError}</Text>
          <TouchableOpacity onPress={() => load()} style={{ marginTop: 8 }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {documentsError ? (
        <View
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#FFFBEB",
            borderWidth: 1,
            borderColor: "#FDE68A",
          }}
        >
          <Text style={{ fontSize: 13, color: "#92400E" }}>{documentsError}</Text>
        </View>
      ) : null}

      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>Tax information</Text>
        {taxInfo ? (
          <View
            style={{
              backgroundColor: Colors.white,
              borderRadius: 12,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <InfoRow label="Country" value={taxInfo.country || "Not specified"} />
            <InfoRow label="VAT / Tax ID" value={taxInfo.vat_id || taxInfo.tax_id || "Not provided"} />
            {taxInfo.tax_status ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Tax status</Text>
                <View
                  style={{
                    backgroundColor: Colors.primaryLight,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 9999,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}>
                    {formatTaxStatus(taxInfo.tax_status)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: Colors.white,
              borderRadius: 12,
              padding: 20,
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <Text style={{ color: Colors.gray[500], fontSize: 14, lineHeight: 20 }}>
              No tax information on file yet. Use &quot;Edit tax & VAT on the web&quot; above to add your details.
            </Text>
          </View>
        )}
      </View>

      <View>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Tax documents</Text>
        <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12, lineHeight: 18 }}>
          Yearly summaries appear here. Until a file is generated, the row stays unavailable; when the API provides a URL,
          Download opens it (signed URLs and relative API paths are supported).
        </Text>
        {docs.length === 0 ? (
          <View
            style={{
              backgroundColor: Colors.white,
              borderRadius: 12,
              padding: 20,
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <Text style={{ color: Colors.gray[500], fontSize: 14 }}>
              {documentsError ? "Could not load the document list." : "No tax document rows returned yet."}
            </Text>
          </View>
        ) : (
          docs.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDownload={handleDownload} />
          ))
        )}
      </View>
    </ScrollView>
  );
}
