import React from "react";
import { View, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import {
  PROVIDER_GALLERY_CONTENT_POSITION,
  providerGalleryFrameHeight,
} from "@beautonomi/utils";

export type ProviderGalleryImageProps = {
  uri: string;
  width: number;
  borderRadius?: number;
  style?: ViewStyle;
  priority?: ImageProps["priority"];
  accessibilityLabel?: string;
};

/**
 * Portrait gallery tile: fixed 4:5 frame, cover crop, center-weighted focus.
 */
export function ProviderGalleryImage({
  uri,
  width,
  borderRadius = 0,
  style,
  priority,
  accessibilityLabel,
}: ProviderGalleryImageProps) {
  const height = providerGalleryFrameHeight(width);

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          overflow: "hidden",
          backgroundColor: "#E5E7EB",
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <Image
        source={{ uri }}
        style={{ width, height }}
        contentFit="cover"
        contentPosition={PROVIDER_GALLERY_CONTENT_POSITION}
        cachePolicy="memory-disk"
        priority={priority}
      />
    </View>
  );
}
