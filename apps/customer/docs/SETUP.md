# Customer App – Setup

## Required tools

- **Node.js** 18+
- **pnpm** 9.x (`npm install -g pnpm`)
- **Expo Go** (for device testing) — install from App Store / Play Store

## Environment

1. Create `.env.local` in `apps/customer/` (copy from `.env.example`):
   ```powershell
   cd apps\customer
   copy .env.example .env.local
   ```

2. Edit `.env.local` and replace placeholders with real values:
   - `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (from Supabase Dashboard → Project Settings → API)
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
   - `EXPO_PUBLIC_APP_URL` — Backend API URL (beautonomi). Use port 3000 (beautonomi default)  
     - Local: use your machine’s LAN IP, e.g. `http://192.168.88.11:3000`  
     - Production: `https://<your-domain>`

3. **Never commit** `.env.local` or real keys. It is gitignored.

## Backend required

The customer app calls a backend API. **Start the backend before the app**:

```powershell
# Terminal 1 – run beautonomi (default port 3000)
pnpm dev:backend
```

Set `EXPO_PUBLIC_APP_URL` to match (e.g. `http://localhost:3000` or `http://YOUR_IP:3000`). If the URL is wrong or the backend is not running, you will see `ERR_CONNECTION_REFUSED` on API calls.

## Install & run

From repo root:

```powershell
pnpm install
pnpm dev:customer
```

Or from app dir:

```powershell
cd apps\customer
pnpm install
pnpm dev
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Expo dev server (port 8081, fallback 8083) |
| `pnpm start:clear` | Start with cleared cache (`expo start -c --port 8081`) |
| `pnpm web` | Run in web browser |
| `pnpm android` | Open on Android device/emulator |
| `pnpm ios` | Open on iOS simulator (macOS only) |

## Android on Windows

- **Expo Go**: Works without Android Studio. Install Expo Go on your phone, scan the QR code from `pnpm dev`.
- **Emulator**: Requires Android Studio and an AVD (Android Virtual Device).

## Role

This app is for **customers** only. Provider/staff accounts will see a blocked message and sign out.

## Ports

- Default: 8081
- Fallback if in use: 8083
