// Stateless session cookie, three kinds:
//
// PERSONA, team (equipo login, 2026-10-13): Franz, Pablo and Mariana sign in
// with their phone + app PIN + a WhatsApp code. "equipo:<access id>:<version>.<hmac>".
// PERSONA, regional (acceso regional, 2026-10-13): a member outside the team,
// phone + PIN, read-only on their estados. "regional:<access id>:<version>.<hmac>".
//   For both, WHO they are and WHAT they may do (rol, estados, secciones) is
//   never in the cookie — every page and API re-reads the grant
//   (admin_access_touch via lib/session.ts), so a revoke, a role change or
//   «Cerrar sesiones» (version bump) lands on the next click.
//
// PASSWORD — the original password-per-role gate: "<role>.<hmac>", HMAC over
// the role. Roles: admin (Pablo) / mariana / dev (técnico). Only the roles in
// PASSWORD_ROLES are honored; dropping one there kills its cookies at once.
//
// All HMACs are keyed by SESSION_SECRET; cookies are httpOnly.

export const SESSION_COOKIE = "padmin";
// Between the PIN and the WhatsApp code (team only): who passed the PIN, for
// 10 minutes. Never a session by itself.
export const PENDING_COOKIE = "padmin_codigo";
// Trusted device (2026-10-13): after a WhatsApp code, this browser is
// remembered for 90 days and the team signs in there with the PIN alone.
// "<device id>.<random token>"; the database keeps only the token's sha256.
// Scoped to /api/login — no other request ever carries it.
export const DEVICE_COOKIE = "padmin_dispositivo";
export const DEVICE_PATH = "/api/login";

export type Role = "admin" | "mariana" | "dev";
const ROLES: Role[] = ["admin", "mariana", "dev"];

// Passwords still accepted. Fase 1 (2026-10-13 morning): all three, side by
// side with the phone login. Fase 2 (Franz 2026-10-13: «you can switch off
// their passwords»): only Franz's técnico password, as the emergency way in
// («Acceso de emergencia» on the login screen). Pablo's and Mariana's password
// cookies stopped validating at that deploy: they sign in by phone now.
export const PASSWORD_ROLES: Role[] = ["dev"];

// admin_access.rol → the tier the rest of the panel already gates on: the
// dueño is the superuser (técnico screens included), Pablo is admin, Mariana
// keeps the tier her password had.
export type Rol = "regional" | "equipo" | "admin" | "dueno";
export const ROL_TIER: Record<Exclude<Rol, "regional">, Role> = {
  dueno: "dev",
  admin: "admin",
  equipo: "mariana",
};
export const ROL_LABEL: Record<Rol, string> = {
  dueno: "Dueño",
  admin: "Admin",
  equipo: "Equipo",
  regional: "Regional",
};

export type Session =
  | { kind: "password"; role: Role }
  | { kind: "persona"; equipo: boolean; accessId: string; version: number };

// Tiered access: gates ask for the tier they need ("admin" = business screens,
// "dev" = técnico). A role passes any gate at or below its own tier.
const TIER: Record<Role, number> = { admin: 1, mariana: 1, dev: 2 };

export function roleCan(role: Role, needs: Role): boolean {
  return TIER[role] >= TIER[needs];
}

export const STAFF_MAX_AGE = 60 * 60 * 24 * 30;
export const REGIONAL_MAX_AGE = 60 * 60 * 24 * 14;
export const PENDING_MAX_AGE = 60 * 10;
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 90;

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

// Password cookies keep their v2 message, so sessions issued before the
// phone login existed stay valid (while their role is in PASSWORD_ROLES).
const passwordMessage = (role: Role) => `propia-admin:v2:${role}`;
const personaMessage = (prefix: "regional" | "equipo", id: string, version: number) =>
  `propia-admin:v3:${prefix}:${id}:${version}`;
const pendingMessage = (id: string, version: number, exp: number) =>
  `propia-admin:v3:codigo:${id}:${version}:${exp}`;

export async function createSessionToken(role: Role, secret: string): Promise<string> {
  return `${role}.${await sign(secret, passwordMessage(role))}`;
}

export async function createPersonaToken(
  equipo: boolean,
  accessId: string,
  version: number,
  secret: string,
): Promise<string> {
  const prefix = equipo ? "equipo" : "regional";
  return `${prefix}:${accessId}:${version}.${await sign(secret, personaMessage(prefix, accessId, version))}`;
}

export async function createPendingToken(accessId: string, version: number, secret: string): Promise<string> {
  const exp = Date.now() + PENDING_MAX_AGE * 1000;
  return `${accessId}:${version}:${exp}.${await sign(secret, pendingMessage(accessId, version, exp))}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function split(token: string | undefined): [string, string] | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  return dot < 0 ? null : [token.slice(0, dot), token.slice(dot + 1)];
}

// The session a cookie proves, or null. Constant-time compare. Signature only:
// whether a grant is still alive is lib/session.ts's job.
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<Session | null> {
  const parts = split(token);
  if (!parts || !secret) return null;
  const [payload, sig] = parts;

  if (payload.startsWith("regional:") || payload.startsWith("equipo:")) {
    const [prefix, id, v] = payload.split(":") as ["regional" | "equipo", string, string];
    const version = Number(v);
    if (!UUID.test(id ?? "") || !Number.isInteger(version) || version < 1) return null;
    return equal(sig, await sign(secret, personaMessage(prefix, id, version)))
      ? { kind: "persona", equipo: prefix === "equipo", accessId: id, version }
      : null;
  }

  const role = payload as Role;
  if (!ROLES.includes(role) || !PASSWORD_ROLES.includes(role)) return null;
  return equal(sig, await sign(secret, passwordMessage(role))) ? { kind: "password", role } : null;
}

export async function verifyPendingToken(
  token: string | undefined,
  secret: string,
): Promise<{ accessId: string; version: number } | null> {
  const parts = split(token);
  if (!parts || !secret) return null;
  const [payload, sig] = parts;
  const [id, v, e] = payload.split(":");
  const version = Number(v);
  const exp = Number(e);
  if (!UUID.test(id ?? "") || !Number.isInteger(version) || !Number.isFinite(exp)) return null;
  if (exp < Date.now()) return null;
  return equal(sig, await sign(secret, pendingMessage(id, version, exp))) ? { accessId: id, version } : null;
}
