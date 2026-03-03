# Auth + Expo Router Verification Checklist

## Prerequisites

- Supabase project with **Phone Auth** enabled (Auth → Providers → Phone)
- SMS provider configured (Twilio, MessageBird, Vonage, or TextLocal)
- `.env` or `.env.local` in `apps/customer/` with:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Login / Logout Persistence Checklist

- [ ] **1. Cold start (no session)**  
  - Open app → shows Login screen  
  - No flash of Home before redirect  

- [ ] **2. Phone OTP flow**  
  - Enter phone (e.g. `+1234567890`) → tap "Send code"  
  - Receive SMS, enter 6-digit code → tap "Verify"  
  - Redirects to Home tab  

- [ ] **3. Session persistence (foreground)**  
  - Log in → go to Profile → leave app in background (don’t kill)  
  - Return to app → still on Profile, session intact  

- [ ] **4. Session persistence (app restart)**  
  - Log in → fully close app (swipe away)  
  - Reopen app → lands on Home (not Login)  
  - Session restored from SecureStore  

- [ ] **5. Sign out**  
  - Profile → tap "Sign out"  
  - Redirects to Login  
  - Reopen app → still on Login (no session)  

- [ ] **6. Error handling**  
  - Invalid OTP → shows error alert  
  - Network offline → appropriate error message  

## Commands

```bash
# From repo root
pnpm dev:customer

# Or from apps/customer
pnpm dev
```

## File Tree (new/modified)

```
apps/customer/
├── app/
│   ├── _layout.tsx          # Root: AuthProvider, ErrorBoundary, SplashController
│   ├── index.tsx            # Auth redirect (login vs home)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx         # Phone OTP UI
│   └── (app)/
│       ├── _layout.tsx       # Protected layout
│       └── (tabs)/
│           ├── _layout.tsx
│           ├── home.tsx
│           ├── explore.tsx
│           ├── bookings.tsx
│           └── profile.tsx   # Sign out
├── src/
│   ├── lib/supabase/client.ts
│   ├── providers/AuthProvider.tsx
│   └── components/ErrorBoundary.tsx
├── .env.example
└── docs/AUTH_VERIFICATION.md
```
