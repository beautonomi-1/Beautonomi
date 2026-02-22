# Mobile Architecture

## Overview

Beautonomi mobile apps (customer + provider) share:

- **Expo** (SDK 54) for iOS/Android
- **Expo Router** for file-based routing
- **Supabase Auth** (phone OTP)
- **NativeWind** for styling
- **Shared packages**: `@beautonomi/api`, `@beautonomi/analytics`, `@beautonomi/types`, `@beautonomi/ui-tokens`

## Apps

| App        | Port  | Role gate                     | API prefix     |
|------------|-------|-------------------------------|----------------|
| customer   | 8081  | customer only                 | /api/me/*      |
| provider   | 8082  | provider_owner, provider_staff| /api/provider/*|

## API Client

- `packages/api`: `createApiClient({ baseUrl, getAccessToken })`
- Injects `Authorization: Bearer <token>` from Supabase session
- Web API supports Bearer token (pass `request` to `requireRoleInApi`)

## Analytics

- Config from `GET /api/public/analytics-config`
- Amplitude SDK: `@beautonomi/analytics/react-native`
- Admin config: `/admin/integrations/amplitude` or `/admin/settings/integrations/analytics`

## Mapbox

- `packages/api`: `geocode(baseUrl, { query, ... })`, `reverseGeocode(baseUrl, { longitude, latitude })`
- Proxies to apps/web `/api/mapbox/*`

## Notifications (OneSignal)

- Placeholder: `useDeviceRegistration` in customer app
- Register with `POST /api/me/devices` when OneSignal keys are set
