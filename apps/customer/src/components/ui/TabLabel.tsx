import { Text, type TextProps } from "react-native";

type TabLabelProps = TextProps & {
  children: string;
};

/** Tab bar label that shrinks instead of ellipsizing on long translations. */
export function TabLabel({ children, style, ...rest }: TabLabelProps) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      style={[{ textAlign: "center" }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
