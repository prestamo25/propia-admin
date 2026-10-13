// The WhatsApp code of the team login (2026-10-13), through Twilio Verify —
// the same Verify service that sends the app's login codes, so it arrives from
// the same Propia sender with the same template. The service id lives in the
// Supabase Auth config (sms_twilio_verify_message_service_sid) and is read from
// there with the Management API token the panel already holds, so no second
// copy of it is kept anywhere; the Twilio credentials are the panel's own
// (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN, same account).
//
// Codes are only ever requested after a correct PIN (app/api/login).

const PROJECT_REF = "rydwxmfhwxlafanlfoce";
let serviceSid: string | null = null;

async function verifyService(): Promise<string> {
  if (serviceSid) return serviceSid;
  const token = process.env.SUPABASE_MGMT_TOKEN;
  if (!token) throw new Error("Falta SUPABASE_MGMT_TOKEN");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase config ${res.status}`);
  const cfg = (await res.json()) as { sms_twilio_verify_message_service_sid?: string | null };
  const sid = cfg.sms_twilio_verify_message_service_sid;
  if (!sid?.startsWith("VA")) throw new Error("No hay servicio de Twilio Verify en la config de Supabase");
  serviceSid = sid;
  return sid;
}

function twilioAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

// users.phone is bare digits (52 + 10, or 1 + 10).
const e164 = (phone: string) => `+${phone.replace(/\D/g, "")}`;

async function post(path: string, body: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${await verifyService()}/${path}`, {
    method: "POST",
    headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  return { ok: res.ok, status: res.status, json };
}

export type Canal = "whatsapp" | "sms";

export async function sendCode(phone: string, canal: Canal): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await post("Verifications", { To: e164(phone), Channel: canal, Locale: "es" });
    if (r.ok) return { ok: true };
    return { ok: false, error: `${r.json.code ?? r.status}: ${r.json.message ?? "Twilio"}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// approved = right code. wrong = a code that doesn't match. expired = nothing
// pending for this phone (it ran out, or Twilio's own attempt cap was hit).
export async function checkCode(phone: string, code: string): Promise<"approved" | "wrong" | "expired" | "error"> {
  if (!/^\d{4,10}$/.test(code)) return "wrong";
  try {
    const r = await post("VerificationCheck", { To: e164(phone), Code: code });
    if (r.status === 404 || r.json.code === 20404 || r.json.code === 60202) return "expired";
    if (!r.ok) return "error";
    return r.json.status === "approved" ? "approved" : "wrong";
  } catch {
    return "error";
  }
}
