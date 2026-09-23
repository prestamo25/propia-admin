"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// Close (or reopen) a proposal. Approving happens by saving the zone in the
// editor — this only records the outcome next to the draft. Same gate as the
// rest of the Zonas writes: the middleware only proves a session exists.
export async function marcarPropuesta(
  id: number,
  revision: "pendiente" | "aprobada" | "descartada",
  zonaKey: string | null,
): Promise<{ error?: string }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("admin_marcar_propuesta", {
    p_id: id,
    p_revision: revision,
    p_zona_key: zonaKey,
  });
  if (error) return { error: error.message };
  return {};
}

// A verdict was applied (or un-applied) through the editor.
export async function marcarVerificacion(id: number, aplicada: boolean): Promise<{ error?: string }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { error } = await sb.rpc("admin_marcar_verificacion", { p_id: id, p_aplicada: aplicada });
  if (error) return { error: error.message };
  return {};
}

// Move the open requerimientos sitting on a Google box to what the verdict
// says they meant. Backed up per requerimiento in _reemplazos_zona_requerimientos.
export async function reemplazarZonaEnRequerimientos(
  oldKey: string,
  newKey: string,
): Promise<{ error?: string; movidos?: number }> {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) return { error: "No autorizado." };
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_reemplazar_zona_en_requerimientos", {
    p_old: oldKey,
    p_new: newKey,
  });
  if (error) return { error: error.message };
  return { movidos: (data as number) ?? 0 };
}
