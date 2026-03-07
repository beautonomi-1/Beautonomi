# Provider App Styling

## Styling engine

- **Layout and colors** use **`style={twStyle("...")}`** with the runtime helper **`@/lib/twStyle`**. This turns Tailwind-like class strings into React Native style objects so Yoga gets correct layout on device.
- **Do not use `className`** — it was removed in favor of `twStyle(...)` for RN compatibility.
- For dynamic or one-off values, use inline `style` and/or **`Colors`** from `@/constants/colors`. Merge with twStyle when needed: `style={[twStyle("..."), { ... }]}`.

## Layout rules

- **Root:** Stack uses `contentStyle: { flex: 1 }` so screens fill the screen.
- **App shell:** `(app)/_layout.tsx` wraps Stack in `<View style={{ flex: 1 }}>`.
- **Horizontal sections:** Use `flexDirection: 'row'` for headers, tab bars, and category strips.
- **Bottom tabs:** Use `flexDirection: 'row'`, `justifyContent: 'space-around'` where applicable.

## Spacing (no gap)

- **Do not use `gap`** (flexbox `gap` or Tailwind `gap-*`) in `twStyle(...)`. Use explicit margins for compatibility.
- **Rows:** Add `marginRight` (e.g. 8 or 12) to row children: `style={[twStyle("flex-1"), { marginRight: 8 }]}`.
- **Columns:** Add `marginTop` to non-first children; in `.map()` use `idx > 0 ? { marginTop: 12 } : undefined`.
- **Wrap:** Use `marginRight` and `marginBottom` on wrapped items (chips, icon grids).
- **FlatList:** Use `ItemSeparatorComponent={() => <View style={{ height: 8 }} />}` instead of `contentContainerStyle={{ gap: 8 }}`.

## Text and images

- **All text must be in `<Text>`.** Never render a raw expression as a direct child of `View`, `Pressable`, or `TouchableOpacity` (e.g. ❌ `{item.name}`). Use ✅ `<Text>{item.name}</Text>`.
- **Images with `source={{ uri: ... }}` need dimensions in `style`** or they can collapse to 0×0. Use e.g. `style={{ width: '100%', aspectRatio: 16/9 }}` or explicit `width`/`height`. Do not rely on `className` for image size on native.
