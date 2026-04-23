import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface ReturnRequest {
  id: string;
  status: string;
  reason?: string | null;
  refund_amount?: number | string | null;
  quantity?: number;
  created_at: string;
  order?: { order_number?: string; total_amount?: number };
  customer?: { full_name?: string | null; email?: string | null };
}

interface ReturnsListResponse {
  returns: ReturnRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "item_received", label: "Received" },
  { value: "refunded", label: "Refunded" },
];

/** Content-only for use in Orders hub (Returns tab). */
export function ProductReturnsContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [viewReturn, setViewReturn] = useState<ReturnRequest | null>(null);
  const [detail, setDetail] = useState<ReturnRequest | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rejectNoteModal, setRejectNoteModal] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  // §Provider-audit 2026-04 (C3): web lets the provider pick the return
  // method at approval time. Mobile previously hardcoded `drop_off`, which
  // broke couriers that use pickup. Expose the same two-option chooser.
  const [returnMethod, setReturnMethod] = useState<"drop_off" | "ship_back">("drop_off");

  const url = `/api/provider/returns?limit=50${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error, refresh } = useApi<ReturnsListResponse>(url);
  const { execute: patchReturn } = useApiMutation("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const returnsList = data?.returns ?? [];

  const openReturn = useCallback(async (r: ReturnRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewReturn(r);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<{ return_request: ReturnRequest }>(`/api/provider/returns/${r.id}`);
      if (res.data?.return_request) setDetail(res.data.return_request);
      else setDetail(r);
    } catch {
      setDetail(r);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const performAction = useCallback(
    (action: string, extra?: Record<string, unknown>) => {
      if (!detail) return;
      const body = { action, ...extra };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      patchReturn(`/api/provider/returns/${detail.id}`, body).then(({ error: err }) => {
        if (err) Alert.alert("Error", err);
        else {
          setViewReturn(null);
          setDetail(null);
          refresh();
        }
      });
    },
    [detail, patchReturn, refresh]
  );

  const getActions = (status: string): { action: string; label: string }[] => {
    if (status === "pending") return [{ action: "approve", label: "Approve" }, { action: "reject", label: "Reject" }];
    if (status === "approved") return [{ action: "mark_received", label: "Mark item received" }];
    if (status === "item_received") return [{ action: "process_refund", label: "Process refund" }];
    return [];
  };

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <View style={twStyle("mb-2 flex-row flex-wrap px-4")}>
        {STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value || "all"}
            onPress={() => setStatusFilter(opt.value)}
            style={[twStyle(`rounded-full px-3 py-1.5 ${statusFilter === opt.value ? "bg-red-600" : "bg-gray-100"}`), { marginRight: 8, marginBottom: 8 }]}
          >
            <Text
              style={twStyle(`text-xs font-medium ${statusFilter === opt.value ? "text-white" : "text-gray-700"}`)}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {returnsList.length === 0 ? (
          <View style={twStyle("items-center py-16")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100")}>
              <Ionicons name="arrow-undo-outline" size={32} color="#ef4444" />
            </View>
            <Text style={twStyle("text-center font-semibold text-gray-900")}>No return requests</Text>
            <Text style={twStyle("mt-1 text-center text-sm text-gray-500")}>
              {statusFilter ? `No returns with status "${statusFilter}".` : "Return requests will appear here."}
            </Text>
          </View>
        ) : (
          returnsList.map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => openReturn(r)}
              activeOpacity={0.7}
              style={twStyle("mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4")}
            >
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-red-100")}>
                <Ionicons name="arrow-undo-outline" size={20} color="#ef4444" />
              </View>
              <View style={twStyle("ml-3 flex-1 min-w-0")}>
                <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                  {r.order?.order_number ?? r.id.slice(0, 8)}
                </Text>
                <Text style={twStyle("mt-0.5 text-sm text-gray-600")}>
                  {r.customer?.full_name ?? "Customer"}
                  {r.refund_amount != null ? ` · ${formatCurrency(Number(r.refund_amount))}` : ""}
                </Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{r.status}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {viewReturn && (
        <BottomSheet
          visible={!!viewReturn}
          onClose={() => setViewReturn(null)}
          title={detail?.order?.order_number ?? "Return"}
          subtitle={detail?.customer?.full_name ?? "Return request"}
        >
          {loadingDetail ? (
            <View style={twStyle("items-center py-6")}>
              <LoadingState />
            </View>
          ) : detail ? (
            <>
              <View style={twStyle("mb-3 flex-row flex-wrap")}>
                <View style={[twStyle("rounded-full bg-gray-100 px-2.5 py-1"), { marginRight: 8, marginBottom: 8 }]}>
                  <Text style={twStyle("text-xs font-medium text-gray-700")}>{detail.status}</Text>
                </View>
              </View>
              {detail.reason ? (
                <Text style={twStyle("mb-3 text-sm text-gray-600")}>Reason: {detail.reason}</Text>
              ) : null}
              {detail.refund_amount != null && (
                <Text style={twStyle("mb-3 text-sm font-medium text-gray-900")}>
                  Refund amount: {formatCurrency(Number(detail.refund_amount))}
                </Text>
              )}
              {/* Return method chooser only surfaces when approval is a valid action */}
              {getActions(detail.status).some((a) => a.action === "approve") && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={twStyle("mb-2 text-xs font-medium uppercase text-gray-500")}>Return method</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {([
                      { value: "drop_off", label: "Drop off" },
                      { value: "ship_back", label: "Ship back" },
                    ] as const).map((opt) => {
                      const selected = returnMethod === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() => setReturnMethod(opt.value)}
                          style={twStyle(
                            `flex-1 rounded-xl border py-2 ${selected ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white"}`,
                          )}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text
                            style={twStyle(
                              `text-center text-sm font-medium ${selected ? "text-emerald-700" : "text-gray-700"}`,
                            )}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {getActions(detail.status).map(({ action, label }) => (
                <TouchableOpacity
                  key={action}
                  onPress={() => {
                    if (action === "reject") {
                      setRejectNote("");
                      setRejectNoteModal(true);
                    } else if (action === "approve") {
                      performAction("approve", { return_method: returnMethod, resolution: "full_refund" });
                    } else {
                      performAction(action);
                    }
                  }}
                  style={twStyle(`mb-2 rounded-xl py-3 ${action === "reject" ? "bg-red-50" : "bg-emerald-50"}`)}
                >
                  <Text
                    style={twStyle(`text-center text-sm font-medium ${action === "reject" ? "text-red-600" : "text-emerald-700"}`)}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
              {getActions(detail.status).length === 0 && (
                <Text style={twStyle("text-sm text-gray-500")}>No further actions for this status.</Text>
              )}
            </>
          ) : null}
        </BottomSheet>
      )}

      <Modal visible={rejectNoteModal} transparent animationType="fade" onRequestClose={() => setRejectNoteModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }} onPress={() => setRejectNoteModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, marginHorizontal: 24, width: 320 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Reject return</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 8 }}>Add a note for the customer (optional):</Text>
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="e.g. Item was used, outside return window"
              multiline
              style={{ borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 12, fontSize: 14, minHeight: 72, textAlignVertical: "top", marginBottom: 16 }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setRejectNoteModal(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB", alignItems: "center" }}>
                <Text style={{ fontWeight: "600", color: "#374151" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setRejectNoteModal(false);
                  performAction("reject", rejectNote.trim() ? { note: rejectNote.trim() } : undefined);
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#DC2626", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "600", color: "#fff" }}>Reject</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function ProductReturnsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Returns & Refunds" showBack subtitle="Return requests" />
      <ProductReturnsContent />
    </ScreenContainer>
  );
}
