import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** When provided, used instead of router.back() for the back button. Use for cross-tab navigation so tab state stays correct. */
  onBack?: () => void;
  rightAction?: React.ReactNode;
  /**
   * Optional content rendered between the back button and the title.
   * Use for avatars / thumbnails in chat or detail headers.
   */
  leadingContent?: React.ReactNode;
  /**
   * Optional content rendered immediately after the title (same row).
   * Use for inline status chips such as a verified badge.
   */
  titleAccessory?: React.ReactNode;
}

const MORE_TAB_HREF = "/(app)/(tabs)/more" as const;

export function ScreenHeader({ title, subtitle, showBack, onBack, rightAction, leadingContent, titleAccessory }: ScreenHeaderProps) {
  const router = useRouter();
  const handleBack =
    onBack ??
    (() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(MORE_TAB_HREF as never);
      }
    });
  const showBackButton = showBack ?? !!onBack;

  return (
    <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBack}
            // §UI-audit 2026-04: raised from 40x40 to 44x44 to hit the
            // HIG touch-target minimum without changing visual weight.
            style={{ marginRight: 12, height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: Colors.gray[100] }}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color="#111" />
          </TouchableOpacity>
        )}
        {leadingContent}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{ flexShrink: 1, fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {titleAccessory ? (
              <View style={{ marginLeft: 8, flexShrink: 0 }}>{titleAccessory}</View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {rightAction ? (
      <View style={{ marginLeft: 12, flexShrink: 0, alignSelf: "flex-start" }}>{rightAction}</View>
    ) : null}
    </View>
  );
}
