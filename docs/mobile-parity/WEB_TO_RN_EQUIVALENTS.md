# Web UI → React Native Equivalents

Mapping table for implementing web client portal UX in React Native (Expo). Use shared `@beautonomi/ui-tokens` for design consistency.

---

## Design Tokens (ui-tokens)

| Token | Web | RN Usage |
|-------|-----|----------|
| **Brand** | `#FF0077` | `colors.brand` or hardcode `#FF0077` (primary accent) |
| **Spacing** | Tailwind `p-4`, `gap-4`, `mb-6` | `spacing[4]` = 16, `spacing[6]` = 24 |
| **Font** | `font-beautonomi`, `text-sm`, `font-medium` | `fontFamily.sans`, `fontSize.sm`, `fontWeight.medium` |
| **Radius** | `rounded-lg`, `rounded-full` | `radius.lg`, `radius.full` |
| **Shadows** | `shadow-sm`, `shadow-lg` | `shadowsRN.sm`, `shadowsRN.lg` |

**Screen padding (parity):** `paddingHorizontal: 16` (matches `px-4`), `paddingBottom: 100` for tab screens, `paddingBottom: 48` for stack screens.

---

## Components Mapping

| Web Pattern | RN Equivalent | Library / Notes |
|-------------|---------------|-----------------|
| **Cards** | `View` + `Pressable` with `style` | Border, `borderRadius`, `backgroundColor`, `padding`; use `shadowsRN` |
| **Buttons** | `Pressable` + `Text` | Primary: `bg-[#FF0077]`; Secondary: `border`; use `@expo/vector-icons` for icon buttons |
| **Inputs** | `TextInput` | `borderWidth`, `borderRadius`, `padding`; use `KeyboardAvoidingView` for forms |
| **Tabs** | `expo-router` `Tabs` | `tabBarActiveTintColor: "#FF0077"`; `useSafeAreaInsets` for bottom padding |
| **Modals** | `Modal` from react-native | Full-screen or centered; use `StatusBar` for bar style |
| **Bottom Sheets** | `@gorhom/bottom-sheet` or `Modal` with slide-up | Prefer bottom sheet for filters, payment method picker |
| **Dropdowns** | `Modal` + `FlatList` or `react-native-picker-select` | Web Select → RN: modal picker or custom dropdown |
| **Toasts** | `react-native-toast-message` or custom | Web `sonner` → RN: toast library; position top/bottom |
| **Skeletons** | Custom `View` with `shimmer` or `expo-linear-gradient` | `react-native-reanimated` for animation; match web skeleton layout |
| **Images** | `expo-image` (preferred) or `Image` | `contentFit="cover"`; placeholder/blurhash |
| **Lists** | `FlatList` | `keyExtractor`, `renderItem`; `ListFooterComponent` for load more |
| **Masonry** | `FlatList` with `numColumns` or `react-native-masonry-list` | Explore feed: 2-column grid with varying heights |
| **Maps** | `react-native-maps` or Mapbox `StaticMapImage` | Web Mapbox → RN: `@rnmapbox/maps` or static tile image |
| **Date Picker** | `@react-native-community/datetimepicker` | Native date picker; wrap in modal for inline UX |
| **Time Picker** | Same as date picker (mode="time") | Time slot selection: custom `ScrollView` of chips |
| **Rating Display** | `View` + star icons (`@expo/vector-icons`) | 5 stars, half-star support; `Star` or `StarHalf` |
| **Chip Filters** | `ScrollView` horizontal + `Pressable` | `borderRadius: 9999`, active: `bg-[#FF0077]`, inactive: `bg-gray-100` |
| **Avatar** | `expo-image` circular | `borderRadius: width/2`, `overflow: hidden` |
| **Badge** | `View` with `Text` | Small circle or pill; `position: absolute` for notification count |
| **Sheet/Drawer** | `Modal` or `@gorhom/bottom-sheet` | Side drawer: `Drawer` from expo-router; bottom: bottom-sheet |

---

## Behavior Differences

| Aspect | Web | RN |
|--------|-----|----|
| **Scroll** | Native scroll, `overscroll-behavior` | `ScrollView` / `FlatList`; bounce on iOS |
| **Pull-to-refresh** | Custom or lib | `RefreshControl` on `ScrollView` / `FlatList` |
| **Infinite scroll** | `IntersectionObserver` | `onEndReached` on `FlatList` |
| **Keyboard** | Auto-resize/scroll | `KeyboardAvoidingView`, `Keyboard.dismiss()` |
| **Links** | `<Link href>` | `router.push()` from expo-router |
| **Back** | `router.back()` | `router.back()` or hardware back |
| **Safe area** | `pb-safe` (CSS env) | `useSafeAreaInsets()`, `SafeAreaView` |
| **Haptics** | None | `expo-haptics` for buttons, success |

---

## Layout Constants (apps/customer)

Defined in `src/constants/layout.ts`:

```ts
SCREEN_PADDING = 16
TAB_CONTENT_PADDING_BOTTOM = 100
STACK_CONTENT_PADDING_BOTTOM = 48
BRAND_COLOR = "#FF0077"
```

Use these for parity with web mobile view.

---

## Icon Mapping (Web Lucide → RN)

| Web (lucide-react) | RN (@expo/vector-icons) |
|-------------------|-------------------------|
| Home | Ionicons `home` |
| Search | Ionicons `search` |
| Calendar | Ionicons `calendar` |
| MessageSquare | Ionicons `chatbubbles` |
| User | Ionicons `person` |
| Heart | Ionicons `heart` / `heart-outline` |
| Settings | Ionicons `settings` |
| ChevronRight | Ionicons `chevron-forward` |
| Star | Ionicons `star` |
| MapPin | Ionicons `location` |
| CreditCard | Ionicons `card` |
