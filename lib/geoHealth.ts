import { supabaseAdmin } from "./supabaseAdmin";

// Salud de ubicación (P2-9, 2026-09-07). One row per day, computed by the
// `geo-health-daily` cron at 06:00 CDMX (`geo_health_snapshot()`), so the home
// never runs the heavy match queries itself — it just reads the latest row.
export type GeoHealthRow = {
  day: string;
  computed_at: string;
  captures_7d: number;
  captures_point: number;
  captures_area: number;
  captures_municipio: number;
  captures_state: number;
  captures_unresolved: number;
  reqs_open: number;
  reqs_located: number;
  reqs_metro_only: number;
  reqs_with_match: number;
  reqs_with_wa: number;
  props_active: number;
  props_unlocated: number;
  props_pin_no_colonia: number;
  review_pending: number;
  zones_from_pins: number;
};

export type GeoHealthItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
  level: "ok" | "warn" | "down";
  href?: string;
};

export type GeoHealth = { computedAt: string; items: GeoHealthItem[] };

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export async function fetchGeoHealth(): Promise<GeoHealth | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("geo_health_daily")
    .select("*")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as GeoHealthRow;

  const located = r.captures_point + r.captures_area;
  const locPct = pct(located, r.captures_7d);
  const matchPct = pct(r.reqs_with_match, r.reqs_open);
  const n = (v: number) => v.toLocaleString("es-MX");

  return {
    computedAt: r.computed_at,
    items: [
      {
        key: "captures",
        label: "Capturas ubicadas (7 días)",
        value: `${locPct}%`,
        detail: `punto ${pct(r.captures_point, r.captures_7d)}% · zona ${pct(r.captures_area, r.captures_7d)}% · municipio ${pct(r.captures_municipio, r.captures_7d)}% · ${n(r.captures_7d)} ofertas`,
        level: locPct >= 60 ? "ok" : locPct >= 40 ? "warn" : "down",
        href: "/whatsapp",
      },
      {
        key: "reqs",
        label: "Requerimientos con coincidencia",
        value: `${matchPct}%`,
        detail: `${n(r.reqs_with_match)} de ${n(r.reqs_open)} abiertos · con captura WA: ${n(r.reqs_with_wa)} · sólo metro: ${n(r.reqs_metro_only)}`,
        level: matchPct >= 50 ? "ok" : matchPct >= 30 ? "warn" : "down",
      },
      {
        key: "review",
        label: "Ubicaciones por revisar",
        value: n(r.review_pending),
        detail: r.review_pending === 0 ? "cola vacía" : "el resolver no está seguro — decide en Ubicaciones",
        level: r.review_pending <= 20 ? "ok" : r.review_pending <= 50 ? "warn" : "down",
        href: "/ubicaciones",
      },
      {
        key: "props",
        label: "Propiedades sin ubicación",
        value: n(r.props_unlocated),
        detail: `de ${n(r.props_active)} activas · pins sin colonia: ${n(r.props_pin_no_colonia)} · zonas por pines: ${n(r.zones_from_pins)}`,
        level: pct(r.props_unlocated, r.props_active) <= 5 ? "ok" : pct(r.props_unlocated, r.props_active) <= 15 ? "warn" : "down",
        href: "/mapa",
      },
    ],
  };
}
