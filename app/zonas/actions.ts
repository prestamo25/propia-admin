"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { audit, staffActor } from "@/lib/audit";

// Close (or reopen) a proposal. Approving happens by saving the zone in the
// editor — this only records the outcome next to the draft. Same gate as the
// rest of the Zonas writes: the middleware only proves a session exists.
export async function marcarPropuesta(
  id: number,
  revision: "pendiente" | "aprobada" | "descartada",
  zonaKey: string | null,
): Promise<{ error?: string }> {
  const actor = await staffActor();
  if (!actor) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("admin_marcar_propuesta", {
    p_id: id,
    p_revision: revision,
    p_zona_key: zonaKey,
  });
  if (error) return { error: error.message };
  await audit(actor, "propuesta_" + revision, { tipo: "propuesta", id: String(id) }, { zona: zonaKey });
  return {};
}

// A verdict was applied (or un-applied) through the editor.
export async function marcarVerificacion(id: number, aplicada: boolean): Promise<{ error?: string }> {
  const actor = await staffActor();
  if (!actor) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("admin_marcar_verificacion", { p_id: id, p_aplicada: aplicada });
  if (error) return { error: error.message };
  await audit(actor, aplicada ? "veredicto_aplicado" : "veredicto_reabierto", { tipo: "propuesta", id: String(id) });
  return {};
}

// Move the open requerimientos sitting on a Google box to what the verdict
// says they meant. Backed up per requerimiento in _reemplazos_zona_requerimientos.
export async function reemplazarZonaEnRequerimientos(
  oldKey: string,
  newKey: string,
): Promise<{ error?: string; movidos?: number }> {
  const actor = await staffActor();
  if (!actor) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_reemplazar_zona_en_requerimientos", {
    p_old: oldKey,
    p_new: newKey,
  });
  if (error) return { error: error.message };
  await audit(actor, "zona_reemplazar_en_requerimientos", { tipo: "zona", id: oldKey }, {
    nueva: newKey,
    movidos: (data as number) ?? 0,
  });
  return { movidos: (data as number) ?? 0 };
}
