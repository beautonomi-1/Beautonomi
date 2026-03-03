import { useState, useCallback } from "react";
import { View, Text, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { Colors } from "@/constants/colors";

interface ImageWithFallbackProps extends Omit<ImageProps, "onError"> {
  /** Fallback text to show (typically initials) */
  fallbackText?: string;
  /** Fallback background color */
  fallbackColor?: string;
  /** Style for the container */
  containerStyle?: ViewStyle;
}

/**
 * Image component with built-in error handling and fallback UI.
 * When the image fails to load, shows a colored circle with initials.
 */
export function ImageWithFallback({
  source,
  fallbackText = "?",
  fallbackColor,
  containerStyle,
  style,
  ...imageProps
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const bgColor = fallbackColor ?? Colors.primaryLight;
  const imageStyle = style as ViewStyle | undefined;
  const width = imageStyle?.width ?? 48;
  const height = imageStyle?.height ?? 48;
  const borderRadius = imageStyle?.borderRadius ?? 8;

  if (hasError || !source) {
    return (
      <View
        style={[
          {
            width: width as number,
            height: height as number,
            borderRadius: borderRadius as number,
            backgroundColor: bgColor,
            alignItems: "center",
            justifyContent: "center",
          },
          containerStyle,
        ]}
        accessibilityRole="image"
        accessibilityLabel={`${fallbackText} fallback image`}
      >
        <Text
          style={{
            color: Colors.primary,
            fontWeight: "700",
            fontSize: Math.max(12, (width as number) / 3),
          }}
        >
          {fallbackText.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
      onError={handleError}
      accessibilityRole="image"
      {...imageProps}
    />
  );
}
