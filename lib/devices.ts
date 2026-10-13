import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Trusted devices of the team login (2026-10-13). The cookie carries
// "<device id>.<token>"; admin_trusted_device keeps only sha256(token), so a
// database read never yields a usable cookie. Checks and writes are SQL
// (admin-dispositivos-2026-10-13.sql), service_role only.

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Is this browser trusted for this person? Marks it used when it is.
export async function deviceTrusted(accessId: string, cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  const id = cookie.slice(0, dot);
  const token = cookie.slice(dot + 1);
  if (dot < 0 || !UUID.test(id) || token.length < 32) return false;
  const { data } = await supabaseAdmin().rpc("admin_access_device_ok", {
    p_access: accessId,
    p_device: id,
    p_hash: sha256(token),
  });
  return data === true;
}

// Remember this browser for this person; returns the cookie value.
export async function trustDevice(accessId: string, userAgent: string | null): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabaseAdmin().rpc("admin_access_device_add", {
    p_access: accessId,
    p_hash: sha256(token),
    p_user_agent: userAgent ?? "",
  });
  if (error || typeof data !== "string") return null;
  return `${data}.${token}`;
}
