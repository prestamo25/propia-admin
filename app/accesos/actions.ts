"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/session";
import { audit, staffActor, type Actor } from "@/lib/audit";
import { ESTADOS, SECCION_OPTIONS, VIGENCIAS, type Seccion } from "@/lib/accesoShared";

// Who may change access to the panel (Franz 2026-10-13, «i'm the top admin»):
//   • regional (view-only) access — the dueño and Pablo (admin);
//   • the team itself (add, change role, remove, close sessions) — the dueño
//     only. Nobody touches the dueño: the SQL refuses it too.
// Desbloquear a phone locked by wrong PINs/codes — dueño and admin.
// Mariana's tier (equipo) changes no access at all. The writers are SQL
// (admin_access_*), which log to admin_access_log; every change also lands in
// «Actividad del equipo».

type Result = { error?: string };

async function grantor(): Promise<Actor | null> {
  const role = await getRole();
  return role === "admin" || role === "dev" ? staffActor() : null;
}

async function owner(): Promise<Actor | null> {
  return (await getRole()) === "dev" ? staffActor() : null;
}

function refresh(userId?: string | null) {
  revalidatePath("/accesos");
  if (userId) revalidatePath(`/broker/${userId}`);
}

async function grantRow(id: string) {
  const { data } = await supabaseAdmin()
    .from("admin_access")
    .select("id, user_id, rol, revoked_at, user:users(name, first_name, last_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const u = (Array.isArray(data.user) ? data.user[0] : data.user) as
    | { name: string | null; first_name: string | null; last_name: string | null }
    | null;
  const nombre = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.name || null;
  return { ...(data as { id: string; user_id: string; rol: string; revoked_at: string | null }), nombre };
}

const friendly = (msg: string) =>
  msg.includes("es el dueño")
    ? "Al dueño no se le cambia ni se le quita el acceso."
    : msg.includes("es del equipo")
      ? "Esta persona es del equipo; su acceso se cambia en «Accesos»."
      : msg;

export async function grantAccess(input: {
  userId: string;
  estados: string[];
  secciones: Seccion[];
  verTelefonos: boolean;
  dias: number;
}): Promise<Result> {
  const actor = await grantor();
  if (!actor) return { error: "Sólo el dueño o el admin pueden dar acceso." };

  const estados = [...new Set(input.estados)].filter((e) => ESTADOS.includes(e));
  const valid = SECCION_OPTIONS.map((s) => s.key);
  const secciones = valid.filter((k) => input.secciones.includes(k));
  if (!estados.length) return { error: "Elige al menos un estado." };
  if (!secciones.length) return { error: "Elige al menos una sección." };
  if (!(VIGENCIAS as readonly number[]).includes(input.dias)) return { error: "Vigencia inválida." };

  const sb = supabaseAdmin();
  const { data: u } = await sb.from("users").select("status, name").eq("id", input.userId).maybeSingle();
  if (!u) return { error: "No encontré a este miembro." };
  if (u.status !== "approved") return { error: "Sólo miembros aprobados pueden tener acceso." };

  const { data: id, error } = await sb.rpc("admin_access_grant", {
    p_user: input.userId,
    p_estados: estados,
    p_secciones: secciones,
    p_ver_telefonos: input.verTelefonos,
    p_dias: input.dias,
    p_actor: actor.label,
  });
  if (error) return { error: friendly(error.message) };
  await audit(actor, "acceso_regional", { tipo: "acceso", id: id as string, label: u.name }, {
    estados,
    secciones,
    ver_telefonos: input.verTelefonos,
    dias: input.dias,
  });
  refresh(input.userId);
  return {};
}

// Regional: dueño or admin. Team: dueño only. The dueño: nobody.
export async function revokeAccess(id: string, userId?: string): Promise<Result> {
  const g = await grantRow(id);
  if (!g) return { error: "No encontré ese acceso." };
  const actor = g.rol === "regional" ? await grantor() : await owner();
  if (!actor) return { error: "No puedes quitar este acceso." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_revoke", { p_id: id, p_actor: actor.label });
  if (error) return { error: friendly(error.message) };
  if (!data) return { error: "Ese acceso ya estaba retirado." };
  await audit(actor, g.rol === "regional" ? "acceso_quitar" : "equipo_quitar", {
    tipo: "acceso",
    id,
    label: g.nombre,
  });
  refresh(userId ?? g.user_id);
  return {};
}

export async function renewAccess(id: string, dias: number, userId?: string): Promise<Result> {
  const actor = await grantor();
  if (!actor) return { error: "Sólo el dueño o el admin pueden renovar acceso." };
  if (!(VIGENCIAS as readonly number[]).includes(dias)) return { error: "Vigencia inválida." };
  const g = await grantRow(id);
  if (!g || g.rol !== "regional") return { error: "Sólo los accesos regionales se renuevan." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_renew", {
    p_id: id,
    p_dias: dias,
    p_actor: actor.label,
  });
  if (error) return { error: friendly(error.message) };
  if (!data) return { error: "Ese acceso ya estaba retirado." };
  await audit(actor, "acceso_renovar", { tipo: "acceso", id, label: g.nombre }, { dias });
  refresh(userId ?? g.user_id);
  return {};
}

// Add someone to the team by the phone of their Propia account, or change the
// role of someone already in it.
export async function setTeamRole(input: {
  phone10?: string;
  userId?: string;
  rol: "admin" | "equipo";
}): Promise<Result> {
  const actor = await owner();
  if (!actor) return { error: "Sólo el dueño cambia al equipo." };
  if (input.rol !== "admin" && input.rol !== "equipo") return { error: "Rol inválido." };
  const sb = supabaseAdmin();
  let userId = input.userId ?? null;
  let nombre: string | null = null;
  if (!userId) {
    const digits = (input.phone10 ?? "").replace(/\D/g, "");
    if (digits.length !== 10) return { error: "El teléfono debe tener 10 dígitos." };
    const { data: u } = await sb
      .from("users")
      .select("id, name, status")
      .eq("phone", `52${digits}`)
      .maybeSingle();
    if (!u) return { error: "Ese teléfono no tiene cuenta en Propia." };
    if (u.status !== "approved") return { error: "Esa cuenta todavía no está aprobada." };
    userId = u.id as string;
    nombre = u.name as string | null;
  }
  const { data: id, error } = await sb.rpc("admin_access_set_team", {
    p_user: userId,
    p_rol: input.rol,
    p_actor: actor.label,
  });
  if (error) return { error: friendly(error.message) };
  await audit(actor, "equipo_rol", { tipo: "acceso", id: id as string, label: nombre }, { rol: input.rol });
  refresh(userId);
  return {};
}

// «Cerrar sesión en todos lados»: every cookie already issued stops working.
export async function closeSessions(id: string): Promise<Result> {
  const g = await grantRow(id);
  if (!g) return { error: "No encontré ese acceso." };
  const actor = g.rol === "regional" ? await grantor() : await owner();
  if (!actor) return { error: "No puedes cerrar estas sesiones." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_close_sessions", {
    p_id: id,
    p_actor: actor.label,
  });
  if (error) return { error: friendly(error.message) };
  if (!data) return { error: "Ese acceso ya estaba retirado." };
  await audit(actor, "sesiones_cerradas", { tipo: "acceso", id, label: g.nombre });
  refresh(g.user_id);
  return {};
}

export async function unlockPhone(phone: string): Promise<Result> {
  const actor = await grantor();
  if (!actor) return { error: "Sólo el dueño o el admin pueden desbloquear." };
  const { error } = await supabaseAdmin().rpc("admin_access_unlock", { p_phone: phone, p_actor: actor.label });
  if (error) return { error: error.message };
  await audit(actor, "desbloquear_login", { tipo: "telefono", id: phone });
  refresh();
  return {};
}

// «Deshacer» right after «Quitar» (UI/UX batch B, 2026-10-14): within 5
// minutes the access comes back exactly as it was. Same permission as taking
// it away.
export async function restoreAccess(id: string): Promise<Result> {
  const g = await grantRow(id);
  if (!g) return { error: "No encontré ese acceso." };
  const actor = g.rol === "regional" ? await grantor() : await owner();
  if (!actor) return { error: "No puedes restaurar este acceso." };
  const { data, error } = await supabaseAdmin().rpc("admin_access_restore", { p_id: id, p_actor: actor.label });
  if (error) return { error: error.message };
  if (!data) return { error: "Ya no se puede deshacer (pasaron más de 5 minutos o ya tiene otro acceso)." };
  await audit(actor, "acceso_restaurar", { tipo: "acceso", id, label: g.nombre });
  refresh(g.user_id);
  return {};
}
