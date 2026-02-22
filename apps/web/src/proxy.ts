import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
      'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const origin = request.headers.get('origin');

    // Handle CORS preflight for API routes
    if (pathname.startsWith('/api')) {
      if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
      }
      const response = NextResponse.next();
      if (origin && isAllowedOrigin(origin)) {
        const headers = corsHeaders(origin);
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
      return response;
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
      '/stays',
      '/gift-card',
      '/privacy-policy',
      '/terms-and-condition',
      '/accessibility',
      '/against-discrimination',
      '/investors',
      '/BCover-for-partners',
      '/beautonomi-friendly',
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
              const userData = (provider as any).users;
              const includeInSearchEngines = userData?.include_in_search_engines ?? false;
              
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
      return NextResponse.next();
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      // If Supabase not configured, allow through (will fail at API level)
      console.warn("Supabase not configured in proxy");
      return response;
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
      // On error, allow through - let the page handle auth
      return response;
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

        const { data: userData, error: userError } = result as any;

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

    // Customer routes - require authentication (any role)
    if (
      pathname.startsWith('/account-settings') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/booking') ||
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

    // Admin routes - require superadmin role
    if (pathname.startsWith('/admin')) {
      try {
        if (!user) {
          return redirectToLogin(pathname);
        }

        const userRole = await getUserRole(user.id);

        if (!userRole) {
          console.warn("User role not found for admin route access");
          return redirectToHome();
        }

        // Check if user is superadmin
        if (userRole !== 'superadmin') {
          return redirectToHome();
        }

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
    // Catch errors in auth logic
    console.error("Error in proxy auth logic:", innerError);
    // Allow through on error
    return NextResponse.next();
  }
  } catch (error) {
    // Catch any unexpected errors in proxy (including pathname access)
    console.error("Unexpected error in proxy:", error);
    // Return a response to prevent 500 error
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
