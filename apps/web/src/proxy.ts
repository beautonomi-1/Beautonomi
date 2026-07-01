import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { csrfCheck, setCsrfCookie } from '@/lib/csrf';
import { maybeMarketGeoRedirect } from '@/lib/seo/maybe-market-geo-redirect';
import { isProviderOnboardingRouteAllowed } from '@/lib/provider/onboarding-route-allowlist';

const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:3000',
  'http://localhost:3001',
  /** Admin Vite dev server (`apps/admin-web` default port 5173) — credentialed API + CSRF preflight */
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
];

/** Canonical www; `/.well-known/*` must not redirect (Android App Links, Apple universal links). */
const APEX_TO_WWW: Record<string, string> = {
  'beautonomi.com': 'www.beautonomi.com',
  'beautonomi.co.za': 'www.beautonomi.co.za',
};

function normalizeHost(host: string | null): string | null {
  const value = host?.trim();
  if (!value) return null;
  return value.split(':')[0]?.toLowerCase() ?? null;
}

function configuredAdminHosts(): Set<string> {
  const raw = process.env.ADMIN_HOSTS || process.env.ADMIN_HOST || '';
  return new Set(
    raw
      .split(',')
      .map((host) => normalizeHost(host))
      .filter((host): host is string => Boolean(host)),
  );
}

function primaryAdminHost(): string | null {
  return configuredAdminHosts().values().next().value ?? null;
}

function adminHostRoutingEnabled(): boolean {
  return process.env.ENABLE_ADMIN_HOST_ROUTING !== 'false' && configuredAdminHosts().size > 0;
}

function isAdminHost(host: string | null): boolean {
  return adminHostRoutingEnabled() && host !== null && configuredAdminHosts().has(host);
}

function isFrameworkOrStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/fonts') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/api/public/manifest.webmanifest' ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs|map|woff2?|ttf|eot|json)$/i) !== null
  );
}

function isAdminHostAuthSupportPath(pathname: string): boolean {
  return (
    pathname === '/forgot-password' ||
    pathname.startsWith('/forgot-password/') ||
    pathname === '/auth/callback' ||
    pathname.startsWith('/auth/callback/') ||
    pathname === '/account-settings/login-and-security/reset-password' ||
    pathname.startsWith('/account-settings/login-and-security/reset-password/')
  );
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) =>
    typeof allowed === 'string' ? allowed === origin : allowed.test(origin),
  );
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token, X-App',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function adminSpaRoutingEnabled(): boolean {
  // Default is SPA. Set ADMIN_SPA_ROUTING=legacy to fall back to the Next.js admin pages
  // (only needed as an emergency rollback; legacy pages will be removed in a subsequent release).
  const val = (process.env.ADMIN_SPA_ROUTING || 'spa').toLowerCase();
  return val !== 'legacy';
}

function isAdminSpaBundledAsset(pathname: string): boolean {
  if (pathname.startsWith('/admin/assets/')) return true;
  return /\.(?:js|mjs|css|map|ico|png|svg|webp|woff2?|ttf|eot|json)$/i.test(pathname);
}

/** Admin UI (all roles, including superadmin) and admin APIs must not be indexed. */
function withNoIndexAdmin(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const origin = request.headers.get('origin');
    const isProviderSubscriptionCallback =
      pathname === '/provider/subscription' &&
      (request.nextUrl.searchParams.get('payment_success') === 'true' ||
        request.nextUrl.searchParams.get('payment_cancelled') === '1' ||
        request.nextUrl.searchParams.has('reference') ||
        request.nextUrl.searchParams.has('trxref'));
    const isBookingPaymentCallback = /^\/account-settings\/bookings\/[^/]+\/payment-callback$/.test(pathname);
    const isPublicPaystackCallback =
      pathname === '/shop/payment-callback' ||
      pathname === '/booking/callback' ||
      pathname === '/checkout/success' ||
      pathname === '/gift-card/purchase/success' ||
      pathname === '/provider/settings/ads/payment-return' ||
      isProviderSubscriptionCallback ||
      isBookingPaymentCallback;

    // PWA manifest must always stay public. Some preview deployments still
    // routed this through auth despite the matcher exclusion, so bypass here too.
    if (pathname === '/manifest.webmanifest' || pathname === '/api/public/manifest.webmanifest') {
      return NextResponse.next();
    }

    // Paystack callback pages + verify routes must stay public. Cross-site
    // redirects (3DS / bank auth) can legitimately arrive without session
    // cookies attached on first paint.
    if (
      isPublicPaystackCallback ||
      pathname === '/api/paystack/verify' ||
      pathname === '/api/paystack/verify-reference'
    ) {
      return NextResponse.next();
    }

    // Digital Asset Links / AASA: Google & Apple fetch `https://<apex>/.well-known/...` — must be 200, no redirect.
    if (pathname.startsWith('/.well-known/')) {
      return NextResponse.next();
    }
    const host = normalizeHost(request.headers.get('host'));
    const adminHost = primaryAdminHost();
    if (
      adminHostRoutingEnabled() &&
      adminHost &&
      !isAdminHost(host) &&
      (pathname === '/admin' || pathname.startsWith('/admin/'))
    ) {
      const url = request.nextUrl.clone();
      url.hostname = adminHost;
      return withNoIndexAdmin(NextResponse.redirect(url, 307));
    }

    const wwwHost = host ? APEX_TO_WWW[host] : undefined;
    if (wwwHost) {
      const url = request.nextUrl.clone();
      url.hostname = wwwHost;
      return NextResponse.redirect(url, 308);
    }

    const geoRedirect = maybeMarketGeoRedirect(request);
    if (geoRedirect) return geoRedirect;

    if (isAdminHost(host)) {
      if (pathname === '/') {
        return setCsrfCookie(withNoIndexAdmin(NextResponse.rewrite(new URL('/admin', request.url))));
      }

      if (
        pathname.startsWith('/api') ||
        pathname === '/admin' ||
        pathname.startsWith('/admin/') ||
        pathname.startsWith('/.well-known/') ||
        isFrameworkOrStaticPath(pathname) ||
        isAdminHostAuthSupportPath(pathname)
      ) {
        // Continue through the existing API, admin-auth, and static handling below.
      } else {
        return withNoIndexAdmin(NextResponse.redirect(new URL('/admin', request.url)));
      }
    }

    /**
     * Admin SPA rewrite — default for all /admin paths.
     * Serves the Vite SPA build from `public/admin/index.html`.
     * Legacy Next.js admin pages have been deleted; SPA is canonical.
     * Set ADMIN_SPA_ROUTING=legacy only as an emergency rollback and redeploy the legacy pages.
     * Static asset chunks under `/admin/assets/` bypass the role gate so the browser can load them
     * before authentication (they contain no sensitive data, just JS/CSS bundles).
     */
    if (adminSpaRoutingEnabled() && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
      if (isAdminSpaBundledAsset(pathname)) {
        return NextResponse.next();
      }
      /** SPA shell bypasses `/api` — still need CSRF cookie before client mutations race bootstrap GETs */
      return setCsrfCookie(withNoIndexAdmin(NextResponse.rewrite(new URL('/admin/index.html', request.url))));
    }

    // Handle CORS preflight for API routes
    if (pathname.startsWith('/api')) {
      if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
      }

      // CSRF protection for cookie-authenticated mutations.
      // Auth routes are exempt: they are pre-authentication endpoints with no
      // session cookie to protect, and the CSRF cookie may not exist yet.
      //
      // §Group-booking-audit 2026-05: also exempt low-risk idempotent sinks
      // that legitimately cannot send the CSRF header — `sendBeacon` strips
      // custom headers, and the retention sync POST may fire before the
      // client has read its first CSRF cookie. These endpoints are
      // read-mostly and rejecting them with 403 was producing noisy console
      // errors on every dashboard load.
      if (
        !pathname.startsWith("/api/auth/") &&
        pathname !== "/api/public/metrics" &&
        pathname !== "/api/me/retention/sync-on-login"
      ) {
        const csrfError = csrfCheck(request);
        if (csrfError) return csrfError;
      }

      const response = NextResponse.next();
      if (pathname.startsWith('/api/admin')) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      }
      if (origin && isAllowedOrigin(origin)) {
        const headers = corsHeaders(origin);
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
      return setCsrfCookie(response);
    }

    // Public routes - no protection needed
    const publicRoutes = [
      '/',
      '/search',
      '/category',
      '/explore',
      '/partner-profile',
      '/help',
      '/resources',
      '/become-a-partner',
      '/career',
      '/login',
      '/forgot-password',
      '/signup',
      '/gift-card',
      '/privacy-policy',
      '/terms-and-condition',
      '/accessibility',
      '/BCover-for-partners',
      '/beautonomi-friendly',
      '/admin/login', // Admin login page – auth and role check happen client-side
    ];

    const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
    
    // Handle provider profile pages - check include_in_search_engines setting
    if (pathname === '/partner-profile' || pathname.startsWith('/partner-profile')) {
      const slug = request.nextUrl.searchParams.get('slug');
      
      if (slug) {
        try {
          // Create Supabase client for checking provider settings
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          
          if (supabaseUrl && supabaseAnonKey) {
            const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
              cookies: {
                getAll() {
                  return request.cookies.getAll();
                },
                setAll() {
                  // No-op in proxy for read-only operations
                },
              },
            });
            
            // Fetch provider with user's include_in_search_engines setting
            const { data: provider } = await supabase
              .from("providers")
              .select(`
                id,
                user_id,
                users!inner(include_in_search_engines)
              `)
              .eq("slug", decodeURIComponent(slug))
              .eq("status", "active")
              .single();
            
            if (provider) {
              const prov = provider as { users?: { include_in_search_engines?: boolean } };
              const includeInSearchEngines = prov.users?.include_in_search_engines ?? false;
              
              // Create response
              const response = NextResponse.next();
              
              // Set X-Robots-Tag header if include_in_search_engines is false
              if (!includeInSearchEngines) {
                response.headers.set('X-Robots-Tag', 'noindex, nofollow');
              }
              
              return response;
            }
          }
        } catch (error) {
          // On error, continue with normal flow
          console.error("Error checking provider SEO settings in proxy:", error);
        }
      }
      
      // Continue with normal flow if no slug or error
      return NextResponse.next();
    }
    
    if (isPublicRoute) {
      const res = NextResponse.next();
      if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
        res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      }
      return res;
    }

  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/fonts') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  try {

    // Create Supabase client for proxy
    const response = NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      },
    });

    // Ensure CSRF cookie is set on page loads so it's available for API calls
    setCsrfCookie(response);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase not configured in proxy — blocking protected routes");
      return new NextResponse('Service Unavailable', { status: 503 });
    }

    let supabase;
    let user = null;

    try {
      supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      });

      // Get user - this authenticates the data by contacting Supabase Auth server
      // This is more secure than getSession() which reads directly from cookies
      // Using getUser() ensures the user data is verified with the Supabase Auth server
      const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser();
      
      if (!userError && authenticatedUser) {
        user = authenticatedUser;
      }
    } catch (error) {
      console.error("Error creating Supabase client or getting session:", error);
      const failUrl = new URL('/', request.nextUrl.origin);
      failUrl.searchParams.set('auth_error', '1');
      return NextResponse.redirect(failUrl);
    }

    // Helper function to redirect to login
    const redirectToLogin = (redirectPath: string) => {
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('redirect', redirectPath);
      redirectUrl.searchParams.set('login', 'true');
      return NextResponse.redirect(redirectUrl);
    };

    // Helper function to redirect to home
    const redirectToHome = () => {
      return NextResponse.redirect(new URL('/', request.url));
    };

    // Helper function to get user role with timeout
    const getUserRole = async (userId: string): Promise<string | null> => {
      try {
        if (!supabase) {
          console.error("Supabase client not available");
          return null;
        }

        // Add timeout to prevent hanging (reduced to 3 seconds for faster failure)
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 3000); // 3 second timeout
        });

        // Only fetch role field for faster query
        const queryPromise = supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .maybeSingle(); // Use maybeSingle instead of single to avoid errors if user doesn't exist

        const result = await Promise.race([queryPromise, timeoutPromise]);

        if (result === null) {
          console.warn("getUserRole timed out after 3 seconds");
          return null;
        }

        const { data: userData, error: userError } = result as { data?: { role: string }; error?: unknown };

        if (userError) {
          console.error("Error fetching user role:", userError);
          return null;
        }

        if (!userData) {
          console.warn("User not found in database");
          return null;
        }

        return (userData as { role: string }).role;
      } catch (error) {
        console.error("Exception in getUserRole:", error);
        return null;
      }
    };

    // Customer account routes - require authentication (any role)
    // NOTE: `/booking` is intentionally public for guest checkout entry.
    if (
      pathname.startsWith('/account-settings') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/profile')
    ) {
      if (!user) {
        return redirectToLogin(pathname);
      }
      // All authenticated users can access customer routes
      return response;
    }

    // Provider routes - require provider role (except onboarding which allows customers)
    if (pathname.startsWith('/provider')) {
      try {
        // Public: marketing/login entry and OAuth flows
        if (pathname === '/provider' || pathname.startsWith('/provider/auth')) {
          return response;
        }

        if (!user) {
          return redirectToLogin(pathname);
        }

        // Allow customers to access onboarding page
        if (pathname === '/provider/onboarding' || pathname.startsWith('/provider/onboarding/')) {
          return response;
        }

        const userRole = await getUserRole(user.id);

        if (!userRole) {
          return redirectToHome();
        }

        if (userRole === 'provider_onboarding') {
          if (isProviderOnboardingRouteAllowed(pathname)) {
            return response;
          }
          return NextResponse.redirect(new URL('/provider/get-started', request.url));
        }

        // Existing providers (and admins) proceed; everyone else starts onboarding.
        if (!['provider_owner', 'provider_staff', 'superadmin'].includes(userRole)) {
          return NextResponse.redirect(new URL('/provider/onboarding', request.url));
        }
        return response;
      } catch (error) {
        console.error("Error in provider route proxy:", error);
        return redirectToHome();
      }
    }

    // Admin routes - require admin role (any of ALL_ADMIN_ROLES); unauthenticated → admin login
    if (pathname.startsWith('/admin')) {
      try {
        if (!user) {
          // Send to dedicated admin login so user sees "Admin sign in", not global login modal
          const adminLoginUrl = new URL('/admin/login', request.url);
          adminLoginUrl.searchParams.set('next', pathname);
          return NextResponse.redirect(adminLoginUrl);
        }

        const userRole = await getUserRole(user.id);

        if (!userRole) {
          console.warn("User role not found for admin route access");
          return redirectToHome();
        }

        // Allow any admin role (superadmin + section admins); RoleGuard enforces section access client-side
        const adminRoles = [
          'superadmin',
          'support_agent',
          'admin_support',
          'admin_finance',
          'admin_trust',
          'admin_content',
          'admin_ecommerce',
          'admin_marketing',
          'admin_integrations',
          'admin_operations',
          'admin_platform_config',
        ];
        if (!adminRoles.includes(userRole)) {
          return redirectToHome();
        }

        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return response;
      } catch (error) {
        console.error("Error in admin route proxy:", error);
        // On error, redirect to home instead of causing 500
        return redirectToHome();
      }
    }

    // Default: allow through (for any other routes we haven't explicitly handled)
    return response;
  } catch (innerError) {
    console.error("Error in proxy auth logic:", innerError);
    const failUrl = new URL('/', request.nextUrl.origin);
    failUrl.searchParams.set('auth_error', '1');
    return NextResponse.redirect(failUrl);
  }
  } catch (error) {
    console.error("Unexpected error in proxy:", error);
    return new NextResponse('Service Unavailable', { status: 503 });
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
