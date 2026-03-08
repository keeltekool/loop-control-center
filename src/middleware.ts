import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: check Bearer token OR session cookie
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const authHeader = request.headers.get("authorization");
    const hasBearer =
      authHeader?.startsWith("Bearer ") &&
      authHeader.slice(7) === process.env.API_KEY;
    const hasSession =
      request.cookies.get("lcc_session")?.value === "authenticated";

    if (!hasBearer && !hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Dashboard pages: check session cookie
  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    // Redirect to login if no session — but the main page IS the dashboard
  }

  // Login page: allow always
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Protected pages (everything except /login and static assets)
  const isProtected =
    pathname === "/" ||
    pathname.startsWith("/dashboard");

  if (isProtected) {
    const session = request.cookies.get("lcc_session");
    if (session?.value !== "authenticated") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
