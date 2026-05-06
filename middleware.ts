import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on every path except static assets, image optimisation, and
    // framework-generated metadata files (manifest, sitemap, robots, etc.).
    // Without this, /manifest.webmanifest etc. get redirected to /login and
    // the browser fails to parse the HTML as JSON.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff|woff2|ttf|map|webmanifest|xml|txt|json)$).*)",
  ],
};
