// Stateless session cookie. Two kinds:
//
// STAFF — the password-per-role gate. The cookie holds "<role>.<hmac>", where
// the HMAC (keyed by SESSION_SECRET) is computed over the role itself — so the
// role can't be tampered with, and being httpOnly it can't be read by client
// JS. Three roles today:
//   • admin   — Pablo / business: everything except the Técnico screens
//   • mariana — Mariana: same tier as admin, own revocable password
//   • dev     — técnico (superuser): everything above + technical screens
// Each role has its own password (ADMIN_PASSWORD / MARIANA_PASSWORD /
// DEV_PASSWORD). Removing a role from ROLES invalidates its issued cookies.
//
// REGIONAL — acceso regional (2026-10-13): a named Propia member who signed in
// with their phone + PIN. The cookie holds "regional:<access id>:<version>.<hmac>";
// WHAT they may see (estados, secciones) is never in the cookie — every page
// and API re-reads the grant (lib/access.ts), so a revoke lands on the next
// click. Bumping the grant's version kills cookies already issued.

export const SESSION_COOKIE = "padmin";

export type Role = "admin" | "mariana" | "dev";
const ROLES: Role[] = ["admin", "mariana", "dev"];

export type Session =
  | { kind: "staff"; role: Role }
  | { kind: "regional"; accessId: string; version: number };

// Tiered access: gates ask for the tier they need ("admin" = business screens,
// "dev" = técnico). A role passes any gate at or below its own tier.
const TIER: Record<Role, number> = { admin: 1, mariana: 1, dev: 2 };

export function roleCan(role: Role, needs: Role): boolean {
  return TIER[role] >= TIER[needs];
}

// Regional cookies live 14 days (staff: 30) — a shorter leash for people
// outside the team.
export const STAFF_MAX_AGE = 60 * 60 * 24 * 30;
export const REGIONAL_MAX_AGE = 60 * 60 * 24 * 14;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(secret: string, msg: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(msg));
  return toHex(sig);
}

// Staff cookies keep their v2 message, so sessions issued before the regional
// kind existed stay valid.
const staffMessage = (role: Role) => `propia-admin:v2:${role}`;
const regionalMessage = (id: string, version: number) =>
  `propia-admin:v3:regional:${id}:${version}`;

export async function createSessionToken(role: Role, secret: string): Promise<string> {
  return `${role}.${await sign(secret, staffMessage(role))}`;
}

export async function createRegionalToken(
  accessId: string,
  version: number,
  secret: string,
): Promise<string> {
  return `regional:${accessId}:${version}.${await sign(secret, regionalMessage(accessId, version))}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The session a cookie proves, or null. Constant-time compare. Signature only:
// whether a regional grant is still alive is lib/access.ts's job.
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<Session | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (payload.startsWith("regional:")) {
    const [, id, v] = payload.split(":");
    const version = Number(v);
    if (!UUID.test(id ?? "") || !Number.isInteger(version) || version < 1) return null;
    return equal(sig, await sign(secret, regionalMessage(id, version)))
      ? { kind: "regional", accessId: id, version }
      : null;
  }

  const role = payload as Role;
  if (!ROLES.includes(role)) return null;
  return equal(sig, await sign(secret, staffMessage(role))) ? { kind: "staff", role } : null;
}
