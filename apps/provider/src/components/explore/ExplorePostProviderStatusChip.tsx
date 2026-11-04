import { Text, View } from "react-native";
import { providerExplorePostBadge } from "@/lib/provider-explore-post-status";

type PostLike = Parameters<typeof providerExplorePostBadge>[0] & {
  is_hidden?: boolean | null;
  moderation_notes?: string | null;
};

export function ExplorePostProviderStatusChip({
  post,
  ep,
  variant = "grid",
}: {
  post: PostLike;
  ep: (key: string, options?: Record<string, string>) => string;
  variant?: "grid" | "detail";
}) {
  const badge = providerExplorePostBadge(post);

  const label =
    badge === "hidden"
      ? ep("statusHidden")
      : badge === "video_failed"
        ? ep("statusVideoFailed")
        : ep("statusVideoProcessing");

  const bg =
    badge === "hidden"
      ? "rgba(185,28,28,0.92)"
      : badge === "video_failed"
        ? "rgba(194,65,12,0.92)"
        : "rgba(29,78,216,0.92)";

  if (variant === "detail") {
    return (
      <View style={{ marginBottom: 8 }}>
        {badge ? (
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: bg,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>{label}</Text>
          </View>
        ) : null}
        {post.is_hidden && post.moderation_notes?.trim() ? (
          <Text style={{ fontSize: 12, color: "#b91c1c", marginBottom: 4 }}>
            {ep("statusHiddenNote", { note: post.moderation_notes.trim() })}
          </Text>
        ) : null}
        {badge === "video_failed" ? (
          <Text style={{ fontSize: 12, color: "#9a3412" }}>{ep("videoFailedDetail")}</Text>
        ) : null}
      </View>
    );
  }

  if (!badge) return null;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 6,
        left: 6,
        right: 6,
        backgroundColor: bg,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
      }}
      pointerEvents="none"
    >
      <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
