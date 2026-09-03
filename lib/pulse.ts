import { supabaseAdmin } from "./supabaseAdmin";
import { fetchHealth, type Health } from "./health";

// Live operations payload for Inicio. Built ONCE here and consumed by both
// the server page (initial paint — no loading flash) and /api/pulse (polling),
// so the dashboard is never "Cargando…".
//
// Cost control: one small select per entity covering the last 14 days
// (created_at + a label) answers today's count, the same-time-yesterday
// comparison, the hourly histogram AND the sparkline. Matches/pendientes are
// HEAD counts (no rows transferred).

const DAY = 86400000;
const SPARK_DAYS = 14;

export type FeedItem = {
  kind: "member" | "property" | "request";
  label: string;
  at: string;
};

export type Metric = {
  today: number;
  sameTimeYesterday: number;
  lastHour: number;
  spark: number[]; // SPARK_DAYS values, oldest → newest (last = today)
  total: number;
};

export type Pulse = {
  at: string;
  members: Metric;
  properties: Metric;
  requests: Metric;
  matches: { today: number; sameTimeYesterday: number; lastHour: number; total: number };
  hourly: { hour: number; members: number; properties: number; requests: number }[];
  feed: FeedItem[];
  attention: { pending: number; openReports: number };
  activeNow: number; // members active in the last 15 min
  health: Health;
};

// CDMX is UTC-6 with no DST — a fixed offset is correct and cheap.
const CDMX_OFFSET = 6 * 3600000;
export function cdmxMidnight(daysAgo = 0): number {
  const n = new Date(Date.now() - CDMX_OFFSET);
  const utc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - daysAgo);
  return utc + CDMX_OFFSET;
}

async function headCount(table: string, filters: string[] = []): Promise<number> {
  const sb = supabaseAdmin();
  let q = sb.from(table).select("id", { count: "exact", head: true });
  for (const f of filters) {
    const eq = f.indexOf("=");
    const col = f.slice(0, eq);
    const rest = f.slice(eq + 1);
    const dot = rest.indexOf(".");
    const op = rest.slice(0, dot);
    const raw = rest.slice(dot + 1);
    if (op === "in") {
      // PostgREST syntax is in.(a,b) — supabase-js wants a real array.
      q = q.in(col, raw.replace(/^\(|\)$/g, "").split(","));
    } else {
      // @ts-expect-error dynamic filter application (gte/lt/eq)
      q = q[op](col, raw);
    }
  }
  const { count } = await q;
  return count ?? 0;
}

type Row = { created_at: string | null; label: string | null };

function metricFrom(rows: Row[], total: number, now: number): Metric {
  const t0 = cdmxMidnight(0);
  const y0 = cdmxMidnight(1);
  const elapsed = now - t0;
  let today = 0;
  let sameTimeYesterday = 0;
  let lastHour = 0;
  const spark = new Array(SPARK_DAYS).fill(0);
  for (const r of rows) {
    if (!r.created_at) continue;
    const t = new Date(r.created_at).getTime();
    if (t >= t0) today++;
    if (t >= y0 && t < y0 + elapsed) sameTimeYesterday++;
    if (now - t <= 3600000) lastHour++;
    const dayIdx = SPARK_DAYS - 1 - Math.floor((t0 - t) / DAY) - (t >= t0 ? 0 : 1);
    // Bucket by CDMX day index (last slot = today).
    const idx = Math.floor((t - cdmxMidnight(SPARK_DAYS - 1)) / DAY);
    if (idx >= 0 && idx < SPARK_DAYS) spark[idx]++;
    void dayIdx;
  }
  return { today, sameTimeYesterday, lastHour, spark, total };
}

export async function fetchPulse(): Promise<Pulse> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const since = new Date(cdmxMidnight(SPARK_DAYS - 1)).toISOString();
  const t0 = cdmxMidnight(0);
  const y0 = cdmxMidnight(1);
  const elapsed = now - t0;

  const sel = (table: string, labelCol: string) =>
    sb
      .from(table)
      .select(`created_at, ${labelCol}`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

  const [
    usersRes, propsRes, reqsRes,
    totalMembers, totalProps, totalReqs, totalMatches,
    matchesToday, matchesYest, matchesHour,
    pending, openReports, activeNow, health,
  ] = await Promise.all([
    sel("users", "name"),
    sel("properties", "name"),
    sel("search_requests", "title"),
    headCount("users"),
    headCount("properties"),
    headCount("search_requests"),
    headCount("notifications", ["type=in.(request_match,inventory_match)"]),
    headCount("notifications", [
      "type=in.(request_match,inventory_match)",
      `created_at=gte.${new Date(t0).toISOString()}`,
    ]),
    headCount("notifications", [
      "type=in.(request_match,inventory_match)",
      `created_at=gte.${new Date(y0).toISOString()}`,
      `created_at=lt.${new Date(y0 + elapsed).toISOString()}`,
    ]),
    headCount("notifications", [
      "type=in.(request_match,inventory_match)",
      `created_at=gte.${new Date(now - 3600000).toISOString()}`,
    ]),
    headCount("users", ["status=eq.pending"]),
    headCount("reports", ["status=eq.open"]),
    headCount("users", [`last_active=gte.${new Date(now - 15 * 60000).toISOString()}`]),
    fetchHealth(),
  ]);

  const norm = (rows: unknown[] | null, key: string): Row[] =>
    ((rows ?? []) as Record<string, string | null>[]).map((r) => ({
      created_at: r.created_at,
      label: r[key],
    }));

  const uRows = norm(usersRes.data, "name");
  const pRows = norm(propsRes.data, "name");
  const rRows = norm(reqsRes.data, "title");

  // Hourly histogram for today (CDMX hours 0–23).
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    members: 0,
    properties: 0,
    requests: 0,
  }));
  const bump = (rows: Row[], key: "members" | "properties" | "requests") => {
    for (const r of rows) {
      if (!r.created_at) continue;
      const t = new Date(r.created_at).getTime();
      if (t < t0) continue;
      const h = Math.floor((t - t0) / 3600000);
      if (h >= 0 && h < 24) hourly[h][key]++;
    }
  };
  bump(uRows, "members");
  bump(pRows, "properties");
  bump(rRows, "requests");

  // Cross-entity live feed — newest first.
  const feed: FeedItem[] = [
    ...uRows.slice(0, 10).map((r) => ({ kind: "member" as const, label: r.label?.trim() || "Sin nombre", at: r.created_at! })),
    ...pRows.slice(0, 10).map((r) => ({ kind: "property" as const, label: r.label?.trim() || "Propiedad", at: r.created_at! })),
    ...rRows.slice(0, 10).map((r) => ({ kind: "request" as const, label: r.label?.trim() || "Requerimiento", at: r.created_at! })),
  ]
    .filter((f) => f.at)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 14);

  return {
    at: new Date().toISOString(),
    members: metricFrom(uRows, totalMembers, now),
    properties: metricFrom(pRows, totalProps, now),
    requests: metricFrom(rRows, totalReqs, now),
    matches: {
      today: matchesToday,
      sameTimeYesterday: matchesYest,
      lastHour: matchesHour,
      total: totalMatches,
    },
    hourly,
    feed,
    attention: { pending, openReports },
    activeNow,
    health,
  };
}
