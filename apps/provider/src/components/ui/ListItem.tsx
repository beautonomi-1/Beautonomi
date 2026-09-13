import { View, Text, TouchableOpacity } from "react-native";
import { twStyle } from "@/lib/twStyle";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface ListItemProps {
  title: string;
  subtitle?: string;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  borderBottom?: boolean;
}

export function ListItem({
  title,
  subtitle,
  leftContent,
  rightContent,
  showChevron = true,
  onPress,
  borderBottom = true,
}: ListItemProps) {
  return (
    <TouchableOpacity
      style={twStyle(`flex-row items-center py-3.5 ${borderBottom ? "border-b border-gray-100" : ""}`)}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {leftContent && <View style={twStyle("me-3")}>{leftContent}</View>}
      <View style={twStyle("flex-1")}>
        <Text style={twStyle("text-base font-medium text-gray-900")} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={twStyle("mt-0.5 text-sm text-gray-500")} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightContent && <View style={twStyle("ms-2")}>{rightContent}</View>}
      {showChevron && onPress && (
        <DirectionalIcon name="chevron-forward" size={18} color="#9ca3af" style={{ marginStart: 4 }} />
      )}
    </TouchableOpacity>
  );
}
