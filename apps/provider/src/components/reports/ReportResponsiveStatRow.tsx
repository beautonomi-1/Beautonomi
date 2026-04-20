import { type ReactNode, Children } from "react";
import { View, useWindowDimensions } from "react-native";

type Props = {
  children: ReactNode;
};

/**
 * Responsive stat layout: cards wrap with a sensible minimum width so figures stay readable on narrow phones.
 */
export function ReportResponsiveStatRow({ children }: Props) {
  const { width } = useWindowDimensions();
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;

  const minCardStyle = width < 380 ? { minWidth: "100%" as const } : { minWidth: 158 };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, rowGap: 12 }}>
      {items.map((child, i) => (
        <View
          key={i}
          style={[
            {
              flexGrow: 1,
              flexShrink: 1,
              maxWidth: "100%",
              paddingHorizontal: 6,
            },
            minCardStyle,
          ]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
