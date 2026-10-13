import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Seccion } from "@/lib/accesoShared";

// Acceso regional — the team's side (Accesos page + the card on a member's
// page): who has been given what, and what they did with it.

export type AccessRow = {
  id: string;
  user_id: string;
  nombre: string;
  phone: string | null;
  avatar_url: string | null;
  estados: string[];
  secciones: Seccion[];
  ver_telefonos: boolean;
  expires_at: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  // Not revoked and not expired.
  vigente: boolean;
};

export type AccessEvent = {
  id: number;
  access_id: string | null;
  phone: string | null;
  evento: "login" | "login_fallido" | "bloqueado" | "ver_miembro" | "otorgado" | "editado" | "renovado" | "revocado";
  detalle: Record<string, unknown> | null;
  at: string;
};

type Raw = Omit<AccessRow, "nombre" | "phone" | "avatar_url" | "vigente"> & {
  user: {
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

const SELECT =
  "id, user_id, estados, secciones, ver_telefonos, expires_at, granted_by, created_at, revoked_at, revoked_by, last_login_at, last_seen_at, user:users(name, first_name, last_name, phone, avatar_url)";

function shape({ user: u, ...r }: Raw): AccessRow {
  return {
    ...r,
    nombre: [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.name || "Sin nombre",
    phone: u?.phone ?? null,
    avatar_url: u?.avatar_url ?? null,
    vigente: !r.revoked_at && new Date(r.expires_at).getTime() > Date.now(),
  };
}

export async function fetchAccesos(): Promise<{
  accesos: AccessRow[];
  eventos: AccessEvent[];
  fallidos: AccessEvent[];
}> {
  const sb = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [a, e, f] = await Promise.all([
    sb.from("admin_access").select(SELECT).order("created_at", { ascending: false }),
    sb
      .from("admin_access_log")
      .select("id, access_id, phone, evento, detalle, at")
      .not("access_id", "is", null)
      .order("at", { ascending: false })
      .limit(500),
    // Attempts from phones that have no grant at all — someone guessing.
    sb
      .from("admin_access_log")
      .select("id, access_id, phone, evento, detalle, at")
      .is("access_id", null)
      .gte("at", weekAgo)
      .order("at", { ascending: false })
      .limit(50),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (e.error) throw new Error(e.error.message);
  if (f.error) throw new Error(f.error.message);
  return {
    accesos: ((a.data ?? []) as unknown as Raw[]).map(shape),
    eventos: (e.data ?? []) as AccessEvent[],
    fallidos: (f.data ?? []) as AccessEvent[],
  };
}

// The member page's card: their current grant (or none) and whether they can
// sign in with a PIN at all.
export async function fetchMemberAccess(userId: string): Promise<{
  access: AccessRow | null;
  pinSet: boolean;
}> {
  const sb = supabaseAdmin();
  const [a, u] = await Promise.all([
    sb
      .from("admin_access")
      .select(SELECT)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle(),
    sb.from("users").select("pin_set").eq("id", userId).maybeSingle(),
  ]);
  if (a.error) throw new Error(a.error.message);
  return {
    access: a.data ? shape(a.data as unknown as Raw) : null,
    pinSet: Boolean((u.data as { pin_set?: boolean } | null)?.pin_set),
  };
}
