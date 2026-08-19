import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Compartir con cliente — la estadística que pidió Pablo (2026-08-18).
//
// Two numbers, and they are NOT the ones the app used to have:
//   · Envíos  = one row per tap on «Compartir con cliente» (`share_events`,
//     written by the share RPCs). The old count was rows in `share_links`,
//     which reuses one row per (propiedad, broker) — mandar la misma ficha a
//     diez clientes contaba una vez.
//   · Aperturas = one row per visitante per ficha per día (`share_views`,
//     written from the client's BROWSER). The old `view_count` counted server
//     renders: WhatsApp's link-preview crawler inflated it, the CDN cache
//     swallowed the real opens.
//
// Both tables start empty on the day they ship — nothing before that can be
// reconstructed, so the historical `share_links` figures ride along as a
// clearly-labelled baseline instead of being mixed into the series.

export type ShareDay = { label: string; day: string; sends: number; opens: number };

export type ShareBrokerRow = {
  id: string;
  name: string;
  sends: number;
  opens: number;
};

export type ShareStats = {
  sends: { today: number; week: number; month: number };
  opens: { today: number; week: number; month: number };
  brokersWeek: number;
  days: ShareDay[];
  topBrokers: ShareBrokerRow[];
  // Pre-counter totals from share_links, shown as a footnote.
  baseline: { fichas: number; brokers: number };
  counting: boolean;
};

const TZ = "America/Mexico_City";
const DAYS_SHOWN = 14;

// CDMX calendar day of an ISO timestamp ("2026-08-18").
function cdmxDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export async function fetchShareStats(): Promise<ShareStats> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [sendRows, propertyOpens, waOpens, links] = await Promise.all([
    // share_events ya trae TODOS los envíos (property, event y wa_capture).
    pageAll<{ created_at: string; sharer_id: string }>(() =>
      sb.from("share_events").select("created_at, sharer_id").gte("created_at", since),
    ),
    pageAll<{ created_at: string; sharer_id: string | null }>(() =>
      sb.from("share_views").select("created_at, sharer_id").gte("created_at", since),
    ),
    // Aperturas de fichas de capturas (/w/<code>) — tabla propia porque el
    // FK apunta a wa_share_links; para el panel son la misma métrica.
    pageAll<{ created_at: string; sharer_id: string | null }>(() =>
      sb.from("wa_share_views").select("created_at, sharer_id").gte("created_at", since),
    ),
    pageAll<{ sharer_id: string }>(() => sb.from("share_links").select("sharer_id")),
  ]);
  const openRows = [...propertyOpens, ...waOpens];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const weekAgo = Date.now() - 7 * 86400000;
  const inWeek = (iso: string) => new Date(iso).getTime() >= weekAgo;

  const sends = {
    today: sendRows.filter((r) => cdmxDay(r.created_at) === today).length,
    week: sendRows.filter((r) => inWeek(r.created_at)).length,
    month: sendRows.length,
  };
  const opens = {
    today: openRows.filter((r) => cdmxDay(r.created_at) === today).length,
    week: openRows.filter((r) => inWeek(r.created_at)).length,
    month: openRows.length,
  };

  // Last 14 CDMX days, oldest first, zero-filled so the chart keeps its shape.
  const days: ShareDay[] = [];
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
    days.push({
      day,
      label: dayLabel(day),
      sends: sendRows.filter((r) => cdmxDay(r.created_at) === day).length,
      opens: openRows.filter((r) => cdmxDay(r.created_at) === day).length,
    });
  }

  // Top brokers of the last 7 days, by envíos.
  const weekSends = sendRows.filter((r) => inWeek(r.created_at));
  const weekOpens = openRows.filter((r) => inWeek(r.created_at));
  const tally = new Map<string, { sends: number; opens: number }>();
  for (const r of weekSends) {
    const t = tally.get(r.sharer_id) ?? { sends: 0, opens: 0 };
    t.sends += 1;
    tally.set(r.sharer_id, t);
  }
  for (const r of weekOpens) {
    if (!r.sharer_id) continue;
    const t = tally.get(r.sharer_id) ?? { sends: 0, opens: 0 };
    t.opens += 1;
    tally.set(r.sharer_id, t);
  }
  const ranked = [...tally.entries()]
    .sort((a, b) => b[1].sends - a[1].sends || b[1].opens - a[1].opens)
    .slice(0, 8);

  let topBrokers: ShareBrokerRow[] = [];
  if (ranked.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name")
      .in(
        "id",
        ranked.map(([id]) => id),
      );
    const names = new Map((users ?? []).map((u) => [u.id as string, (u.name as string) ?? "—"]));
    topBrokers = ranked.map(([id, t]) => ({
      id,
      name: names.get(id) ?? "—",
      sends: t.sends,
      opens: t.opens,
    }));
  }

  return {
    sends,
    opens,
    brokersWeek: new Set(weekSends.map((r) => r.sharer_id)).size,
    days,
    topBrokers,
    baseline: {
      fichas: links.length,
      brokers: new Set(links.map((l) => l.sharer_id)).size,
    },
    counting: sendRows.length > 0 || openRows.length > 0,
  };
}
