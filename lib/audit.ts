import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActor, getRole, type Actor } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// «Actividad del equipo» (team login, 2026-10-13): every action that changes
// something in production records who did it, what, and to what — read by the
// dueño on /actividad. admin_audit keeps a year.

export type { Actor };

// The gate every server action opens with: staff tier (admin or higher) AND
// who is acting. The proxy only proves *a* session exists — a regional
// viewer's is one too — so each action checks for itself. null = refuse.
export async function staffActor(): Promise<Actor | null> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return null;
  return getActor();
}

export type Objetivo = {
  tipo:
    | "miembro"
    | "reporte"
    | "telefono"
    | "zona"
    | "ubicacion"
    | "aviso"
    | "evento"
    | "acceso"
    | "propuesta";
  id?: string | null;
  label?: string | null;
};

// Never fails the action it records: a lost history line beats a lost approval.
export async function audit(
  actor: Actor,
  accion: string,
  objetivo?: Objetivo | null,
  detalle?: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("admin_audit")
    .insert({
      access_id: actor.accessId,
      actor: actor.label,
      accion,
      objetivo_tipo: objetivo?.tipo ?? null,
      objetivo_id: objetivo?.id ?? null,
      objetivo: objetivo?.label ?? null,
      detalle: detalle ?? null,
    });
  if (error) console.error("admin_audit", accion, error.message);
}
