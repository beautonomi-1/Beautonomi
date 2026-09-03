import { NextResponse } from "next/server";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";

/**
 * GET /api/csrf
 * Returns a CSRF token and sets the csrf_token cookie when missing.
 */
export async function GET() {
  const token = generateCsrfToken();
  const response = NextResponse.json({ token });
  response.cookies.set("csrf_token", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return setCsrfCookie(response);
}
