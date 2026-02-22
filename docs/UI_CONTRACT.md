# Beautonomi UI Contract

Shared design tokens and component specs for web (Tailwind + shadcn) and mobile (NativeWind). Same look & feel across platforms without forcing web-only components onto RN.

---

## 1. Token File Structure

```
packages/ui-tokens/
├── package.json
├── nativewind-preset.js      # Self-contained; required by both web & RN Tailwind configs
├── src/
│   ├── index.ts              # Main exports (built to dist/)
│   ├── colors.ts             # Color palette
│   ├── spacing.ts            # Spacing scale (Tailwind-compatible)
│   ├── radius.ts             # Border radius
│   ├── shadows.ts            # Box shadows + shadowsRN (for StyleSheet)
│   ├── typography.ts         # Font family, size, weight, line-height
│   └── tailwind-preset.ts    # Full Tailwind preset (uses TS sources)
```

---

## 2. Web Tailwind Config

**File:** `apps/web/tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

const beautonomiPreset = require("@beautonomi/ui-tokens/nativewind-preset");

const config: Config = {
  darkMode: ["class"],
  presets: [beautonomiPreset],
  content: [...],
  theme: {
    container: { ... },
    extend: {
      fontFamily: { airbnb: [...] },
      backgroundImage: { ... },
      colors: { border: "hsl(var(--border))", ... },  // Override for CSS vars
      keyframes: { ... },
      animation: { ... },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

---

## 3. NativeWind Config (Mobile)

**File:** `apps/customer/tailwind.config.js` and `apps/provider/tailwind.config.js`

```js
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [
    require("nativewind/preset"),
    require("@beautonomi/ui-tokens/nativewind-preset"),
  ],
  theme: { extend: {} },
  plugins: [],
};
```

**Other required files:**
- `global.css` — `@tailwind base; @tailwind components; @tailwind utilities;`
- `babel.config.js` — `babel-preset-expo` with `jsxImportSource: "nativewind"`, `nativewind/babel`
- `metro.config.js` — `withNativeWind(config, { input: "./global.css" })`
- Import `./global.css` at top of `App.tsx`

---

## 4. Component Specs (Props + Token Usage)

Use these specs when implementing web (shadcn-style) or RN components. Keep implementations separate; share only tokens and layout rules.

### 4.1 Button

| Prop         | Type                 | Default | Token usage                         |
|--------------|----------------------|---------|-------------------------------------|
| variant      | `primary` \| `secondary` \| `outline` \| `ghost` | `primary` | `bg-primary`, `bg-secondary`, `border`, etc. |
| size         | `sm` \| `md` \| `lg` | `md`    | `px-3 py-1.5`, `px-4 py-2`, `px-6 py-3` |
| disabled     | boolean              | false   | `opacity-50`                        |
| fullWidth    | boolean              | false   | `w-full`                            |

**Tokens:**
- Primary: `bg-primary text-primary-foreground`
- Secondary: `bg-secondary text-secondary-foreground`
- Outline: `border-2 border-secondary bg-transparent`
- Radius: `rounded-lg` (radius.lg = 8px)
- Shadow: `shadow-sm` (soft)
- Spacing: `px-4 py-2` (size md)

---

### 4.2 Card

| Prop    | Type   | Default | Token usage                  |
|---------|--------|---------|------------------------------|
| variant | `default` \| `elevated` | `default` | `bg-card`, `shadow-md` for elevated |
| padding | `none` \| `sm` \| `md` | `md`      | `p-0`, `p-3`, `p-4`          |

**Tokens:**
- Background: `bg-card text-card-foreground`
- Radius: `rounded-lg`
- Shadow: `shadow-sm` (default), `shadow-md` (elevated)
- Border: `border border-border` (optional)

---

### 4.3 Badge

| Prop    | Type                    | Default   | Token usage                         |
|---------|-------------------------|-----------|-------------------------------------|
| variant | `default` \| `secondary` \| `tertiary` \| `outline` | `default` | `bg-primary`, `bg-secondary`, `bg-tertiary`, `border` |
| size    | `sm` \| `md`            | `md`      | `text-xs px-2 py-0.5`, `text-sm px-2.5 py-1` |

**Tokens:**
- Default: `bg-primary text-primary-foreground`
- Secondary: `bg-secondary text-secondary-foreground`
- Tertiary: `bg-tertiary text-white`
- Radius: `rounded-md`
- Typography: `text-xs` or `text-sm`, `font-medium`

---

## 5. Layout Rules

- **Spacing:** Use `p-4`, `gap-3`, `space-y-4` etc. from token scale
- **Radius:** Prefer `rounded-lg` (8px) for cards/containers; `rounded-md` (6px) for buttons/inputs
- **Shadows:** Prefer `shadow-sm`; use `shadow-md` sparingly for elevation
- **Typography:** `text-base` for body; `text-sm` for secondary; `text-lg`/`text-xl` for headings

---

## 6. Iconography

- **Web:** `lucide-react`
- **RN:** `lucide-react-native`

Use same icon names for parity. Map semantic usage (e.g. "check" for success, "x" for close) across both.

---

## 7. Implementation Strategy

- **Do not** create a shared `packages/ui` that forces RN components to use web primitives
- **Do** implement Button, Card, Badge separately in `apps/web` (shadcn-style) and `apps/customer`/`apps/provider` (RN View/Text + NativeWind classes)
- **Do** enforce identical token usage per spec
- **Do** reuse `@beautonomi/ui-tokens` for shadowsRN when using StyleSheet (e.g. for components that need programmatic styles)
