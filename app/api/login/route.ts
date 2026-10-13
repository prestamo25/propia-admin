import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DEVICE_COOKIE,
  PASSWORD_ROLES,
  PENDING_COOKIE,
  PENDING_MAX_AGE,
  REGIONAL_MAX_AGE,
  SESSION_COOKIE,
  STAFF_MAX_AGE,
  createPendingToken,
  createPersonaToken,
  createSessionToken,
  type Role,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendCode } from "@/lib/verify";
import { deviceTrusted } from "@/lib/devices";

// Relative Location: behind Lambda Web Adapter the request host is the
// adapter's local address, so absolute URLs built from req.url are wrong.
const back = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location } });

function withCookie(res: NextResponse, name: string, token: string, maxAge: number): NextResponse {
  res.cookies.set(name, token, {
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
  const sb = supabaseAdmin();

  // Phone + app PIN (2026-10-13) — everyone. admin_access_login() checks the
  // PIN against the member's Supabase Auth hash and enforces the 5-tries
  // lockout. Wrong PIN or no Propia account ⇒ «credenciales»; the right PIN on
  // an account without panel access ⇒ «sin_privilegios» (only someone who just
  // proved the account is theirs ever sees that). A regional viewer is in; the
  // team gets a WhatsApp code first
  // (/api/login/codigo), with only a 10-minute «passed the PIN» cookie meanwhile
  // — unless this browser is one of their trusted devices (a code here in the
  // last 90 days), where the PIN is enough.
  if (form.has("phone")) {
    const { data, error } = await sb.rpc("admin_access_login", {
      p_phone: String(form.get("phone") ?? ""),
      p_pin: String(form.get("pin") ?? ""),
    });
    const r = (data ?? {}) as { id?: string; version?: number; rol?: string; phone?: string; error?: string };
    if (error || !r.id || !r.version || !r.phone) {
      const why = r.error === "bloqueado" ? "bloqueado" : r.error === "sin_privilegios" ? "sin-privilegios" : "1";
      return back(`/login?error=${why}`);
    }
    if (r.rol === "regional") {
      const token = await createPersonaToken(false, r.id, r.version, secret);
      return withCookie(back("/regional"), SESSION_COOKIE, token, REGIONAL_MAX_AGE);
    }
    const jar = await cookies();
    if (await deviceTrusted(r.id, jar.get(DEVICE_COOKIE)?.value)) {
      const { data: done } = await sb.rpc("admin_access_login_complete", {
        p_id: r.id,
        p_version: r.version,
        p_dispositivo: true,
      });
      const d = done as { id: string; version: number } | null;
      if (d) {
        const token = await createPersonaToken(true, d.id, d.version, secret);
        return withCookie(back("/"), SESSION_COOKIE, token, STAFF_MAX_AGE);
      }
    }
    const sent = await sendCode(r.phone, "whatsapp");
    await sb.rpc("admin_access_code_event", {
      p_id: r.id,
      p_evento: "codigo_enviado",
      p_detalle: sent.ok ? { canal: "whatsapp" } : { canal: "whatsapp", error: sent.error },
    });
    const pending = await createPendingToken(r.id, r.version, secret);
    return withCookie(
      back(sent.ok ? "/login?paso=codigo" : "/login?paso=codigo&error=envio"),
      PENDING_COOKIE,
      pending,
      PENDING_MAX_AGE,
    );
  }

  // Team passwords — only those still in PASSWORD_ROLES (fase 2: Franz's
  // emergency password alone). Every use is logged and reaches Telegram.
  const password = String(form.get("password") ?? "");
  const byPassword: [Role, string | undefined][] = [
    ["admin", process.env.ADMIN_PASSWORD],
    ["mariana", process.env.MARIANA_PASSWORD],
    ["dev", process.env.DEV_PASSWORD],
  ];
  const role =
    byPassword.find(([r, pw]) => PASSWORD_ROLES.includes(r) && !!pw && password === pw)?.[0] ?? null;
  if (!role) return back("/login?modo=contrasena&error=1");

  await sb.from("admin_access_log").insert({ evento: "emergencia", detalle: { rol: role } });
  const token = await createSessionToken(role, secret);
  return withCookie(back("/"), SESSION_COOKIE, token, STAFF_MAX_AGE);
}
