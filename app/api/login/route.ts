import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  REGIONAL_MAX_AGE,
  STAFF_MAX_AGE,
  createRegionalToken,
  createSessionToken,
  type Role,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Relative Location: behind Lambda Web Adapter the request host is the
// adapter's local address, so absolute URLs built from req.url are wrong.
const back = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location } });

function withCookie(res: NextResponse, token: string, maxAge: number): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const secret = process.env.SESSION_SECRET ?? "";

  // Acceso regional (2026-10-13): a Propia member with a grant signs in with
  // their phone + app PIN. admin_access_login() checks the PIN against their
  // Supabase Auth hash, enforces the 5-tries lockout and logs the attempt; it
  // answers the same «credenciales» whether the phone has no grant or the PIN
  // is wrong.
  if (form.has("phone")) {
    const phone = String(form.get("phone") ?? "");
    const pin = String(form.get("pin") ?? "");
    const { data, error } = await supabaseAdmin().rpc("admin_access_login", {
      p_phone: phone,
      p_pin: pin,
    });
    const r = (data ?? {}) as { id?: string; version?: number; error?: string };
    if (error || !r.id || !r.version) {
      return back(`/login?modo=propia&error=${r.error === "bloqueado" ? "bloqueado" : "1"}`);
    }
    const token = await createRegionalToken(r.id, r.version, secret);
    return withCookie(back("/regional"), token, REGIONAL_MAX_AGE);
  }

  const password = String(form.get("password") ?? "");
  let role: Role | null = null;
  if (password && password === process.env.ADMIN_PASSWORD) role = "admin";
  else if (password && password === process.env.MARIANA_PASSWORD) role = "mariana";
  else if (password && password === process.env.DEV_PASSWORD) role = "dev";

  if (!role) return back("/login?error=1");

  const token = await createSessionToken(role, secret);
  return withCookie(back("/"), token, STAFF_MAX_AGE);
}
