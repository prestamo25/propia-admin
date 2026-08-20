import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type WeekPoint = {
  label: string;
  signups: number;
  listings: number;
  requerimientos: number;
};

export type StateLiquidity = { state: string; supply: number; demand: number };

// Cumulative network size at each week's end — LEVELS, not flows. This is
// the chart that answers "how big are we?"; WeekPoint answers "what happened
// this week?".
export type CumPoint = {
  label: string;
  members: number;
  properties: number;
  requerimientos: number;
};

export type Panorama = {
  kpis: {
    brokers: number;
    active7d: number;
    listings: number;
    requerimientos: number;
    matches: number;
    offers: number;
  };
  growth: WeekPoint[];
  cumulative: CumPoint[];
  activity: {
    active7d: number;
    active8to30: number;
    dormant: number;
    never: number;
    total: number;
  };
  supplyDemand: StateLiquidity[];
};

const DAY = 86400000;

// Monday-anchored start of the week containing `d`.
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - day);
  return x;
}

export async function fetchPanorama(): Promise<Panorama> {
  const sb = supabaseAdmin();

  // Full-table reads are paged (pageAll) — PostgREST's 1,000-row cap was
  // silently truncating properties (and would soon truncate users), skewing
  // every chart below. Notifications only feed the matches KPI, so that one
  // is a server-side count instead of hauling the whole table over.
  const [users, props, reqs, offersRes, matchNotifsRes] = await Promise.all([
    pageAll<{ created_at: string | null; last_active: string | null }>(() =>
      sb.from("users").select("created_at, last_active"),
    ),
    pageAll<{ created_at: string | null; state: string | null }>(() =>
      sb.from("properties").select("created_at, state"),
    ),
    pageAll<{ created_at: string | null; states: string[] | null }>(() =>
      sb.from("search_requests").select("created_at, states"),
    ),
    sb.from("request_interests").select("*", { count: "exact", head: true }),
    sb
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .in("type", ["request_match", "inventory_match"]),
  ]);

  if (offersRes.error) throw offersRes.error;
  if (matchNotifsRes.error) throw matchNotifsRes.error;

  // ── growth: last 8 weeks ──────────────────────────────────────────────────
  const WEEKS = 8;
  const thisWeek = startOfWeek(new Date());
  const growth: WeekPoint[] = [];
  const idxOf = new Map<number, number>();
  for (let i = WEEKS - 1; i >= 0; i--) {
    const ws = new Date(thisWeek.getTime() - i * 7 * DAY);
    idxOf.set(ws.getTime(), growth.length);
    growth.push({
      label: ws.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
      signups: 0,
      listings: 0,
      requerimientos: 0,
    });
  }
  const bump = (
    iso: string | null,
    key: "signups" | "listings" | "requerimientos",
  ) => {
    if (!iso) return;
    const i = idxOf.get(startOfWeek(new Date(iso)).getTime());
    if (i != null) growth[i][key]++;
  };
  for (const u of users) bump(u.created_at, "signups");
  for (const p of props) bump(p.created_at, "listings");
  for (const r of reqs) bump(r.created_at, "requerimientos");

  // ── cumulative: weekly network totals since the first signup (cap 26w) ────
  const CUM_WEEKS = 26;
  const stamps = [
    ...users.map((u) => u.created_at),
    ...props.map((p) => p.created_at),
    ...reqs.map((r) => r.created_at),
  ]
    .filter((c): c is string => !!c)
    .map((c) => new Date(c).getTime());
  const firstWeek = startOfWeek(new Date(Math.min(...stamps, Date.now())));
  const cumStart = new Date(
    Math.max(firstWeek.getTime(), thisWeek.getTime() - (CUM_WEEKS - 1) * 7 * DAY),
  );
  const cumWeeks: Date[] = [];
  for (let t = cumStart.getTime(); t <= thisWeek.getTime(); t += 7 * DAY) {
    cumWeeks.push(new Date(t));
  }
  const cumSeries = (rows: { created_at: string | null }[]) => {
    // Everything created before the window seeds the baseline, so the curve
    // starts at the true total, not at zero.
    let base = 0;
    const perWeek = new Array(cumWeeks.length).fill(0);
    for (const r of rows) {
      if (!r.created_at) continue;
      const wt = startOfWeek(new Date(r.created_at)).getTime();
      if (wt < cumStart.getTime()) base++;
      else {
        const i = Math.round((wt - cumStart.getTime()) / (7 * DAY));
        if (i >= 0 && i < perWeek.length) perWeek[i]++;
      }
    }
    const out: number[] = [];
    let acc = base;
    for (const n of perWeek) {
      acc += n;
      out.push(acc);
    }
    return out;
  };
  const mem = cumSeries(users);
  const pro = cumSeries(props);
  const req = cumSeries(reqs);
  const cumulative: CumPoint[] = cumWeeks.map((w, i) => ({
    label: w.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
    members: mem[i],
    properties: pro[i],
    requerimientos: req[i],
  }));

  // ── activity (mutually exclusive buckets) ─────────────────────────────────
  const now = Date.now();
  let active7d = 0;
  let active30d = 0;
  let ever = 0;
  for (const u of users) {
    if (!u.last_active) continue;
    ever++;
    const age = now - new Date(u.last_active).getTime();
    if (age <= 7 * DAY) active7d++;
    if (age <= 30 * DAY) active30d++;
  }
  const total = users.length;
  const activity = {
    active7d,
    active8to30: active30d - active7d,
    dormant: ever - active30d,
    never: total - ever,
    total,
  };

  // ── supply vs demand by state ─────────────────────────────────────────────
  const sup: Record<string, number> = {};
  const dem: Record<string, number> = {};
  for (const p of props) if (p.state) sup[p.state] = (sup[p.state] ?? 0) + 1;
  for (const r of reqs)
    for (const s of r.states ?? []) dem[s] = (dem[s] ?? 0) + 1;
  const supplyDemand: StateLiquidity[] = [
    ...new Set([...Object.keys(sup), ...Object.keys(dem)]),
  ]
    .map((state) => ({ state, supply: sup[state] ?? 0, demand: dem[state] ?? 0 }))
    .sort((a, b) => b.supply + b.demand - (a.supply + a.demand));

  // ── matches ───────────────────────────────────────────────────────────────
  const matches = matchNotifsRes.count ?? 0;

  return {
    kpis: {
      brokers: total,
      active7d,
      listings: props.length,
      requerimientos: reqs.length,
      matches,
      offers: offersRes.count ?? 0,
    },
    growth,
    cumulative,
    activity,
    supplyDemand,
  };
}
