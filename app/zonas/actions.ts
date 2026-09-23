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
