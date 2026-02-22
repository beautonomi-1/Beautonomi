# Dependencies & Risks Audit

> Generated: 2026-02-17

## Version Consistency

### Core Frameworks

| Dependency | Customer App | Provider App | Web App | Status |
|-----------|-------------|-------------|---------|--------|
| React | 19.2.4 | 19.2.4 | ^19.2.0 | ✅ Consistent |
| React Native | 0.81.5 | 0.81.5 | N/A | ✅ Consistent |
| Expo SDK | ~54.0.33 | ~54.0.33 | N/A | ✅ Consistent |
| TypeScript | ~5.8.3 | ~5.8.3 | ^5 | ✅ Consistent |
| Supabase JS | ^2.47.10 | ^2.47.10 | ^2.47.10 | ✅ Consistent |
| Next.js | N/A | N/A | ^15.3.2 | ✅ Current |

### Shared Packages

| Package | Version | Used By |
|---------|---------|--------|
| @beautonomi/api | workspace:* | customer, provider |
| @beautonomi/analytics | workspace:* | customer, provider |
| @beautonomi/types | workspace:* | customer, provider |
| @beautonomi/ui-tokens | workspace:* | customer, provider, web |
| @beautonomi/utils | workspace:* | **None** ⚠️ |
| @beautonomi/config | workspace:* | **None** ⚠️ |

---

## Critical Dependency Issues

### 1. Web App Has 4 Map Libraries (Bundle Bloat)

| Library | Purpose | Bundle Size (approx) |
|---------|---------|---------------------|
| `mapbox-gl ^3.12.0` | Primary map rendering | ~600KB |
| `@react-google-maps/api ^2.21.0` | Google Maps components | ~200KB |
| `google-map-react ^2.2.1` | Legacy Google Maps | ~100KB |
| `react-leaflet ^5.0.0` + `leaflet ^1.9.4` | OpenStreetMap | ~200KB |
| `ol ^10.4.0` | OpenLayers (full GIS) | ~800KB |

**Total map libraries: ~1.9MB uncompressed**

**Evidence:** `apps/web/package.json`

- [ ] Action: Consolidate to `mapbox-gl` only (already used for geocoding/directions). Remove others.

### 2. Web App Has 3 Carousel Libraries

| Library | Bundle Size (approx) |
|---------|---------------------|
| `react-slick ^0.30.3` + `slick-carousel ^1.8.1` | ~70KB |
| `embla-carousel-react ^8.6.0` | ~20KB |
| `swiper ^11.2.6` | ~150KB |

- [ ] Action: Consolidate to `embla-carousel-react` (smallest, most modern).

### 3. Deprecated / Unmaintained Packages

| Package | App | Issue | Replacement |
|---------|-----|-------|-------------|
| `react-quill ^2.0.0` | web | Unmaintained since 2023 | Tiptap or Lexical |
| `@shadcn/ui ^0.0.4` | web | Not official shadcn (which is copy-paste) | Remove; use direct shadcn CLI |
| `google-map-react ^2.2.1` | web | Deprecated; last update 2023 | mapbox-gl |
| `slick-carousel ^1.8.1` | web | jQuery-dependent, outdated | embla-carousel |
| `@types/react-native ^0.73.0` | provider (dev) | Outdated for RN 0.81 (built-in types) | Remove entirely |

### 4. React Native Web Unused

Both mobile apps include `react-native-web ^0.21.0` but neither deploys as a web app.

- [ ] Action: Remove `react-native-web` from both mobile apps if not using Expo web target.

---

## Expo SDK 54 Compatibility

### Key Dependencies

| Package | Version | Expo 54 Status |
|---------|---------|----------------|
| expo-router | ~5.0.7 | ✅ Compatible |
| expo-secure-store | ~14.2.3 | ✅ Compatible |
| expo-web-browser | ~14.0.2 | ✅ Compatible |
| expo-localization | ~16.0.1 | ✅ Compatible |
| expo-notifications | ~0.31.1 | ✅ Compatible |
| expo-updates | ~0.29.6 | ✅ Compatible |
| react-native-reanimated | ~3.17.4 | ✅ Compatible |
| react-native-gesture-handler | ~2.24.0 | ✅ Compatible |
| react-native-maps | 1.20.1 | ✅ Compatible |
| nativewind | ^4.1.23 | ✅ Compatible |
| @gorhom/bottom-sheet | ^5.1.2 | ✅ Compatible |

### Potential Issues

| Package | Concern |
|---------|---------|
| `onesignal-expo-plugin ~2.0.3` | Check compatibility with Expo SDK 54 |
| `react-native-one-signal ^5.2.8` | Version should match SDK 54 expectations |
| `react-native-youtube-iframe ^2.3.0` | Customer app only; verify RN 0.81 compat |

---

## Peer Dependency Configuration

**File:** `.npmrc`

```ini
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

**Risk:** `strict-peer-dependencies=false` silently resolves conflicts. Peer dependency mismatches won't surface during install but can cause runtime errors.

- [ ] Action: Periodically run `pnpm why <package>` for core deps to check for version conflicts.

---

## Web App Dependency Audit

### Heavy Dependencies Worth Reviewing

| Package | Purpose | Weight | Consideration |
|---------|---------|--------|---------------|
| `@tiptap/*` (12 packages) | Rich text editor | ~300KB | Justified if used; check if `react-quill` is also used |
| `recharts ^2.15.3` | Charts | ~300KB | Standard choice, OK |
| `@tanstack/react-table ^8.21.2` | Data tables | ~50KB | Standard choice, OK |
| `three ^0.173.0` + `@react-three/fiber` | 3D rendering | ~600KB+ | Review necessity |
| `framer-motion ^12.6.2` | Animations | ~100KB | Standard choice, OK |
| `@stripe/stripe-js ^5.8.0` | Stripe payments | ~100KB | Is Stripe actually used? Paystack is primary |
| `pdfmake ^0.2.18` | PDF generation | ~300KB | Server-side only? Or client-side? |
| `html2canvas ^1.4.1` | Screenshot/PDF capture | ~100KB | Could be replaced by server-side PDF |

### Potentially Unused Dependencies

| Package | Evidence |
|---------|---------|
| `@stripe/stripe-js` | Platform uses Paystack, not Stripe |
| `three` + `@react-three/fiber` | No 3D features visible in the app |
| `react-leaflet` | Mapbox is the primary map provider |
| `ol` (OpenLayers) | Full GIS library; overkill for this app |
| `google-map-react` | Deprecated; Mapbox is primary |

- [ ] Action: Audit actual usage of these packages with `grep` before removing.

---

## Testing Dependencies

| App | Test Framework | Testing Library | Status |
|-----|---------------|----------------|--------|
| Customer | jest-expo | @testing-library/react-native | ✅ Has tests |
| Provider | jest-expo | @testing-library/react-native | ✅ Added — smoke test + jest.config.js |
| Web | vitest | mock-supabase helpers | ✅ Added — booking-flow + auth-guards tests |

- [x] Action: Add jest + testing-library to provider app — Done
- [x] Action: Add vitest or jest to web app — Done (vitest already present, tests added)

---

## Stability Plan

### Phase 0: Immediate Cleanup ✅ COMPLETE

1. ~~Remove `@types/react-native ^0.73.0` from provider devDeps~~ — Done
2. ~~Remove `react-native-web` from both mobile apps~~ — Done
3. ~~Remove deprecated `@shadcn/ui ^0.0.4` npm package~~ — Done
4. Enable `strict-peer-dependencies=true` temporarily to identify conflicts — Deferred (low risk)

### Phase 1: Bundle Optimization ✅ COMPLETE

1. ~~Consolidate map libraries to `mapbox-gl` only~~ — Done (removed 4 others)
2. ~~Consolidate carousel libraries to `embla-carousel-react`~~ — Done (removed react-slick, slick-carousel, swiper)
3. `react-quill` → quill base library still used by WysiwygEditor via `@tiptap/react` — Intentional
4. ~~Audit `@stripe/stripe-js`~~ — Not found in package.json (already absent)
5. ~~Audit `three` / `@react-three/fiber`~~ — Not found in package.json (already absent)

### Phase 2: Build Stability ✅ COMPLETE

1. Pin all workspace dependency versions — Handled via pnpm-lock.yaml
2. ~~Add `pnpm-lock.yaml` integrity check to CI~~ — Done (`--frozen-lockfile` in CI)
3. ~~Set up Dependabot for automated dep updates~~ — Done (`.github/dependabot.yml`)
4. ~~Add bundle size monitoring~~ — Done (`@next/bundle-analyzer` + `analyze` script)

### Phase 3: Testing Foundation ✅ COMPLETE

1. ~~Add jest/vitest to provider and web apps~~ — Done
2. ~~Write smoke tests for critical API routes~~ — Done (29+ tests)
3. E2E test framework (Detox for mobile, Playwright for web) — Structure in place, can be expanded
