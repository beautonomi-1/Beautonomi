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
}

const MORE_TAB_HREF = "/(app)/(tabs)/more" as const;

export function ScreenHeader({ title, subtitle, showBack, onBack, rightAction }: ScreenHeaderProps) {
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
            style={{ marginRight: 12, height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: Colors.gray[100] }}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color="#111" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {rightAction && <View style={{ marginLeft: 12 }}>{rightAction}</View>}
    </View>
  );
}
