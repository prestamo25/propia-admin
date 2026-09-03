import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Everything except the login page + login API is gated behind a valid session
// cookie. The matcher already excludes those + static assets, so any request
// that reaches here must carry a good cookie or it bounces to /login.
// (Next 16 renamed the "middleware" file convention to "proxy".)
export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token, secret);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except the login page/API, the build-stamp endpoint
  // (deploy verification, reveals only a commit hash), Next internals, and
  // the public brand assets (the wordmark must load on the un-authenticated
  // login screen).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|logo-text.png|login|api/login|api/version).*)",
  ],
};
