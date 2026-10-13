import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SESSION_COOKIE,
  ROL_TIER,
  verifySessionToken,
  roleCan,
  type Rol,
  type Role,
  type Session,
} from "@/lib/auth";
import type { Seccion } from "@/lib/accesoShared";

// The session the cookie proves (password role or a person's grant), once per request.
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
});

// The live grant behind a phone login — team or regional — re-read on every
// request (admin_access_touch). null for password sessions, no session, or a
// grant that was revoked / expired / closed («Cerrar sesiones»), or whose
// member was blocked or un-approved in the app.
export type Access = {
  id: string;
  userId: string;
  nombre: string;
  // What the panel's history calls them: «Franz», «Pablo», «Mariana».
  nombreCorto: string;
  rol: Rol;
  estados: string[];
  secciones: Seccion[];
  verTelefonos: boolean;
  expiresAt: string | null;
};

type TouchRow = {
  id: string;
  user_id: string;
  nombre: string;
  nombre_corto: string;
  rol: Rol;
  estados: string[];
  secciones: Seccion[];
  ver_telefonos: boolean;
  expires_at: string | null;
};

const SECCION_ORDER: Seccion[] = ["mapa", "zonas", "miembros"];

export const getAccess = cache(async (): Promise<Access | null> => {
  const s = await getSession();
  if (s?.kind !== "persona") return null;
  const { data, error } = await supabaseAdmin().rpc("admin_access_touch", {
    p_id: s.accessId,
    p_version: s.version,
  });
  if (error || !data) return null;
  const r = data as TouchRow;
  // A cookie minted as one kind never serves the other (role changes also bump
  // the version, so this is belt and braces).
  if (s.equipo !== (r.rol !== "regional")) return null;
  return {
    id: r.id,
    userId: r.user_id,
    nombre: r.nombre,
    nombreCorto: r.nombre_corto,
    rol: r.rol,
    estados: r.estados,
    secciones: SECCION_ORDER.filter((k) => r.secciones.includes(k)),
    verTelefonos: r.ver_telefonos,
    expiresAt: r.expires_at,
  };
});

// The STAFF tier of this request, or null — null for a regional viewer too, so
// every `roleCan(role, …)` gate refuses them by default; the few screens they
// may see opt in through lib/access.ts.
export async function getRole(): Promise<Role | null> {
  const s = await getSession();
  if (!s) return null;
  if (s.kind === "password") return s.role;
  const a = await getAccess();
  return a && a.rol !== "regional" ? ROL_TIER[a.rol] : null;
}

// Franz, by his phone login or his (emergency) técnico password.
export async function isOwner(): Promise<boolean> {
  return (await getRole()) === "dev";
}

// Who is acting, for the panel's history (users.reviewed_by, plan_events,
// admin_audit…). A phone login is a person; a password says which password.
export type Actor = { label: string; accessId: string | null };

const PASSWORD_LABEL: Record<Role, string> = {
  admin: "Admin (contraseña)",
  mariana: "Mariana (contraseña)",
  dev: "Franz (contraseña)",
};

export async function getActor(): Promise<Actor | null> {
  const s = await getSession();
  if (!s) return null;
  if (s.kind === "password") return { label: PASSWORD_LABEL[s.role], accessId: null };
  const a = await getAccess();
  return a && a.rol !== "regional" ? { label: a.nombreCorto, accessId: a.id } : null;
}

// Gate a page to a minimum role. dev is a superuser (sees everything); admin is
// limited to what it's granted. Redirects to /login if unauthenticated, to /
// (the shared home) if authenticated but not permitted, a regional viewer to
// their own landing, and a phone login whose grant ended to the login screen.
export async function requireRole(needs: Role): Promise<Role> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind === "persona") {
    if (!s.equipo) redirect("/regional");
    const a = await getAccess();
    if (!a) redirect("/api/logout?motivo=vencido");
  }
  const role = await getRole();
  if (!role) redirect("/login");
  if (!roleCan(role, needs)) redirect("/");
  return role;
}
