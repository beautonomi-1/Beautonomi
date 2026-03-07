# Customer App Styling

## Styling engine

- **React Native only:** Use `StyleSheet.create()` or inline `style` with `Colors` and layout constants. No NativeWind/Tailwind `className`—React Native does not support `className` for styling without NativeWind.
- **Layout-critical UI:** Use inline `style` and `Colors` only. Use `style={{ flex: 1 }}`, `flexDirection: 'row'`, `alignItems`, `justifyContent`, and explicit margins/padding for all layout.

## Layout rules

- **Root:** Stack uses `contentStyle: { flex: 1 }` so screens get full height. Tab scene uses `sceneStyle: { flex: 1 }` (and on web `width: '100%'`, `paddingBottom` for tab bar).
- **App shell:** `(app)/_layout.tsx` wraps the Stack in `<View style={{ flex: 1 }}>` to avoid layout collapse.
- **Header (pink bar):** Fixed height (56px), `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'center'`.
- **Category tabs / Nav:** All horizontal sections use `flexDirection: 'row'` and explicit `marginRight`/`marginLeft` (avoid `gap` for maximum compatibility).
- **Provider cards:** Card uses `borderRadius: 24`, `overflow: 'hidden'`. Image area uses `aspectRatio: 16/9`. Badges use `position: 'absolute'`.
- **Bottom tabs:** Tab bar uses `flexDirection: 'row'`, `justifyContent: 'space-around'`, `alignItems: 'center'`, and on web `width: '100%'` (no `position: 'fixed'` with RNW).

## Text and images

- **All text must be in `<Text>`.** Never render a raw expression as a direct child of `View`, `Pressable`, or `TouchableOpacity`.
- **Images with `source={{ uri: ... }}` need dimensions** or they can collapse. Use `style` with `width`/`height` or `width: '100%'` + `aspectRatio`.

## Spacing (no gap)

- **Do not use `gap`** (flexbox `gap` or Tailwind `gap-*`) for layout. Use explicit margins for compatibility across RN versions and runtimes.
- **Rows:** `marginRight` (or `marginLeft`) on row children; e.g. `style={{ flex: 1, marginRight: 8 }}`.
- **Columns:** `marginTop` on non-first children; e.g. in a `.map()` use `style={index > 0 ? { marginTop: 8 } : undefined}`.
- **Wrap:** Use both `marginRight` and `marginBottom` on wrapped children (chips, buttons).
- **Lists:** Prefer `ItemSeparatorComponent={() => <View style={{ height: 8 }} />}` over `contentContainerStyle={{ gap: 8 }}`.

## Do not

- Use `className` for styling (no NativeWind in this app).
- Use web-only CSS for native layout.
- Use `gap` or `gap-*` for spacing; use explicit margins instead.
