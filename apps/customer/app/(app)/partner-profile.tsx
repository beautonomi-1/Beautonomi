import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Pressable,
  Share,
  Linking,
  useWindowDimensions,
  StatusBar,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { APP_URL } from "@/config/public-env";
import { Colors, Shadows } from "@/constants/colors";
import { Skeleton } from "@/components/Skeleton";
import { haptic } from "@/lib/haptics";
import type {
  PublicProviderDetail,
  ProviderServicesResponse,
  ProviderService,
  ProviderLocation,
  StaffMember,
  PublicProviderProduct,
} from "@/types/api";

/* ─── Review type (from API) ─── */
interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author?: { full_name?: string | null; avatar_url?: string | null };
}

/* ─── Membership plan type ─── */
interface MembershipPlan {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  interval: string;
  benefits?: string[];
}

/* ═══════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════ */

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function VerifiedTag() {
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginRight: 5 }}>
        <Ionicons name="checkmark" size={10} color="#fff" />
      </View>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#111" }}>Verified</Text>
    </View>
  );
}

function FloatingIcon({ name, onPress, filled, fillColor }: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  filled?: boolean;
  fillColor?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, width: 40, height: 40,
        alignItems: "center", justifyContent: "center",
        ...Shadows.card,
      }}
    >
      <Ionicons name={name} size={20} color={filled && fillColor ? fillColor : "#374151"} />
    </TouchableOpacity>
  );
}

function TrustModule({ distance_km, rating, review_count }: {
  distance_km?: number | null;
  rating: number;
  review_count: number;
}) {
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA" }}>
      <View style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}>
        <Ionicons name="location-outline" size={18} color="#6B7280" />
        <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>Distance</Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#111" }}>
          {distance_km != null ? `${distance_km.toFixed(1)} km` : "—"}
        </Text>
      </View>
      <View style={{ width: 1, backgroundColor: "#E5E7EB" }} />
      <View style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="star" size={18} color="#FACC15" style={{ marginRight: 3 }} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#111" }}>
            {rating > 0 ? rating.toFixed(1) : "0.0"}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>Rating</Text>
      </View>
      <View style={{ width: 1, backgroundColor: "#E5E7EB" }} />
      <View style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111" }}>{review_count.toLocaleString()}</Text>
        <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>
          {review_count === 1 ? "Review" : "Reviews"}
        </Text>
      </View>
    </View>
  );
}

/* ─── Section Tabs ─── */
const TAB_KEYS = ["services", "products", "photos", "locations", "team", "reviews", "memberships", "giftcard"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  services: "Services",
  products: "Products",
  photos: "Photos",
  locations: "Locations",
  team: "Team",
  reviews: "Reviews",
  memberships: "Memberships",
  giftcard: "Giftcard",
};

/* ─── Service Card ─── */
function ServiceCard({ service, currency, onBook, onDetails, contentPadding }: {
  service: ProviderService;
  currency: string;
  onBook: () => void;
  onDetails: () => void;
  contentPadding: number;
}) {
  const displayPrice = service.variants?.length
    ? Math.min(...service.variants.map((v) => v.price))
    : service.price;

  return (
    <View style={{
      backgroundColor: "#fff", borderRadius: 12, padding: contentPadding, marginBottom: 12,
      borderWidth: 1, borderColor: "#F3F4F6",
      ...Shadows.cardSmall,
    }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>{service.title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
          <Ionicons name="time-outline" size={14} color="#9CA3AF" style={{ marginRight: 3 }} />
          <Text style={{ fontSize: 13, color: "#6B7280" }}>{service.duration_minutes} min</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
          {currency} {displayPrice.toFixed(2)}
        </Text>
      </View>
      {service.description ? (
        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 18 }} numberOfLines={2}>
          {service.description}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <TouchableOpacity
          onPress={onDetails}
          style={{
            flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingVertical: 10,
            alignItems: "center", flexDirection: "row", justifyContent: "center", marginRight: 10,
          }}
        >
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" style={{ marginRight: 4 }} />
          <Text style={{ fontWeight: "500", color: "#374151", fontSize: 14 }}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBook}
          style={{ flex: 2, backgroundColor: "#111827", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Book</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─── Category Pill ─── */
function CategoryPill({ label, active, onPress, contentPadding }: { label: string; active: boolean; onPress: () => void; contentPadding: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? "#111827" : "#F3F4F6", borderRadius: 999,
        paddingHorizontal: contentPadding, paddingVertical: 8, marginRight: 8,
      }}
    >
      <Text style={{ color: active ? "#fff" : "#374151", fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Location Card ─── */
function LocationCard({ loc }: { loc: ProviderLocation }) {
  const fullAddress = [loc.address_line1, loc.address_line2, loc.city, loc.state, loc.country].filter(Boolean).join(", ");

  const openDirections = () => {
    if (loc.latitude != null && loc.longitude != null) {
      Linking.openURL(`https://www.mapbox.com/directions/?destination=${loc.longitude},${loc.latitude}`).catch(() => {});
    } else if (fullAddress) {
      Linking.openURL(`https://www.mapbox.com/directions/?query=${encodeURIComponent(fullAddress)}`).catch(() => {});
    }
  };
  const callPhone = () => { if (loc.phone) Linking.openURL(`tel:${loc.phone.replace(/\s/g, "")}`).catch(() => {}); };

  return (
    <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <Text style={{ fontWeight: "600", color: "#111827" }}>{loc.name}</Text>
      <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
        {loc.address_line1}{loc.address_line2 ? `, ${loc.address_line2}` : ""}
      </Text>
      <Text style={{ fontSize: 13, color: "#6B7280" }}>
        {loc.city}{loc.state ? `, ${loc.state}` : ""} {loc.country}
      </Text>
      <View style={{ flexDirection: "row", marginTop: 10 }}>
        {(loc.latitude != null || fullAddress) && (
          <TouchableOpacity onPress={openDirections} style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
            <Ionicons name="navigate-outline" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
            <Text style={{ color: Colors.primary, fontWeight: "500", fontSize: 13 }}>Directions</Text>
          </TouchableOpacity>
        )}
        {loc.phone && (
          <TouchableOpacity onPress={callPhone} style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="call-outline" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
            <Text style={{ color: Colors.primary, fontWeight: "500", fontSize: 13 }}>Call</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ─── Service Detail Modal ─── */
function ServiceDetailModal({ service, currency, visible, onClose, onBook, contentPadding }: {
  service: ProviderService | null;
  currency: string;
  visible: boolean;
  onClose: () => void;
  onBook: (svc: ProviderService) => void;
  contentPadding: number;
}) {
  if (!service) return null;
  const displayPrice = service.variants?.length
    ? Math.min(...service.variants.map((v) => v.price))
    : service.price;
  const hasVariants = service.variants && service.variants.length > 1;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 34 }}>
          {/* Handle bar */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: contentPadding, paddingBottom: contentPadding }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>{service.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                    <Ionicons name="time-outline" size={16} color="#6B7280" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 14, color: "#6B7280" }}>{service.duration_minutes} min</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>
                    {hasVariants ? "from " : ""}{currency} {displayPrice.toFixed(2)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={28} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Description */}
            {service.description ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>About this service</Text>
                <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>{service.description}</Text>
              </View>
            ) : null}

            {/* Location availability */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>Available at</Text>
              <View style={{ flexDirection: "row" }}>
                {service.supports_at_salon && (
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 12 }}>
                    <Ionicons name="business-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, color: "#374151" }}>At Salon</Text>
                  </View>
                )}
                {service.supports_at_home && (
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Ionicons name="home-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, color: "#374151" }}>House Call</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Variants */}
            {hasVariants && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>Options</Text>
                {service.variants!.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => { onBook(service); onClose(); }}
                    style={{
                      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                      backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 8,
                      borderWidth: 1, borderColor: "#E5E7EB",
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{v.title || v.variant_name || `${v.duration_minutes} min`}</Text>
                      <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{v.duration_minutes} min</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>{currency} {v.price.toFixed(2)}</Text>
                      <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: "500", marginTop: 2 }}>Book</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Bottom CTA */}
          <View style={{ paddingHorizontal: contentPadding }}>
            <TouchableOpacity
              onPress={() => { onBook(service); onClose(); }}
              style={{ backgroundColor: "#111827", borderRadius: 12, paddingVertical: 16, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                Book — {currency} {displayPrice.toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Fullscreen Gallery Viewer ─── */
function GalleryViewer({ images, initialIndex, visible, onClose }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width: sw } = useWindowDimensions();
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => { if (visible) setIdx(initialIndex); }, [visible, initialIndex]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIdx(Math.round(e.nativeEvent.contentOffset.x / sw));
  }, [sw]);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <TouchableOpacity
          onPress={onClose}
          style={{ position: "absolute", top: 50, right: 16, zIndex: 10, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: sw, offset: sw * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={{ width: sw, flex: 1, justifyContent: "center" }}>
              <Image source={{ uri: item }} style={{ width: sw, height: sw }} contentFit="contain" />
            </View>
          )}
        />
        <View style={{ position: "absolute", bottom: 40, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{idx + 1} / {images.length}</Text>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Star Renderer ─── */
function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={rating >= star ? "star" : rating >= star - 0.5 ? "star-half" : "star-outline"}
          size={size}
          color="#FACC15"
          style={star < 5 ? { marginRight: 2 } : undefined}
        />
      ))}
    </View>
  );
}

/* ─── Review Card ─── */
function ReviewCard({ review }: { review: Review }) {
  const date = new Date(review.created_at);
  const timeAgo = getRelativeTime(date);
  const name = review.author?.full_name || "Customer";
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        {review.author?.avatar_url ? (
          <Image source={{ uri: review.author.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} contentFit="cover" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
            <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 15 }}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{name}</Text>
          <Text style={{ fontSize: 11, color: "#9CA3AF" }}>{timeAgo}</Text>
        </View>
        <StarRow rating={review.rating} />
      </View>
      {review.comment ? (
        <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20 }}>{review.comment}</Text>
      ) : null}
    </View>
  );
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/* ─── Staff Card ─── */
function StaffCard({ member, contentPadding }: { member: StaffMember; contentPadding: number }) {
  const initial = (member.name || "S").charAt(0).toUpperCase();
  return (
    <View style={{
      backgroundColor: "#fff", borderRadius: 16, padding: contentPadding, marginBottom: 10,
      borderWidth: 1, borderColor: "#F3F4F6",
      ...Shadows.cardSmall,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {member.avatar_url ? (
          <Image source={{ uri: member.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28, marginRight: 12 }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Text style={{ color: "#6B7280", fontWeight: "700", fontSize: 22 }}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>{member.name}</Text>
          {member.role && (
            <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{member.role}</Text>
          )}
        </View>
      </View>
      {member.bio ? (
        <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, marginTop: 10 }} numberOfLines={3}>
          {member.bio}
        </Text>
      ) : null}
      {member.specialties && member.specialties.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {member.specialties.map((s, i) => (
            <View key={i} style={{ backgroundColor: Colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: "500" }}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─── Membership Plan Card ─── */
function MembershipCard({ plan, onJoin, contentPadding }: { plan: MembershipPlan; onJoin: () => void; contentPadding: number }) {
  return (
    <View style={{
      backgroundColor: "#fff", borderRadius: 16, padding: contentPadding, marginBottom: 12,
      borderWidth: 1, borderColor: "#F3F4F6",
      ...Shadows.cardSmall,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{plan.name}</Text>
          {plan.description && (
            <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 20 }} numberOfLines={2}>
              {plan.description}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>{plan.currency} {plan.price.toFixed(0)}</Text>
          <Text style={{ fontSize: 11, color: "#9CA3AF" }}>/{plan.interval}</Text>
        </View>
      </View>
      {plan.benefits && plan.benefits.length > 0 && (
        <View style={{ marginTop: 12 }}>
          {plan.benefits.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: i === 0 ? 0 : 6 }}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13, color: "#374151" }}>{b}</Text>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity
        onPress={onJoin}
        style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Join Plan</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ═══════════════════════════════════════════
   Main Screen
   ═══════════════════════════════════════════ */
export default function PartnerProfileScreen() {
  useScreenTracking("Partner Profile");
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const { contentPadding } = useResponsive();

  const [provider, setProvider] = useState<PublicProviderDetail | null>(null);
  const [services, setServices] = useState<ProviderServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("services");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Service detail modal
  const [detailService, setDetailService] = useState<ProviderService | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Fullscreen gallery
  const [galleryViewerVisible, setGalleryViewerVisible] = useState(false);
  const [galleryViewerIndex, setGalleryViewerIndex] = useState(0);

  // Live data for tabs
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [memberships, setMemberships] = useState<MembershipPlan[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [providerProducts, setProviderProducts] = useState<PublicProviderProduct[]>([]);
  const [providerProductsLoading, setProviderProductsLoading] = useState(false);

  const { selectedAddress } = useSelectedAddress();
  const { coords } = useLocation();

  /* ── Data Loading ── */
  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    const lat = selectedAddress?.latitude ?? coords?.latitude;
    const lng = selectedAddress?.longitude ?? coords?.longitude;
    const qs = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : "";
    try {
      const [provRes, svcRes] = await Promise.all([
        api.get<PublicProviderDetail>(`/api/public/providers/${encodeURIComponent(slug)}${qs}`),
        api.get<ProviderServicesResponse>(`/api/public/providers/${encodeURIComponent(slug)}/services`),
      ]);
      if (provRes.error) {
        setError(provRes.error.message || "Provider not found");
        setProvider(null);
      } else {
        setProvider(provRes.data);
      }
      if (!svcRes.error) {
        setServices(svcRes.data);
        if (svcRes.data?.categories?.[0]) setActiveCategory(svcRes.data.categories[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [slug, selectedAddress?.latitude, selectedAddress?.longitude, coords?.latitude, coords?.longitude]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (provider && user) {
      api.post("/api/me/recently-viewed", { provider_id: provider.id }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- track view by provider id only
  }, [provider?.id, user?.id]);

  /* ── Load reviews when tab is active ── */
  useEffect(() => {
    if (activeTab !== "reviews" || !slug || reviews.length > 0) return;
    setReviewsLoading(true);
    api.get<{ data?: Review[]; reviews?: Review[] }>(`/api/public/providers/${encodeURIComponent(slug)}/reviews`)
      .then((res) => {
        const raw = res.data as Record<string, unknown> | null;
        const list = (raw?.data ?? raw?.reviews ?? (Array.isArray(raw) ? raw : [])) as Review[];
        setReviews(list);
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when tab/slug; avoid refetch when reviews populated
  }, [activeTab, slug]);

  /* ── Load staff when tab is active ── */
  useEffect(() => {
    if (activeTab !== "team" || !slug || staff.length > 0) return;
    setStaffLoading(true);
    api.get<StaffMember[] | { data: StaffMember[] }>(`/api/public/providers/${encodeURIComponent(slug)}/staff`)
      .then((res) => {
        const raw = res.data;
        setStaff(Array.isArray(raw) ? raw : (raw as { data: StaffMember[] })?.data || []);
      })
      .catch(() => {})
      .finally(() => setStaffLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when tab/slug; avoid refetch when staff populated
  }, [activeTab, slug]);

  /* ── Load memberships when tab is active ── */
  useEffect(() => {
    if (activeTab !== "memberships" || !slug || memberships.length > 0) return;
    setMembershipsLoading(true);
    api.get<{ data?: MembershipPlan[]; plans?: MembershipPlan[] }>(`/api/public/providers/${encodeURIComponent(slug)}/membership-plans`)
      .then((res) => {
        const raw = res.data as Record<string, unknown> | null;
        const list = (raw?.data ?? raw?.plans ?? (Array.isArray(raw) ? raw : [])) as MembershipPlan[];
        setMemberships(list);
      })
      .catch(() => {})
      .finally(() => setMembershipsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when tab/slug; avoid refetch when memberships populated
  }, [activeTab, slug]);

  /* ── Load products when Products tab is active (provider slug API returns variants) ── */
  useEffect(() => {
    if (activeTab !== "products" || !slug) return;
    setProviderProductsLoading(true);
    setProviderProducts([]);
    api.get<PublicProviderProduct[]>(`/api/public/providers/${encodeURIComponent(slug)}/products`)
      .then((res) => {
        const raw = res.data;
        setProviderProducts(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {})
      .finally(() => setProviderProductsLoading(false));
  }, [activeTab, slug]);

  /* ── Wishlist ── */
  useEffect(() => {
    if (!provider || !user) { setIsSaved(false); return; }
    api.post<{ is_in_wishlist: boolean }>("/api/me/wishlists/check", { item_type: "provider", item_id: provider.id })
      .then((r) => {
        const d = (r.data ?? {}) as Record<string, unknown>;
        setIsSaved(Boolean(d.is_in_wishlist ?? (d.data as Record<string, unknown>)?.is_in_wishlist));
      })
      .catch(() => setIsSaved(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- check wishlist by provider id only
  }, [provider?.id, user?.id]);

  const toggleWishlist = useCallback(async () => {
    if (!provider || !user || toggling) return;
    setToggling(true);
    haptic.light();
    try {
      const r = await api.post<{ action: "added" | "removed" }>("/api/me/wishlists/toggle", { item_type: "provider", item_id: provider.id });
      const d = (r.data ?? {}) as Record<string, unknown>;
      setIsSaved((d.action ?? (d.data as Record<string, unknown>)?.action) === "added");
    } catch {} finally { setToggling(false); }
  }, [provider, user, toggling]);

  /* ── Share ── */
  const handleShare = useCallback(() => {
    if (!provider) return;
    Share.share({ message: `Check out ${provider.business_name} on Beautonomi!`, url: `${APP_URL}/partner-profile?slug=${slug}` }).catch(() => {});
  }, [provider, slug]);

  /* ── Message ── */
  const handleMessage = useCallback(() => {
    if (!user) { Alert.alert("Sign in required", "Please sign in to message this provider."); return; }
    if (!provider) return;
    router.push({ pathname: "/(app)/chat", params: { provider_id: provider.id, provider_name: provider.business_name } });
  }, [user, provider]);

  /* ── Report Provider ── */
  const REPORT_REASONS = [
    "Inappropriate content",
    "Misleading information",
    "Unprofessional behavior",
    "Harassment or abuse",
    "Spam or scam",
    "Other",
  ];

  const handleSubmitReport = useCallback(async () => {
    if (!provider || !user) return;
    if (!reportReason) { Alert.alert("Select a reason", "Please select a reason for your report."); return; }
    if (!reportDescription.trim()) { Alert.alert("Add details", "Please describe what happened."); return; }

    setReportSubmitting(true);
    try {
      const res = await api.post("/api/reports", {
        report_type: "customer_reported_provider",
        provider_id: provider.id,
        description: `${reportReason}: ${reportDescription.trim()}`,
      });

      if (res.error) {
        haptic.error();
        Alert.alert("Error", res.error.message || "Failed to submit report.");
      } else {
        haptic.success();
        setReportModalVisible(false);
        setReportReason("");
        setReportDescription("");
        Alert.alert("Report Submitted", "Thank you. Our team will review your report within 24-48 hours.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  }, [provider, user, reportReason, reportDescription]);

  /* ── Join Membership ── */
  const handleJoinMembership = useCallback(async (plan: MembershipPlan) => {
    if (!user) { Alert.alert("Sign in required", "Please sign in to join a membership."); return; }
    if (!provider) return;

    Alert.alert(
      `Join ${plan.name}`,
      `Subscribe for ${plan.currency} ${plan.price.toFixed(0)}/${plan.interval}?\n\nYou'll be redirected to complete payment.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Subscribe",
          onPress: async () => {
            try {
              const res = await api.post<{ payment?: { authorization_url: string } }>("/api/me/membership/subscribe", {
                membership_id: plan.id,
                provider_id: provider.id,
              });

              if (res.error) {
                haptic.error();
                Alert.alert("Error", res.error.message || "Failed to subscribe.");
                return;
              }

              const data = res.data as Record<string, unknown> | undefined;
              const paymentInfo = data?.payment as { authorization_url?: string } | undefined;

              if (paymentInfo?.authorization_url) {
                const WebBrowser = await import("expo-web-browser");
                await WebBrowser.openBrowserAsync(paymentInfo.authorization_url, {
                  presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                });
                haptic.success();
                Alert.alert("Welcome!", "Your membership is now active. Enjoy your benefits!");
              } else {
                haptic.success();
                Alert.alert("Welcome!", "You've joined the membership. Enjoy your benefits!");
              }
            } catch {
              Alert.alert("Error", "Something went wrong. Please try again.");
            }
          },
        },
      ]
    );
  }, [user, provider]);

  /* ── Book ── */
  const handleBookService = useCallback(
    (svc: ProviderService) => {
      haptic.medium();
      const sid = svc.variants?.[0]?.id || svc.id;
      const dur = svc.variants?.[0]?.duration_minutes || svc.duration_minutes;
      router.push({ pathname: "/(app)/book", params: { slug: slug as string, service_id: sid, duration_minutes: String(dur) } });
    },
    [slug]
  );

  const handleBook = useCallback(() => {
    haptic.medium();
    if (services?.categories?.[0]?.services?.[0]) handleBookService(services.categories[0].services[0]);
    else router.push({ pathname: "/(app)/book", params: { slug: slug as string } });
  }, [services, slug, handleBookService]);

  /* ── Gallery ── */
  const images = (() => {
    if (!provider) return [];
    const gallery = Array.isArray(provider.gallery)
      ? provider.gallery.map((g) => (typeof g === "string" ? g : (g as { src?: string; url?: string }).src || (g as { src?: string; url?: string }).url || ""))
      : [];
    return gallery.length > 0 ? gallery : provider.thumbnail_url ? [provider.thumbnail_url] : [];
  })();

  const onGalleryScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth));
  }, [screenWidth]);

  const heroHeight = screenWidth * 1.25;

  /* ═══ Loading state ═══ */
  if (loading && !provider) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <Skeleton width="100%" height={heroHeight} borderRadius={0} />
          <View style={{ padding: contentPadding }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="40%" height={14} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={60} borderRadius={0} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={48} borderRadius={12} style={{ marginTop: 12 }} />
          </View>
        </View>
      </>
    );
  }

  /* ═══ Error state ═══ */
  if (error && !provider) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <Text style={{ color: "#6B7280", marginTop: 12, textAlign: "center", fontSize: 15 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 20 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!provider) return null;

  /* ── Derived state ── */
  const activeCat = services?.categories?.find((c) => c.id === activeCategory);
  const visibleTabs = TAB_KEYS.filter((t) => {
    if (t === "services") return (services?.total_services ?? 0) > 0;
    if (t === "products") return true;
    if (t === "photos") return images.length > 1;
    if (t === "locations") return (provider.locations?.length ?? 0) > 0;
    if (t === "team") return provider.business_type === "salon" && (provider.staff_count ?? 0) > 0;
    return true;
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent />

      {/* Service Detail Modal */}
      <ServiceDetailModal
        service={detailService}
        currency={provider.currency}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onBook={handleBookService}
        contentPadding={contentPadding}
      />

      {/* Fullscreen Gallery */}
      <GalleryViewer
        images={images}
        initialIndex={galleryViewerIndex}
        visible={galleryViewerVisible}
        onClose={() => setGalleryViewerVisible(false)}
      />

      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* ═══════════ HERO GALLERY (4:5) ═══════════ */}
          <View style={{ width: screenWidth, height: heroHeight, backgroundColor: "#E5E7EB" }}>
            {images.length > 0 ? (
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onGalleryScroll}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={{ width: screenWidth, height: heroHeight }} contentFit="cover" transition={300} cachePolicy="memory-disk" />
                )}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
              </View>
            )}

            {/* Back button */}
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/home" as any)}
              style={{
                position: "absolute", top: 48, left: 16, backgroundColor: "rgba(255,255,255,0.92)",
                borderRadius: 999, width: 38, height: 38, alignItems: "center", justifyContent: "center",
                ...Shadows.card,
              }}
            >
              <Ionicons name="arrow-back" size={20} color="#111" />
            </TouchableOpacity>

            {/* Tags */}
            <View style={{ position: "absolute", top: 92, left: 16, flexDirection: "row", flexWrap: "wrap" }}>
              {provider.is_verified && <View style={{ marginRight: 6, marginBottom: 6 }}><VerifiedTag /></View>}
              {provider.is_featured && <View style={{ marginRight: 6, marginBottom: 6 }}><Tag label="Featured" color="rgba(236,72,153,0.9)" /></View>}
              {provider.supports_house_calls && <View style={{ marginRight: 6, marginBottom: 6 }}><Tag label="House Calls" color="rgba(34,197,94,0.9)" /></View>}
              {provider.supports_salon && <View style={{ marginRight: 6, marginBottom: 6 }}><Tag label="At Salon" color="rgba(139,92,246,0.9)" /></View>}
              {provider.business_type === "freelancer" && <View style={{ marginRight: 6, marginBottom: 6 }}><Tag label="Freelancer" color="rgba(249,115,22,0.9)" /></View>}
            </View>

            {/* Action icons */}
            <View style={{ position: "absolute", top: 48, right: 16, flexDirection: "row" }}>
              <View style={{ marginRight: 8 }}><FloatingIcon name={isSaved ? "heart" : "heart-outline"} onPress={toggleWishlist} filled={isSaved} fillColor={Colors.primary} /></View>
              <View style={{ marginRight: 8 }}><FloatingIcon name="share-social-outline" onPress={handleShare} /></View>
              <View style={{ marginRight: 8 }}><FloatingIcon name="chatbubble-ellipses-outline" onPress={handleMessage} /></View>
              <FloatingIcon name="flag-outline" onPress={() => {
                if (!user) { Alert.alert("Sign in required", "Please sign in to report a provider."); return; }
                setReportModalVisible(true);
              }} />
            </View>

            {/* Photo counter */}
            {images.length > 1 && (
              <View style={{ position: "absolute", bottom: 16, right: 16, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>{galleryIndex + 1}/{images.length}</Text>
              </View>
            )}
          </View>

          {/* ═══════════ PROVIDER INFO CARD ═══════════ */}
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingTop: 0 }}>

            {/* Floating avatar */}
            <View style={{ position: "absolute", top: -32, left: 16, zIndex: 10 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: "#fff", overflow: "hidden", backgroundColor: "#E5E7EB",
                ...Shadows.card,
              }}>
                {(provider.avatar_url || provider.thumbnail_url) ? (
                  <Image source={{ uri: provider.avatar_url || provider.thumbnail_url! }} style={{ width: 66, height: 66 }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#D1D5DB" }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 22 }}>{(provider.business_name || "P").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              {provider.is_verified && (
                <View style={{ position: "absolute", bottom: -2, right: -2, backgroundColor: "#fff", borderRadius: 999, padding: 2, elevation: 3 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  </View>
                </View>
              )}
            </View>

            {/* Name, location */}
            <View style={{ paddingHorizontal: contentPadding, paddingTop: 48 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 6 }}>{provider.business_name}</Text>
              {(provider.city || provider.country) && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>{[provider.city, provider.country].filter(Boolean).join(", ")}</Text>
                </View>
              )}
            </View>

            <TrustModule distance_km={provider.distance_km as number | null | undefined} rating={provider.rating} review_count={provider.review_count} />

            {/* Description */}
            {provider.description?.trim() ? (
              <View style={{ paddingHorizontal: contentPadding, paddingVertical: 14, borderBottomWidth: 1, borderColor: "#E5E7EB" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", marginBottom: 6 }}>What this provider offers:</Text>
                <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20 }} numberOfLines={4}>{provider.description}</Text>
              </View>
            ) : null}

            {/* ═══════════ SECTION TABS ═══════════ */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: contentPadding, paddingVertical: 12 }}>
              {visibleTabs.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setActiveTab(t); haptic.selection(); }}
                  style={{
                    paddingHorizontal: contentPadding, paddingVertical: 8,
                    borderBottomWidth: 2, borderColor: activeTab === t ? Colors.primary : "transparent", marginRight: 4,
                  }}
                >
                  <Text style={{ color: activeTab === t ? Colors.primary : "#6B7280", fontWeight: activeTab === t ? "600" : "400", fontSize: 14 }}>
                    {TAB_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ═══════════ TAB CONTENT ═══════════ */}
            <View style={{ paddingHorizontal: contentPadding, paddingTop: 8, paddingBottom: 16, minHeight: 200 }}>

              {/* ── SERVICES ── */}
              {activeTab === "services" && services && services.categories.length > 0 && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Services</Text>
                  {services.categories.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
                      {services.categories.map((cat) => (
                        <CategoryPill key={cat.id} label={cat.name} active={activeCategory === cat.id} onPress={() => setActiveCategory(cat.id)} contentPadding={contentPadding} />
                      ))}
                    </ScrollView>
                  )}
                  {(activeCat ?? services.categories[0]).services.map((svc) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      currency={provider.currency}
                      onBook={() => handleBookService(svc)}
                      onDetails={() => { setDetailService(svc); setDetailVisible(true); }}
                      contentPadding={contentPadding}
                    />
                  ))}
                  {services.total_services > (activeCat ?? services.categories[0]).services.length && (
                    <TouchableOpacity style={{ paddingVertical: 10 }}>
                      <Text style={{ color: Colors.primary, fontWeight: "500", fontSize: 14 }}>View all services</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ── PRODUCTS (provider's shop) ── */}
              {activeTab === "products" && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Products</Text>
                  {providerProductsLoading ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {[1, 2, 3, 4].map((i) => (
                        <View key={i} style={{ width: (screenWidth - 44) / 2, backgroundColor: "#F9FAFB", borderRadius: 12, padding: 12, marginRight: 12, marginBottom: 12 }}>
                          <Skeleton width="100%" height={120} borderRadius={10} />
                          <Skeleton width="70%" height={14} style={{ marginTop: 10 }} />
                          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
                        </View>
                      ))}
                    </View>
                  ) : providerProducts.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 32 }}>
                      <Ionicons name="cube-outline" size={40} color="#D1D5DB" />
                      <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8 }}>No products available</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {providerProducts.map((prod) => (
                        <TouchableOpacity
                          key={prod.id}
                          onPress={() => router.push(`/(app)/product-detail?id=${prod.id}` as any)}
                          style={{
                            width: (screenWidth - 44) / 2,
                            borderRadius: 14,
                            backgroundColor: "#fff",
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: "#F3F4F6",
                            marginRight: 12,
                            marginBottom: 12,
                            ...Shadows.cardSmall,
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={{ aspectRatio: 1, backgroundColor: "#F3F4F6" }}>
                            {prod.imageUrl ? (
                              <Image
                                source={{ uri: prod.imageUrl }}
                                style={{ width: "100%", height: "100%" }}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Ionicons name="cube-outline" size={32} color="#D1D5DB" />
                              </View>
                            )}
                            {!prod.inStock && (
                              <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>Sold Out</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }} numberOfLines={2}>{prod.name}</Text>
                            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.primary, marginTop: 6 }}>
                              {prod.hasVariants ? "From " : ""}R{Number(prod.price).toFixed(2)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ── PHOTOS ── */}
              {activeTab === "photos" && images.length > 0 && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Photos</Text>
                  {/* Feature image */}
                  {images[0] && (
                    <Pressable onPress={() => { setGalleryViewerIndex(0); setGalleryViewerVisible(true); }}>
                      <Image
                        source={{ uri: images[0] }}
                        style={{ width: screenWidth - 32, height: (screenWidth - 32) * 0.6, borderRadius: 12, marginBottom: 4 }}
                        contentFit="cover" cachePolicy="memory-disk"
                      />
                    </Pressable>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {images.slice(1).map((uri, i) => (
                      <Pressable key={i} onPress={() => { setGalleryViewerIndex(i + 1); setGalleryViewerVisible(true); }} style={{ marginRight: 4, marginBottom: 4 }}>
                        <Image
                          source={{ uri }}
                          style={{ width: (screenWidth - 40) / 2, height: (screenWidth - 40) / 2, borderRadius: 8 }}
                          contentFit="cover" cachePolicy="memory-disk"
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* ── LOCATIONS ── */}
              {activeTab === "locations" && provider.locations && provider.locations.length > 0 && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
                    {provider.locations.length === 1 ? "Location" : `${provider.locations.length} Locations`}
                  </Text>
                  {provider.locations.map((loc) => <LocationCard key={loc.id} loc={loc} />)}
                </View>
              )}

              {/* ── TEAM (live data) ── */}
              {activeTab === "team" && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Meet the Team</Text>
                  {staffLoading ? (
                    <View>
                      {[1, 2, 3].map((i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", padding: contentPadding, backgroundColor: "#F9FAFB", borderRadius: 16, marginTop: i === 0 ? 0 : 10 }}>
                          <Skeleton width={56} height={56} borderRadius={28} />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Skeleton width="60%" height={16} />
                            <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : staff.length > 0 ? (
                    staff.map((m) => <StaffCard key={m.id} member={m} contentPadding={contentPadding} />)
                  ) : (
                    <Text style={{ color: "#6B7280", fontSize: 14 }}>
                      {provider.staff_count ?? 0} team members. Meet our professionals when you book.
                    </Text>
                  )}
                </View>
              )}

              {/* ── REVIEWS (live data) ── */}
              {activeTab === "reviews" && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Reviews</Text>
                  {/* Aggregate */}
                  {provider.review_count > 0 && (
                    <View style={{
                      flexDirection: "row", alignItems: "center", marginBottom: 16,
                      backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding,
                    }}>
                      <View style={{ alignItems: "center", marginRight: 12 }}>
                        <Text style={{ fontSize: 36, fontWeight: "800", color: "#111827" }}>{provider.rating.toFixed(1)}</Text>
                        <StarRow rating={provider.rating} size={16} />
                        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{provider.review_count} {provider.review_count === 1 ? "review" : "reviews"}</Text>
                      </View>
                      <View style={{ flex: 1, paddingLeft: 12 }}>
                        {[5, 4, 3, 2, 1].map((star) => {
                          const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                          const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                          return (
                            <View key={star} style={{ flexDirection: "row", alignItems: "center", marginTop: star === 5 ? 0 : 4 }}>
                              <Text style={{ fontSize: 11, color: "#6B7280", width: 12, textAlign: "right", marginRight: 6 }}>{star}</Text>
                              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "#E5E7EB" }}>
                                <View style={{ width: `${pct}%` as `${number}%`, height: 6, borderRadius: 3, backgroundColor: "#FACC15" }} />
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {reviewsLoading ? (
                    <View>
                      {[1, 2, 3].map((i) => (
                        <View key={i} style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginTop: i === 0 ? 0 : 10 }}>
                          <View style={{ flexDirection: "row", marginBottom: 8 }}>
                            <Skeleton width={36} height={36} borderRadius={18} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Skeleton width="40%" height={14} />
                              <Skeleton width="30%" height={10} style={{ marginTop: 6 }} />
                            </View>
                          </View>
                          <Skeleton width="90%" height={12} />
                          <Skeleton width="70%" height={12} style={{ marginTop: 4 }} />
                        </View>
                      ))}
                    </View>
                  ) : reviews.length > 0 ? (
                    <>
                      {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: "/(app)/review-write", params: { provider_id: provider.id, provider_name: provider.business_name } })}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 }}
                      >
                        <Ionicons name="create-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                        <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>Write a Review</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Ionicons name="chatbubbles-outline" size={36} color="#D1D5DB" />
                      <Text style={{ color: "#6B7280", fontSize: 14, marginTop: 8 }}>No reviews yet.</Text>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: "/(app)/review-write", params: { provider_id: provider.id, provider_name: provider.business_name } })}
                        style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: contentPadding, paddingVertical: 10, marginTop: 12 }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Be the first to review</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* ── MEMBERSHIPS (live data) ── */}
              {activeTab === "memberships" && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Membership Plans</Text>
                  {membershipsLoading ? (
                    <View>
                      {[1, 2].map((i) => (
                        <View key={i} style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginTop: i === 0 ? 0 : 12 }}>
                          <Skeleton width="60%" height={18} />
                          <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
                          <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
                          <Skeleton width="100%" height={40} borderRadius={10} style={{ marginTop: 8 }} />
                        </View>
                      ))}
                    </View>
                  ) : memberships.length > 0 ? (
                    memberships.map((plan) => (
                      <MembershipCard
                        key={plan.id}
                        plan={plan}
                        onJoin={() => handleJoinMembership(plan)}
                        contentPadding={contentPadding}
                      />
                    ))
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Ionicons name="card-outline" size={36} color="#D1D5DB" />
                      <Text style={{ color: "#6B7280", fontSize: 14, marginTop: 8 }}>No membership plans available yet.</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── GIFTCARD ── */}
              {activeTab === "giftcard" && (
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8 }}>Gift Cards</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280", lineHeight: 20, marginBottom: 16 }}>
                    Give the gift of beauty. Purchase a gift card for {provider.business_name} and share it with someone special.
                  </Text>
                  <View style={{ backgroundColor: "#FFF7ED", borderRadius: 16, padding: contentPadding, alignItems: "center", marginBottom: 16 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#FDE68A", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Ionicons name="gift" size={28} color="#F59E0B" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 }}>{provider.business_name}</Text>
                    <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>Choose any amount and send it digitally</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(app)/gift-card-purchase", params: { provider_id: provider.id, provider_name: provider.business_name } })}
                    style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
                  >
                    <Ionicons name="gift-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Buy a Gift Card</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Request Custom Service ── */}
            {provider.accepts_custom_requests && (
              <View style={{ paddingHorizontal: contentPadding, paddingBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/(app)/custom-request-create", params: { provider_id: provider.id, provider_name: provider.business_name } })}
                  style={{
                    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
                    alignItems: "center", flexDirection: "row", justifyContent: "center", borderStyle: "dashed",
                  }}
                >
                  <Ionicons name="sparkles-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 15 }}>Request Custom Service</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Extra bottom spacing for sticky bar */}
            <View style={{ height: 80 }} />
          </View>
        </ScrollView>

        {/* ═══════════ STICKY BOTTOM: Message + Book ═══════════ */}
        <View style={{
          flexDirection: "row", paddingHorizontal: contentPadding, paddingVertical: 12,
          borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
          paddingBottom: 28,
        }}>
          <TouchableOpacity
            onPress={handleMessage}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", marginRight: 10,
              borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14,
            }}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#374151" style={{ marginRight: 6 }} />
            <Text style={{ fontWeight: "600", color: "#374151", fontSize: 15 }}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBook}
            style={{
              flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center",
              backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
            }}
          >
            <Ionicons name="calendar-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ fontWeight: "700", color: "#fff", fontSize: 16 }}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ Report Provider Modal ═══ */}
      <Modal visible={reportModalVisible} transparent animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setReportModalVisible(false)}>
          <Pressable style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34 }} onPress={(e) => e.stopPropagation()}>
            {/* Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <View style={{ paddingHorizontal: contentPadding, paddingBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827" }}>Report Provider</Text>
                <TouchableOpacity onPress={() => setReportModalVisible(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                Select a reason and provide details so our team can review.
              </Text>

              {/* Reason chips */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
                {REPORT_REASONS.map((reason) => {
                  const active = reportReason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      onPress={() => { haptic.light(); setReportReason(reason); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: active ? "#EF4444" : "#E5E7EB",
                        backgroundColor: active ? "#FEF2F2" : "#fff",
                        marginRight: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? "600" : "400", color: active ? "#B91C1C" : "#374151" }}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Description */}
              <TextInput
                placeholder="Please describe what happened..."
                placeholderTextColor="#9CA3AF"
                value={reportDescription}
                onChangeText={setReportDescription}
                multiline
                numberOfLines={4}
                maxLength={2000}
                style={{
                  borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12,
                  padding: 14, fontSize: 14, color: "#111827", textAlignVertical: "top",
                  minHeight: 100, marginBottom: 8,
                }}
              />
              <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "right", marginBottom: 16 }}>
                {reportDescription.length}/2000
              </Text>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleSubmitReport}
                disabled={reportSubmitting || !reportReason || !reportDescription.trim()}
                style={{
                  backgroundColor: (!reportReason || !reportDescription.trim()) ? "#D1D5DB" : "#EF4444",
                  borderRadius: 12, paddingVertical: 14, alignItems: "center",
                  flexDirection: "row", justifyContent: "center",
                  opacity: reportSubmitting ? 0.7 : 1,
                }}
              >
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flag" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Submit Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
