"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/session";
import { ESTADOS, SECCION_OPTIONS, VIGENCIAS, type Seccion } from "@/lib/accesoShared";

// Acceso regional (2026-10-13): handing out, renewing and taking back a
// member's read-only access to the panel. Only the people who hand out access
// — the admin password (Pablo) and técnico (Franz) — not Mariana's tier-mate
// password. The writers are SQL (admin_access_grant/_revoke/_renew), which
// log who did it to admin_access_log.

type Result = { error?: string };

async function granter(): Promise<string | null> {
  const role = await getRole();
  return role === "dev" ? "Técnico" : role === "admin" ? "Admin" : null;
}

function refresh(userId?: string) {
  revalidatePath("/accesos");
  if (userId) revalidatePath(`/broker/${userId}`);
}

export async function grantAccess(input: {
  userId: string;
  estados: string[];
  secciones: Seccion[];
  verTelefonos: boolean;
  dias: number;
}): Promise<Result> {
  const actor = await granter();
  if (!actor) return { error: "Sólo el admin o técnico pueden dar acceso." };

  const estados = [...new Set(input.estados)].filter((e) => ESTADOS.includes(e));
  const valid = SECCION_OPTIONS.map((s) => s.key);
  const secciones = valid.filter((k) => input.secciones.includes(k));
  if (!estados.length) return { error: "Elige al menos un estado." };
  if (!secciones.length) return { error: "Elige al menos una sección." };
  if (!(VIGENCIAS as readonly number[]).includes(input.dias)) return { error: "Vigencia inválida." };

  const sb = supabaseAdmin();
  const { data: u } = await sb.from("users").select("status").eq("id", input.userId).maybeSingle();
  if (!u) return { error: "No encontré a este miembro." };
  if (u.status !== "approved") return { error: "Sólo miembros aprobados pueden tener acceso." };

  const { error } = await sb.rpc("admin_access_grant", {
    p_user: input.userId,
    p_estados: estados,
    p_secciones: secciones,
    p_ver_telefonos: input.verTelefonos,
    p_dias: input.dias,
    p_actor: actor,
  });
  if (error) return { error: error.message };
  refresh(input.userId);
  return {};
}

export async function revokeAccess(id: string, userId?: string): Promise<Result> {
  const actor = await granter();
  if (!actor) return { error: "Sólo el admin o técnico pueden quitar acceso." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_revoke", { p_id: id, p_actor: actor });
  if (error) return { error: error.message };
  if (!data) return { error: "Ese acceso ya estaba retirado." };
  refresh(userId);
  return {};
}

export async function renewAccess(id: string, dias: number, userId?: string): Promise<Result> {
  const actor = await granter();
  if (!actor) return { error: "Sólo el admin o técnico pueden renovar acceso." };
  if (!(VIGENCIAS as readonly number[]).includes(dias)) return { error: "Vigencia inválida." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_renew", {
    p_id: id,
    p_dias: dias,
    p_actor: actor,
  });
  if (error) return { error: error.message };
  if (!data) return { error: "Ese acceso ya estaba retirado." };
  refresh(userId);
  return {};
}
