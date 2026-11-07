import { useEffect, type RefObject } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import type { ExploreComment } from "@/types/api";

export const EXPLORE_COMMENT_MAX = 200;

export type ExploreReplyTarget = {
  parentId: string;
  name: string;
};

/** Replies stay one level deep. A reply to a reply still belongs to the top comment. */
export function exploreReplyTarget(comment: ExploreComment, fallbackName: string): ExploreReplyTarget {
  return {
    parentId: comment.parent_id || comment.id,
    name: comment.author?.full_name?.trim() || fallbackName,
  };
}

function commentAge(
  iso: string,
  t: (key: string, opts?: { count: number }) => string,
  locale: string,
) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return t("customer.explorePost.justNow");
  if (mins < 60) return t("customer.explorePost.minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("customer.explorePost.hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("customer.explorePost.daysAgo", { count: days });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function CommentAvatar({
  comment,
  size,
}: {
  comment: ExploreComment;
  size: number;
}) {
  const name = comment.author?.full_name?.trim() || "?";
  if (comment.author?.avatar_url) {
    return (
      <Image
        source={{ uri: comment.author.avatar_url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#6B7280", fontWeight: "700", fontSize: size < 32 ? 11 : 13 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function CommentRow({
  comment,
  isReply,
  viewerUserId,
  canInteract,
  onReply,
  onDelete,
  onReport,
}: {
  comment: ExploreComment;
  isReply: boolean;
  viewerUserId?: string | null;
  canInteract: boolean;
  onReply?: (comment: ExploreComment) => void;
  onDelete?: (comment: ExploreComment) => void;
  onReport?: (comment: ExploreComment) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = comment.author?.full_name?.trim() || t("customer.explorePost.userFallback");
  const mine = Boolean(viewerUserId && comment.user_id === viewerUserId);
  const size = isReply ? 28 : 36;

  const confirmDelete = () => {
    Alert.alert(
      t("customer.explorePost.deleteCommentTitle", "Delete this comment?"),
      t("customer.explorePost.deleteCommentBody", "This removes the comment for everyone."),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("customer.explorePost.deleteComment", "Delete"),
          style: "destructive",
          onPress: () => onDelete?.(comment),
        },
      ],
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: isReply ? 8 : 12 }}>
      <CommentAvatar comment={comment} size={size} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, lineHeight: 18 }}>
          <Text style={{ fontWeight: "700", color: "#111827" }}>{name}</Text>
          <Text style={{ color: "#9CA3AF" }}>
            {"  "}
            {commentAge(comment.created_at, t, i18n.language || "en")}
          </Text>
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: "#1F2937", marginTop: 2 }}>{comment.body}</Text>
        {canInteract || (!mine && onReport) ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 }}>
            {canInteract && onReply ? (
              <TouchableOpacity
                onPress={() => onReply(comment)}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.reply")}
                hitSlop={8}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#6B7280" }}>
                  {t("customer.explorePost.reply")}
                </Text>
              </TouchableOpacity>
            ) : null}
            {canInteract && mine && onDelete ? (
              <TouchableOpacity
                onPress={confirmDelete}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.deleteComment", "Delete")}
                hitSlop={8}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#6B7280" }}>
                  {t("customer.explorePost.deleteComment", "Delete")}
                </Text>
              </TouchableOpacity>
            ) : null}
            {!mine && onReport ? (
              <TouchableOpacity
                onPress={() => onReport(comment)}
                accessibilityRole="button"
                accessibilityLabel={t("customer.contentReport.reportComment")}
                hitSlop={8}
              >
                <Ionicons name="flag-outline" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ExploreCommentList({
  comments,
  loading,
  hasMore,
  onLoadMore,
  loadError,
  onRetry,
  viewerUserId,
  canInteract,
  onReply,
  onDelete,
  onReport,
}: {
  comments: ExploreComment[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore?: () => void;
  loadError?: boolean;
  onRetry?: () => void;
  viewerUserId?: string | null;
  canInteract: boolean;
  onReply?: (comment: ExploreComment) => void;
  onDelete?: (comment: ExploreComment) => void;
  onReport?: (comment: ExploreComment) => void;
}) {
  const { t } = useTranslation();

  if (loading && comments.length === 0) {
    return (
      <View style={{ paddingVertical: 28, alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!loading && comments.length === 0 && loadError) {
    return (
      <View style={{ paddingVertical: 36, paddingHorizontal: 24, alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", textAlign: "center" }}>
          {t("customer.explorePost.commentsLoadFailed", "Couldn't load comments.")}
        </Text>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary }}>{t("common.retry")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (!loading && comments.length === 0) {
    return (
      <View style={{ paddingVertical: 36, paddingHorizontal: 24, alignItems: "center" }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#FDF2F8",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={26} color={Colors.primary} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", textAlign: "center" }}>
          {canInteract
            ? t("customer.explorePost.noCommentsYet")
            : t("customer.explorePost.safetyInteractionsOff")}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {loadError && onRetry ? (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={{ paddingBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.primary, textAlign: "center" }}>
            {t("customer.explorePost.commentsLoadFailed", "Couldn't load comments.")} {t("common.retry")}
          </Text>
        </TouchableOpacity>
      ) : null}
      {comments.map((comment, index) => (
        <View
          key={comment.id}
          style={
            index > 0
              ? { borderTopWidth: 1, borderTopColor: "#F3F4F6", marginTop: 4, paddingTop: 4 }
              : undefined
          }
        >
          <CommentRow
            comment={comment}
            isReply={false}
            viewerUserId={viewerUserId}
            canInteract={canInteract}
            onReply={onReply}
            onDelete={onDelete}
            onReport={onReport}
          />
          {(comment.replies ?? []).length > 0 ? (
            <View style={{ marginStart: 46, borderStartWidth: 2, borderStartColor: "#F3F4F6", paddingStart: 12 }}>
              {(comment.replies ?? []).map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  isReply
                  viewerUserId={viewerUserId}
                  canInteract={canInteract}
                  onReply={onReply}
                  onDelete={onDelete}
                  onReport={onReport}
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {hasMore ? (
        <TouchableOpacity
          onPress={onLoadMore}
          disabled={loading}
          accessibilityRole="button"
          style={{ paddingVertical: 14, alignItems: "center" }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary }}>
            {loading
              ? t("customer.explorePost.loadingComments", "Loading...")
              : t("customer.explorePost.loadMoreComments", "Load more comments")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ExploreCommentComposer({
  value,
  onChangeText,
  onSend,
  sending,
  replyTo,
  onCancelReply,
  canInteract,
  signedIn,
  onSignIn,
  onOpenSafety,
  viewerInitial,
  viewerAvatarUrl,
  inputRef,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  replyTo: ExploreReplyTarget | null;
  onCancelReply: () => void;
  canInteract: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onOpenSafety: () => void;
  viewerInitial: string;
  viewerAvatarUrl?: string | null;
  inputRef?: RefObject<TextInput | null>;
}) {
  const { t } = useTranslation();
  const trimmed = value.trim();
  const nearLimit = value.length >= 160;
  const canSend = trimmed.length > 0 && trimmed.length <= EXPLORE_COMMENT_MAX && !sending;

  useEffect(() => {
    if (replyTo) inputRef?.current?.focus();
  }, [inputRef, replyTo]);

  if (!canInteract) {
    return (
      <Pressable onPress={onOpenSafety} accessibilityRole="button" style={{ paddingVertical: 6 }}>
        <Text style={{ color: "#6B7280", fontSize: 14, lineHeight: 20, textAlign: "center" }}>
          {t("customer.explorePost.safetyInteractionsOff")}
        </Text>
        <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 14, textAlign: "center", marginTop: 8 }}>
          {t("customer.safety.socialRestricted.openControls")}
        </Text>
      </Pressable>
    );
  }

  if (!signedIn) {
    return (
      <Pressable
        onPress={onSignIn}
        accessibilityRole="button"
        style={{
          backgroundColor: Colors.primary,
          borderRadius: 999,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          {t("customer.explorePost.signInToComment", "Sign in to comment")}
        </Text>
      </Pressable>
    );
  }

  return (
    <View>
      {replyTo ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: Colors.primary, marginEnd: 8 }} />
          <Text style={{ flex: 1, fontSize: 13, color: "#6B7280" }} numberOfLines={1}>
            {t("customer.explorePost.replyingTo", { name: replyTo.name, defaultValue: `Replying to ${replyTo.name}` })}
          </Text>
          <TouchableOpacity onPress={onCancelReply} accessibilityRole="button" hitSlop={8}>
            <Ionicons name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {viewerAvatarUrl ? (
          <Image
            source={{ uri: viewerAvatarUrl }}
            style={{ width: 32, height: 32, borderRadius: 16, marginBottom: 4 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#FDF2F8",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>{viewerInitial}</Text>
          </View>
        )}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(text) => onChangeText(text.slice(0, EXPLORE_COMMENT_MAX))}
          placeholder={
            replyTo
              ? t("customer.explorePost.replyPlaceholder", "Write a reply…")
              : t("customer.explorePost.addComment")
          }
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={EXPLORE_COMMENT_MAX}
          style={{
            flex: 1,
            maxHeight: 96,
            backgroundColor: "#F3F4F6",
            borderRadius: 22,
            paddingHorizontal: 14,
            paddingTop: Platform.OS === "ios" ? 10 : 8,
            paddingBottom: Platform.OS === "ios" ? 10 : 8,
            fontSize: 15,
            lineHeight: 20,
            color: "#111827",
          }}
        />
        <TouchableOpacity
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("customer.explorePost.comment")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            marginBottom: 2,
            backgroundColor: canSend ? Colors.primary : "#E5E7EB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-up" size={18} color={canSend ? "#fff" : "#9CA3AF"} />
          )}
        </TouchableOpacity>
      </View>
      {nearLimit ? (
        <Text
          style={{
            alignSelf: "flex-end",
            marginTop: 4,
            fontSize: 11,
            color: value.length >= EXPLORE_COMMENT_MAX ? "#DC2626" : "#9CA3AF",
          }}
        >
          {t("customer.explorePost.commentTooLong", { count: value.length, defaultValue: `${value.length} / 200` })}
        </Text>
      ) : null}
    </View>
  );
}
