import { supabaseAdmin } from "./supabaseAdmin";
import { countOpenReports } from "./reports";
import { countPendingUsers } from "./aprobaciones";
import { cdmxMidnight } from "./pulse";
import { countStatuses } from "./eventos";

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

export type TodayEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  visibility: string;
  registered: number;
  attended: number;
};

export type WeekMetric = { label: string; now: number; prev: number; href?: string };

export type InicioData = {
  miembros: number;
  pendientes: number;
  propiedades: number;
  requerimientos: number;
  eventosProximos: number;
  nuevosSemana: number;
  reportesAbiertos: number;
  recientes: RecentUser[];
  // Franz 2026-09-02: the morning screen — what happens today, what needs a
  // hand, and how the last 7 days compare with the 7 before.
  eventsToday: TodayEvent[];
  tomorrowRegistrations: number;
  receiptsWaiting: number;
  emptyUpcoming: { id: string; title: string; start_at: string }[];
  week: WeekMetric[];
};

export async function fetchInicio(): Promise<InicioData> {
  const sb = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(q).then((r) => r.count ?? 0);

  const today0 = new Date(cdmxMidnight(0)).toISOString();
  const tomorrow0 = new Date(cdmxMidnight(-1)).toISOString();
  const dayAfter0 = new Date(cdmxMidnight(-2)).toISOString();
  const in7d = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  type EvRow = { id: string; title: string; start_at: string; end_at: string | null; visibility: string; attendees: { status: string }[] | null };
  const evSelect = "id, title, start_at, end_at, visibility, attendees:event_attendees(status)";
  // "This 7 days vs the 7 before" for one table's timestamp column.
  const pair = (table: string, col: string) =>
    Promise.all([
      count(sb.from(table).select("id", { count: "exact", head: true }).gte(col, weekAgo)),
      count(sb.from(table).select("id", { count: "exact", head: true }).gte(col, twoWeeksAgo).lt(col, weekAgo)),
    ]);

  const [
    miembros,
    pendientes,
    propiedades,
    requerimientos,
    eventosProximos,
    nuevosSemana,
    reportesAbiertos,
    recientes,
    todayRows,
    tomorrowRows,
    upcomingRows,
    receiptsWaiting,
    wMembers,
    wProps,
    wReqs,
    wSends,
    wOpens,
    wAttended,
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
    sb.from("events").select(evSelect).gte("start_at", today0).lt("start_at", tomorrow0).order("start_at").then(({ data }) => (data ?? []) as unknown as EvRow[]),
    sb.from("events").select(evSelect).gte("start_at", tomorrow0).lt("start_at", dayAfter0).then(({ data }) => (data ?? []) as unknown as EvRow[]),
    sb.from("events").select(evSelect).gte("start_at", now).lt("start_at", in7d).order("start_at").then(({ data }) => (data ?? []) as unknown as EvRow[]),
    count(
      sb
        .from("event_attendees")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .not("receipt_url", "is", null)
        .is("approved_by", null),
    ),
    pair("users", "created_at"),
    pair("properties", "created_at"),
    pair("search_requests", "created_at"),
    pair("share_events", "created_at"),
    pair("share_views", "created_at"),
    pair("event_attendees", "checked_in_at"),
  ]);

  const toToday = (e: EvRow): TodayEvent => {
    const c = countStatuses(e.attendees ?? []);
    return { id: e.id, title: e.title, start_at: e.start_at, end_at: e.end_at, visibility: e.visibility, registered: c.registered, attended: c.attended };
  };

  return {
    miembros,
    pendientes,
    propiedades,
    requerimientos,
    eventosProximos,
    nuevosSemana,
    reportesAbiertos,
    recientes,
    eventsToday: todayRows.map(toToday),
    tomorrowRegistrations: tomorrowRows.reduce((n, e) => n + countStatuses(e.attendees ?? []).registered, 0),
    receiptsWaiting,
    emptyUpcoming: upcomingRows
      .filter((e) => countStatuses(e.attendees ?? []).registered === 0 && e.visibility !== "private")
      .slice(0, 5)
      .map((e) => ({ id: e.id, title: e.title, start_at: e.start_at })),
    week: [
      { label: "Miembros nuevos", now: wMembers[0], prev: wMembers[1], href: "/brokers" },
      { label: "Propiedades publicadas", now: wProps[0], prev: wProps[1], href: "/panorama" },
      { label: "Requerimientos", now: wReqs[0], prev: wReqs[1], href: "/panorama" },
      { label: "Fichas enviadas", now: wSends[0], prev: wSends[1] },
      { label: "Fichas abiertas por clientes", now: wOpens[0], prev: wOpens[1] },
      { label: "Asistencias a eventos", now: wAttended[0], prev: wAttended[1], href: "/eventos" },
    ],
  };
}
