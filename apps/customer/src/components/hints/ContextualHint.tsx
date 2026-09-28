import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { dismissHint, hintStorageKey, isHintDismissed } from "@/lib/contextual-hints/storage";
import { trackHintAction, trackHintDismissed, trackHintShown } from "@/lib/analytics";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

export type ContextualHintProps = {
  id: string;
  message: string;
  mode: "once" | "persistent";
  tone?: "info" | "warning";
  actionLabel?: string;
  onAction?: () => void;
};

const INFO = {
  bg: "#ECFDF5",
  border: "#A7F3D0",
  icon: "#047857",
  text: "#065F46",
};

const WARNING = {
  bg: "#FFFBEB",
  border: "#FDE68A",
  icon: "#B45309",
  text: "#92400E",
};

export function ContextualHint({
  id,
  message,
  mode,
  tone = "info",
  actionLabel,
  onAction,
}: ContextualHintProps) {
  const { t } = useTranslation();
  const hintsEnabled = useFeatureFlag("contextual_hints");
  const [ready, setReady] = useState(mode === "persistent");
  const [visible, setVisible] = useState(mode === "persistent");
  const shownLogged = useRef(false);
  const palette = tone === "warning" ? WARNING : INFO;

  useEffect(() => {
    if (mode !== "once") return;
    let cancelled = false;
    (async () => {
      const dismissed = await isHintDismissed(hintStorageKey(id));
      if (cancelled) return;
      setReady(true);
      setVisible(!dismissed);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  useEffect(() => {
    if (!visible || mode !== "once" || !hintsEnabled || shownLogged.current) return;
    shownLogged.current = true;
    trackHintShown(id, "customer");
  }, [visible, mode, hintsEnabled, id]);

  const onDismiss = useCallback(async () => {
    await dismissHint(hintStorageKey(id));
    trackHintDismissed(id, "customer");
    setVisible(false);
  }, [id]);

  const onPressAction = useCallback(() => {
    trackHintAction(id, "customer");
    onAction?.();
  }, [id, onAction]);

  if (mode === "once" && !hintsEnabled) return null;
  if (mode === "once" && !ready) return null;
  if (!visible) return null;

  const gotIt = t("common.hints.gotIt") as string;
  const dismissA11y = t("common.hints.dismissA11y") as string;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        padding: 12,
      }}
      accessibilityRole="text"
    >
      <Ionicons name="information-circle-outline" size={18} color={palette.icon} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, marginStart: 10 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: palette.text }}>{message}</Text>
        {(mode === "once" || actionLabel) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 10, gap: 12 }}>
            {actionLabel && onAction ? (
              <TouchableOpacity
                onPress={onPressAction}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: palette.icon }}>{actionLabel}</Text>
                <DirectionalIcon name="chevron-forward" size={16} color={palette.icon} style={{ marginStart: 2 }} />
              </TouchableOpacity>
            ) : null}
            {mode === "once" ? (
              <TouchableOpacity
                onPress={() => void onDismiss()}
                accessibilityRole="button"
                accessibilityLabel={dismissA11y}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: palette.icon }}>{gotIt}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
