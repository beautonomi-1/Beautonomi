import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

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
    <View className="mb-4 flex-row items-center justify-between pt-2">
      <View className="flex-1 flex-row items-center">
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBack}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-gray-100"
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color="#111" />
          </TouchableOpacity>
        )}
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-sm text-gray-500">{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {rightAction && <View className="ml-3">{rightAction}</View>}
    </View>
  );
}
