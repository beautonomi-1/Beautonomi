# Beautonomi Design System

This doc aligns **Tailwind CSS**, **NativeWind**, and **React Native** so the UI is consistent across **web**, **iOS**, and **Android**, with no conflicting styles.

---

## 1. Design libraries

| Layer | Role |
|-------|------|
| **Tailwind CSS** | Utility classes for layout, spacing, typography, colors. |
| **NativeWind 4** | Maps Tailwind to React Native styles; use `className` in RN. |
| **@beautonomi/ui-tokens** | Shared design tokens (colors, spacing, radius, shadows). NativeWind preset: `@beautonomi/ui-tokens/nativewind-preset`. |
| **App constants** | `src/constants/colors.ts` (customer & provider): `Colors`, `Shadows`, `shadow()` for **inline `style`** when you need JS (e.g. `ActivityIndicator color={Colors.primary}`). |

**Rule:** Prefer **Tailwind/NativeWind** (`className`) for layout and theming. Use **inline `style`** only when you need platform-specific values, dynamic values, or APIs that don’t accept className (e.g. `ActivityIndicator`, `RefreshControl`).

---

## 2. Tailwind + NativeWind alignment

- **Customer & provider** both use:
  - `tailwind.config.js` with presets: `nativewind/preset` and `@beautonomi/ui-tokens/nativewind-preset`.
  - Same semantic colors: `primary` (#FF0077), `muted`, `secondary`, `tertiary`, etc., so `bg-primary`, `text-primary` match the brand.
- **Web app** (`apps/web`) uses its own Tailwind config and CSS variables; it does not use NativeWind.
- **Semantic tokens** (from ui-tokens):
  - `primary` = brand pink (CTAs, links).
  - `muted` = soft gray (backgrounds, borders).
  - `secondary` = dark neutral (headings, body).
  - `tertiary` = teal (secondary CTAs).

---

## 3. React Native: Web vs iOS vs Android

### 3.1 When to branch

- Use **`Platform.OS === "web"`** for:
  - Web-only behavior (e.g. no splash screen, different scroll/layout if needed).
  - **Shadows:** on web use `boxShadow`; on native use `shadow*` + `elevation` (see below).
- Use **`Platform.select({ ios: ..., android: ..., default: ... })`** when a style or behavior differs only between iOS and Android (e.g. Android elevation, iOS shadow only).

### 3.2 Shadows (no conflicts)

- **iOS:** `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`.
- **Android:** `elevation` (shadow* props are ignored); use both for cross-platform cards.
- **Web:** `boxShadow` (React Native for Web supports it).

**Do:** Use the shared **`shadow()`** or **`Shadows`** from `@/constants/colors` so one call site gives correct behavior on all platforms. Example:

```ts
import { Shadows } from "@/constants/colors";
<View style={[Styles.card, Shadows.card]} />
```

**Tailwind:** NativeWind maps Tailwind shadow utilities to platform-appropriate props where supported. For critical cards, prefer `Shadows` from constants so Android always gets `elevation`.

### 3.3 Safe area & status bar

- Use **SafeAreaProvider** and **SafeAreaView** (or **edges** on screens) so content is not under notches or home indicators.
- **StatusBar:** Set once at root (e.g. `<StatusBar style={isDark ? "light" : "dark"} />`). Don’t mix conflicting status bar styles.

### 3.4 Touch targets (iOS & Android)

- Minimum **44pt (iOS)** / **48dp (Android)** for tappable areas. Use at least `p-3` / `min-h-[44px]` or equivalent for buttons and list rows so the UI feels native on both.

---

## 4. iOS & Android polish

- **Scroll:** Use `ScrollView` / `FlatList` with `contentContainerStyle` for padding; avoid layout that only works on one platform.
- **Keyboard:** Use `KeyboardAvoidingView` with `behavior={Platform.OS === "ios" ? "padding" : undefined}` (or "height") where needed so inputs aren’t covered on iOS; test on Android as well.
- **Haptics:** Use `expo-haptics` for feedback on **native only**; guard with `Platform.OS !== "web"` if you trigger haptics from shared code.
- **Responsive layout:** Use `useResponsive()` (customer) or provider equivalent for `contentPadding` / `screenPadding` and `contentMaxWidth` so tablet and web get consistent insets and max width; avoid hardcoded `16`/`24` at screen level.

---

## 5. Avoiding conflicts

1. **Single source for brand color:** Use `#FF0077` only in ui-tokens and app `tailwind.config.js` (or constants). Everywhere else use `Colors.primary`, `bg-primary`, or `text-primary`.
2. **Don’t mix overlapping rules:** Prefer either `className` or `style` for a given property on a component; avoid setting the same thing in both in a way that fights (e.g. same color in both).
3. **Web vs native entry:** Both customer and provider import `global.css` in root `_layout.tsx` for Tailwind; that’s correct. Don’t add duplicate or conflicting global styles elsewhere.
4. **Preset vs app config:** App `tailwind.config.js` may extend theme (e.g. `primary-light`) but should not redefine semantic tokens (e.g. `primary`, `muted`) in a way that contradicts ui-tokens.

---

## 6. Quick reference

| Need | Use |
|------|-----|
| Layout, spacing, typography, colors in RN | `className` (Tailwind via NativeWind) |
| Brand color in RN | `className="... bg-primary text-primary"` or `Colors.primary` in `style` |
| Cross-platform shadow | `Shadows.card` / `shadow()` from `@/constants/colors` |
| Platform-specific style | `Platform.select({ ios: ..., android: ..., default: ... })` |
| Responsive padding / width | `useResponsive()` → `contentPadding` / `screenPadding` / `contentMaxWidth` |
| Safe area | SafeAreaProvider + SafeAreaView or `edges` on screens |
| Touch targets | Min ~44pt height/padding for primary actions |

Following this keeps **Tailwind**, **NativeWind**, and **native (iOS/Android)** aligned and avoids conflicting design libraries and styles across web and mobile.
