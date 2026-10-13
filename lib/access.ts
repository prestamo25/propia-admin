import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSession } from "@/lib/session";
import { roleCan, type Role } from "@/lib/auth";
import type { Seccion } from "@/lib/accesoShared";

export type { Seccion };

// Acceso regional (Franz + Pablo 2026-10-13): a named Propia member sees only
// the sections they were granted, only for their estados, read-only. The grant
// lives in admin_access (admin-acceso-regional-2026-10-13.sql) and is re-read
// on every request through admin_access_touch(), so revoking, expiring, or
// blocking the member in the app ends the session on the next click.
//
// Four layers keep a regional viewer in its lane: the proxy (allowed paths,
// GET only), staff-only server actions, per-estado filtering in each loader,
// and server-side redaction of what reaches the browser (lib/mapa.ts,
// app/brokers, app/broker/[id]).

export const SECCIONES: { key: Seccion; href: string; label: string }[] = [
  { key: "mapa", href: "/mapa", label: "Mapa" },
  { key: "zonas", href: "/zonas", label: "Zonas" },
  { key: "miembros", href: "/brokers", label: "Miembros" },
];

export type Access = {
  id: string;
  userId: string;
  nombre: string;
  estados: string[];
  secciones: Seccion[];
  verTelefonos: boolean;
  expiresAt: string;
};

export type Viewer = { kind: "staff"; role: Role } | { kind: "regional"; access: Access };

type TouchRow = {
  id: string;
  user_id: string;
  nombre: string;
  estados: string[];
  secciones: Seccion[];
  ver_telefonos: boolean;
  expires_at: string;
};

// The live grant behind a regional cookie, or null (staff, no session, or a
// grant that was revoked / expired / whose member was blocked).
export const getAccess = cache(async (): Promise<Access | null> => {
  const s = await getSession();
  if (s?.kind !== "regional") return null;
  const { data, error } = await supabaseAdmin().rpc("admin_access_touch", {
    p_id: s.accessId,
    p_version: s.version,
  });
  if (error || !data) return null;
  const r = data as TouchRow;
  return {
    id: r.id,
    userId: r.user_id,
    nombre: r.nombre,
    estados: r.estados,
    secciones: SECCIONES.map((x) => x.key).filter((k) => r.secciones.includes(k)),
    verTelefonos: r.ver_telefonos,
    expiresAt: r.expires_at,
  };
});

export function homeOf(a: Access): string {
  return SECCIONES.find((s) => a.secciones.includes(s.key))?.href ?? "/api/logout";
}

// Pages a regional viewer may open: staff (admin tier) always; a regional
// session only with a live grant that includes `seccion`.
export async function requireViewer(seccion: Seccion): Promise<Viewer> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind === "staff") {
    if (!roleCan(s.role, "admin")) redirect("/");
    return { kind: "staff", role: s.role };
  }
  const access = await getAccess();
  if (!access) redirect("/api/logout?motivo=vencido");
  if (!access.secciones.includes(seccion)) redirect(homeOf(access));
  return { kind: "regional", access };
}

// Same rule for route handlers — no redirects, null = 401.
export async function apiViewer(seccion: Seccion): Promise<Viewer | null> {
  const s = await getSession();
  if (!s) return null;
  if (s.kind === "staff") return roleCan(s.role, "admin") ? { kind: "staff", role: s.role } : null;
  const access = await getAccess();
  return access && access.secciones.includes(seccion) ? { kind: "regional", access } : null;
}

export function isRegional(v: Viewer): v is { kind: "regional"; access: Access } {
  return v.kind === "regional";
}

// null = every estado (staff).
export function estadosOf(v: Viewer): string[] | null {
  return v.kind === "staff" ? null : v.access.estados;
}

export function canSeeEstado(v: Viewer, estado: string | null | undefined): boolean {
  return v.kind === "staff" || (!!estado && v.access.estados.includes(estado));
}

export function canSeeAnyEstado(v: Viewer, estados: (string | null)[] | null | undefined): boolean {
  return v.kind === "staff" || (estados ?? []).some((e) => !!e && v.access.estados.includes(e));
}

// Who a regional viewer looked at — the grant's audit trail (Accesos page).
export async function logMemberView(v: Viewer, memberId: string, nombre: string | null): Promise<void> {
  if (v.kind !== "regional") return;
  await supabaseAdmin()
    .from("admin_access_log")
    .insert({ access_id: v.access.id, evento: "ver_miembro", detalle: { id: memberId, nombre } });
}
