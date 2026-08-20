import { supabaseAdmin } from "./supabaseAdmin";
import { countOpenReports } from "./reports";
import { countPendingUsers } from "./aprobaciones";

// Home overview: cheap head-count queries only — the home must load fast, so
// no full-table pageAll reads here (those live in each section's own page).

export type RecentUser = {
  id: string;
  name: string | null;
  company: string | null;
  status: string | null;
  created_at: string | null;
  avatar_url: string | null;
};

export type InicioData = {
  miembros: number;
  pendientes: number;
  propiedades: number;
  requerimientos: number;
  eventosProximos: number;
  nuevosSemana: number;
  reportesAbiertos: number;
  recientes: RecentUser[];
};

export async function fetchInicio(): Promise<InicioData> {
  const sb = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(q).then((r) => r.count ?? 0);

  const [
    miembros,
    pendientes,
    propiedades,
    requerimientos,
    eventosProximos,
    nuevosSemana,
    reportesAbiertos,
    recientes,
  ] = await Promise.all([
    count(
      sb.from("users").select("id", { count: "exact", head: true }).eq("status", "approved"),
    ),
    countPendingUsers(),
    count(sb.from("properties").select("id", { count: "exact", head: true })),
    count(sb.from("search_requests").select("id", { count: "exact", head: true })),
    count(
      sb.from("events").select("id", { count: "exact", head: true }).gte("start_at", now),
    ),
    count(
      sb.from("users").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    ),
    countOpenReports(),
    sb
      .from("users")
      .select("id, name, company, status, created_at, avatar_url")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => (data ?? []) as RecentUser[]),
  ]);

  return {
    miembros,
    pendientes,
    propiedades,
    requerimientos,
    eventosProximos,
    nuevosSemana,
    reportesAbiertos,
    recientes,
  };
}
