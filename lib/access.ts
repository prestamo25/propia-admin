import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccess, getRole, getSession, type Access } from "@/lib/session";
import { roleCan, type Role } from "@/lib/auth";
import type { Seccion } from "@/lib/accesoShared";

export type { Seccion, Access };

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

export type Viewer = { kind: "staff"; role: Role } | { kind: "regional"; access: Access };

// The live REGIONAL grant behind this request, or null (team, password, none).
export async function getRegional(): Promise<Access | null> {
  const a = await getAccess();
  return a?.rol === "regional" ? a : null;
}

export function homeOf(a: Access): string {
  return SECCIONES.find((s) => a.secciones.includes(s.key))?.href ?? "/api/logout";
}

// Pages a regional viewer may open: staff (admin tier) always; a regional
// session only with a live grant that includes `seccion`.
export async function requireViewer(seccion: Seccion): Promise<Viewer> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind === "persona") {
    const a = await getAccess();
    if (!a) redirect("/api/logout?motivo=vencido");
    if (a.rol === "regional") {
      if (!a.secciones.includes(seccion)) redirect(homeOf(a));
      return { kind: "regional", access: a };
    }
  }
  const role = await getRole();
  if (!role) redirect("/login");
  if (!roleCan(role, "admin")) redirect("/");
  return { kind: "staff", role };
}

// Same rule for route handlers — no redirects, null = 401.
export async function apiViewer(seccion: Seccion): Promise<Viewer | null> {
  const role = await getRole();
  if (role) return roleCan(role, "admin") ? { kind: "staff", role } : null;
  const a = await getRegional();
  return a && a.secciones.includes(seccion) ? { kind: "regional", access: a } : null;
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
