import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { csrfCheck, setCsrfCookie } from '@/lib/csrf';

const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:3000',
  'http://localhost:3001',
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
];

/** Canonical www; `/.well-known/*` must not redirect (Android App Links, Apple universal links). */
const APEX_TO_WWW: Record<string, string> = {
  'beautonomi.com': 'www.beautonomi.com',
  'beautonomi.co.za': 'www.beautonomi.co.za',
};

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
  return (process.env.ADMIN_SPA_ROUTING || '').toLowerCase() === 'spa';
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

    // Digital Asset Links / AASA: Google & Apple fetch `https://<apex>/.well-known/...` — must be 200, no redirect.
    if (pathname.startsWith('/.well-known/')) {
      return NextResponse.next();
    }
    const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
    const wwwHost = host ? APEX_TO_WWW[host] : undefined;
    if (wwwHost) {
      const url = request.nextUrl.clone();
      url.hostname = wwwHost;
      return NextResponse.redirect(url, 308);
    }

    /**
     * Controlled admin cutover (Tier B — `ADMIN_SPA_ROUTING=spa` on deploy).
     * Serves the Vite SPA from `public/admin/` and bypasses legacy `app/admin/**` + proxy auth for HTML navigations.
     * Static chunks under `/admin/assets/` must not hit the admin role gate (see ADMIN_CUTOVER_READINESS_REPORT).
     */
    if (adminSpaRoutingEnabled() && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
      if (isAdminSpaBundledAsset(pathname)) {
        return NextResponse.next();
      }
      return withNoIndexAdmin(NextResponse.rewrite(new URL('/admin/index.html', request.url)));
    }

    // Handle CORS preflight for API routes
    if (pathname.startsWith('/api')) {
      if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
      }

      // CSRF protection for cookie-authenticated mutations.
      // Auth routes are exempt: they are pre-authentication endpoints with no
      // session cookie to protect, and the CSRF cookie may not exist yet.
      if (!pathname.startsWith("/api/auth/")) {
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
      '/against-discrimination',
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
        headers: request.headers,
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

        // Check if user is provider or admin
        if (!['provider_owner', 'provider_staff', 'superadmin'].includes(userRole)) {
          // Redirect to provider onboarding if not a provider
          return NextResponse.redirect(new URL('/become-a-partner', request.url));
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
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
