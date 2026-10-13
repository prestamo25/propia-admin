import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Everything except the login page + login API is gated behind a valid session
// cookie. The matcher already excludes those + static assets, so any request
// that reaches here must carry a good cookie or it bounces to /login.
// (Next 16 renamed the "middleware" file convention to "proxy".)
//
// A REGIONAL session (acceso regional, 2026-10-13) is read-only and fenced to
// its own screens: GET only — so no server action, whatever its id, ever runs
// for it — and only the paths below. Whether the grant is still alive, and
// which of these sections it includes, is checked by each page/API
// (lib/access.ts); this layer only keeps everything else out of reach.
const REGIONAL_PATHS = [
  /^\/regional$/,
  /^\/mapa$/,
  /^\/zonas$/,
  /^\/brokers$/,
  /^\/broker\/[0-9a-f-]{36}$/,
  /^\/api\/zonas\/(mapa|colonias)$/,
  /^\/api\/logout$/,
];

export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, secret);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (session.kind === "staff") return NextResponse.next();

  const path = req.nextUrl.pathname;
  const readOnly = (req.method === "GET" || req.method === "HEAD") && !req.headers.has("next-action");
  if (readOnly && REGIONAL_PATHS.some((r) => r.test(path))) return NextResponse.next();
  if (!readOnly || path.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/regional";
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
