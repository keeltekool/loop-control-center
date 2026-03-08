import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SESSION_COOKIE = "lcc_session";
const SESSION_VALUE = "authenticated";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function isApiAuthenticated(request: NextRequest): boolean {
  // Check Bearer token
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return token === process.env.API_KEY;
  }

  // Check session cookie
  const session = request.cookies.get(SESSION_COOKIE);
  return session?.value === SESSION_VALUE;
}

export function getSessionCookieConfig() {
  return {
    name: SESSION_COOKIE,
    value: SESSION_VALUE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
