import { View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { ExplorePost } from "@/types/api";
import { explorePostGridImageUrl, firstSlideIsVideo } from "@/lib/explore-media";

const PHOTO_PLACEHOLDER = "https://placehold.co/400x500/f5f5f5/999?text=Beauty";

type Props = {
  post: ExplorePost;
  width: number;
  height: number;
};

/** Masonry / related-row tile: real JPEG for videos; black + play when poster missing. */
export function ExplorePostGridMedia({ post, width, height }: Props) {
  const isVideo = firstSlideIsVideo(post.media_urls, post.media_meta);
  const img = explorePostGridImageUrl(post);

  if (img) {
    return (
      <View style={{ width, height }}>
        <Image
          source={{ uri: img }}
          style={{ width, height }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
        {isVideo ? (
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
          </View>
        ) : null}
      </View>
    );
  }

  if (isVideo) {
    return (
      <View style={{ width, height, backgroundColor: "#000" }}>
        <View
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
        </View>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: PHOTO_PLACEHOLDER }}
      style={{ width, height }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
    />
  );
}
