/**
 * Execution history for a single automation — parity with web history dialog.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { twStyle } from "@/lib/twStyle";

type ExecutionRow = {
  id: string;
  executed_at: string;
  message_id?: string | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
};

export interface AutomationExecutionHistoryProps {
  visible: boolean;
  onClose: () => void;
  automationId: string | null;
  automationName: string;
}

export function AutomationExecutionHistory({
  visible,
  onClose,
  automationId,
  automationName,
}: AutomationExecutionHistoryProps) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !automationId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<ExecutionRow[]>(`/api/provider/automations/${automationId}/executions`);
        if (!cancelled && !res.error && res.data) {
          setRows(Array.isArray(res.data) ? res.data : []);
        } else if (!cancelled) {
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, automationId]);

  function formatWhen(iso: string): string {
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={twStyle("flex-1 justify-end bg-black/40")}>
        <View
          style={[
            twStyle("max-h-[85%] rounded-t-3xl bg-white"),
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={twStyle("flex-row items-center justify-between border-b border-gray-100 px-4 py-3")}>
            <Text style={twStyle("flex-1 pr-2 text-base font-semibold text-gray-900")} numberOfLines={2}>
              History: {automationName}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#374151" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={twStyle("items-center py-12")}>
              <ActivityIndicator />
              <Text style={twStyle("mt-2 text-sm text-gray-500")}>Loading…</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={twStyle("items-center px-6 py-12")}>
              <Ionicons name="time-outline" size={40} color="#d1d5db" />
              <Text style={twStyle("mt-3 text-center text-sm text-gray-500")}>
                No executions yet. This automation has not been triggered.
              </Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item: ExecutionRow) => item.id}
              contentContainerStyle={twStyle("px-4 pb-4")}
              renderItem={({ item }: { item: ExecutionRow }) => (
                <View
                  style={twStyle("mb-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5")}
                >
                  <Text style={twStyle("text-xs text-gray-500")}>{formatWhen(item.executed_at)}</Text>
                  <Text style={twStyle("mt-0.5 text-sm font-medium text-gray-900")}>
                    {item.customer?.full_name || item.customer?.email || "Unknown"}
                  </Text>
                  <View style={twStyle("mt-1 flex-row items-center justify-between")}>
                    <View
                      style={
                        item.message_id
                          ? twStyle("rounded-full bg-green-100 px-2 py-0.5")
                          : twStyle("rounded-full bg-amber-100 px-2 py-0.5")
                      }
                    >
                      <Text
                        style={
                          item.message_id
                            ? twStyle("text-xs font-medium text-green-800")
                            : twStyle("text-xs font-medium text-amber-900")
                        }
                      >
                        {item.message_id ? "Sent" : "Pending"}
                      </Text>
                    </View>
                    <Text style={twStyle("max-w-[48%] font-mono text-[10px] text-gray-500")} numberOfLines={1}>
                      {item.message_id || "—"}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
