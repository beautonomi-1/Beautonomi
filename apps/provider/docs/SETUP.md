# Provider App – Setup

## Required tools

- **Node.js** 18+
- **pnpm** 9.x (`npm install -g pnpm`)
- **Expo Go** (for device testing) — install from App Store / Play Store

## Environment

1. Create `.env.local` in `apps/provider/` (copy from `.env.example`):
   ```powershell
   cd apps\provider
   copy .env.example .env.local
   ```

2. Edit `.env.local` and replace placeholders with real values:
   - `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (from Supabase Dashboard → Project Settings → API)
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
   - `EXPO_PUBLIC_APP_URL` — Next.js web app URL  
     - Local: use your machine’s LAN IP, e.g. `http://192.168.88.11:3001`  
     - Production: `https://<your-domain>`

3. **Never commit** `.env.local` or real keys. It is gitignored.

## Install & run

From repo root:

```powershell
pnpm install
pnpm dev:provider
```

Or from app dir:

```powershell
cd apps\provider
pnpm install
pnpm dev
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Expo dev server (port 8082, fallback 8084) |
| `pnpm start:clear` | Start with cleared cache (`expo start -c --port 8082`) |
| `pnpm web` | Run in web browser |
| `pnpm android` | Open on Android device/emulator |
| `pnpm ios` | Open on iOS simulator (macOS only) |

## Android on Windows

- **Expo Go**: Works without Android Studio. Install Expo Go on your phone, scan the QR code from `pnpm dev`.
- **Emulator**: Requires Android Studio and an AVD (Android Virtual Device).

## Role

This app is for **provider_owner** and **provider_staff** only. Customer accounts will see a blocked message and sign out.

## Ports

- Default: 8082
- Fallback if in use: 8084
