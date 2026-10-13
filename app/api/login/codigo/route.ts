import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DEVICE_COOKIE,
  DEVICE_MAX_AGE,
  DEVICE_PATH,
  PENDING_COOKIE,
  SESSION_COOKIE,
  STAFF_MAX_AGE,
  createPersonaToken,
  verifyPendingToken,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkCode, sendCode, type Canal } from "@/lib/verify";
import { trustDevice } from "@/lib/devices";

// Step 2 of the team login (2026-10-13): the WhatsApp code. Only reachable
// with the 10-minute cookie /api/login sets after a correct PIN. A wrong code
// counts toward the same lockout as a wrong PIN (5 in 15 min). A right code
// also makes this browser a trusted device for 90 days (PIN-only there).

const back = (location: string, clearPending = false) => {
  const res = new NextResponse(null, { status: 303, headers: { Location: location } });
  if (clearPending) res.cookies.delete(PENDING_COOKIE);
  return res;
};

export async function POST(req: Request) {
  const form = await req.formData();
  const secret = process.env.SESSION_SECRET ?? "";
  const jar = await cookies();
  const pending = await verifyPendingToken(jar.get(PENDING_COOKIE)?.value, secret);
  if (!pending) return back("/login?error=codigo-vencido", true);

  const accion = String(form.get("accion") ?? "entrar");
  if (accion === "cancelar") return back("/login", true);

  const sb = supabaseAdmin();
  const { data } = await sb.rpc("admin_access_pending", {
    p_id: pending.accessId,
    p_version: pending.version,
  });
  const p = data as { phone: string; bloqueado: boolean } | null;
  if (!p) return back("/login?error=vencido", true);
  if (p.bloqueado) return back("/login?error=bloqueado", true);

  if (accion === "reenviar") {
    const canal: Canal = form.get("canal") === "sms" ? "sms" : "whatsapp";
    const sent = await sendCode(p.phone, canal);
    await sb.rpc("admin_access_code_event", {
      p_id: pending.accessId,
      p_evento: "codigo_enviado",
      p_detalle: sent.ok ? { canal } : { canal, error: sent.error },
    });
    return back(sent.ok ? `/login?paso=codigo&enviado=${canal}` : "/login?paso=codigo&error=envio");
  }

  const code = String(form.get("codigo") ?? "").replace(/\D/g, "");
  const result = await checkCode(p.phone, code);
  if (result === "error") return back("/login?paso=codigo&error=envio");
  if (result !== "approved") {
    const { data: locked } = await sb.rpc("admin_access_code_event", {
      p_id: pending.accessId,
      p_evento: "codigo_fallido",
      p_detalle: { motivo: result },
    });
    if (locked) return back("/login?error=bloqueado", true);
    return back(`/login?paso=codigo&error=${result === "expired" ? "codigo-vencido" : "codigo"}`);
  }

  const { data: done } = await sb.rpc("admin_access_login_complete", {
    p_id: pending.accessId,
    p_version: pending.version,
  });
  const d = done as { id: string; version: number } | null;
  if (!d) return back("/login?error=vencido", true);
  const token = await createPersonaToken(true, d.id, d.version, secret);
  const res = back("/", true);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: STAFF_MAX_AGE });
  const device = await trustDevice(d.id, req.headers.get("user-agent"));
  if (device) {
    res.cookies.set(DEVICE_COOKIE, device, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: DEVICE_PATH,
      maxAge: DEVICE_MAX_AGE,
    });
  }
  return res;
}
