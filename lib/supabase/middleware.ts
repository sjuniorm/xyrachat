import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/privacy",
  "/terms",
  // /reset-password is reached via a recovery link that signs the user in
  // first — we must let them through whether or not a session exists, so it
  // can't go in AUTH_PATHS (which redirects authed users away).
  "/reset-password",
  // /accept-invite is the landing page for someone who just clicked an
  // invite magic-link — they're already signed in but have no password yet,
  // so we don't want middleware to redirect them to /dashboard.
  "/accept-invite",
];
const AUTH_PATHS = ["/login", "/signup", "/forgot-password"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Webhooks have no session cookie — they verify themselves via HMAC.
  if (pathname.startsWith("/api/webhooks/")) return true;
  // GDPR + auth-gated APIs do their own auth checks inside the handler.
  if (pathname.startsWith("/api/gdpr")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: must call getUser() (not getSession) to refresh tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Authenticated users away from auth screens.
  if (user && AUTH_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Unauthenticated users away from protected screens.
  const isProtected =
    !isPublicPath(pathname) && !AUTH_PATHS.includes(pathname);
  if (!user && isProtected) {
    // For /api/* protected routes, respond with JSON 401 instead of an HTML
    // redirect (clients/curl/fetch handle that correctly; HTML redirect breaks
    // JSON consumers).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
