import { supabaseAdmin } from "./supabaseAdmin";

// Salud de requerimientos (2026-09-21). El 21 de septiembre salieron cuatro
// fallas seguidas en requerimientos y las cuatro eran INVISIBLES: todas se ven
// igual, como una pantalla vacía. Desde la app no se puede distinguir «el
// mercado no tiene nada para tu cliente» de «nosotros lo tiramos».
//
// `geo_health_tick` clasifica cada requerimiento abierto en un cubo y lo
// guarda en geo_health_req; `geo_health_snapshot()` (cron 06:00 CDMX) lo
// agrega en geo_health_daily. Aquí sólo se LEE la fila del día, igual que
// geoHealth.ts — el panel nunca corre las consultas caras.

export type RequestHealthBucket = {
  key: string;
  label: string;
  hint: string;
  count: number;
  pct: number;
  color: string;
};

export type RequestHealth = {
  computedAt: string;
  open: number;
  buckets: RequestHealthBucket[];
  /** Nunca tuvieron un veredicto apto ⇒ su asesor jamás recibió un aviso. */
  silent: number;
  silentPct: number;
};

// Paleta validada con el validador de dataviz (light, superficie #fcfcfb):
// banda de luminosidad, piso de croma, separación CVD y piso de visión normal
// PASAN. `sin_oferta` va en gris a propósito: no es una falla nuestra, es el
// único vacío honesto. El ámbar queda por debajo de 3:1 contra el fondo, así
// que cada segmento lleva SIEMPRE etiqueta y número en la leyenda.
const BUCKETS: Array<Omit<RequestHealthBucket, "count" | "pct">> = [
  {
    key: "con_coincidencias",
    label: "Ve coincidencias",
    hint: "Fichas confirmadas dentro de su zona",
    color: "#059669",
  },
  {
    key: "cerca",
    label: "Sólo alternativas cerca",
    hint: "Nada en su zona; se le muestran las más cercanas con su distancia",
    color: "#3b82f6",
  },
  {
    key: "solo_whatsapp",
    label: "Sólo WhatsApp",
    hint: "Nada de asesores; el tablero Público sí trae algo",
    color: "#f59e0b",
  },
  {
    key: "geografia",
    label: "Bloqueado por geografía",
    hint: "El mercado SÍ tiene lo que pide, pero queda fuera de alcance",
    color: "#e11d48",
  },
  {
    key: "sin_oferta",
    label: "Sin oferta real",
    hint: "De verdad no hay nada que cumpla los criterios — vacío honesto",
    color: "#a3a3a3",
  },
];

type Row = {
  computed_at: string;
  reqs_open: number | null;
  reqs_con_coincidencias: number | null;
  reqs_cerca: number | null;
  reqs_solo_whatsapp: number | null;
  reqs_geografia: number | null;
  reqs_sin_oferta: number | null;
  reqs_sin_apto: number | null;
};

export async function fetchRequestHealth(): Promise<RequestHealth | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("geo_health_daily")
    .select(
      "computed_at, reqs_open, reqs_con_coincidencias, reqs_cerca, reqs_solo_whatsapp, reqs_geografia, reqs_sin_oferta, reqs_sin_apto",
    )
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Row;

  const counts: Record<string, number> = {
    con_coincidencias: r.reqs_con_coincidencias ?? 0,
    cerca: r.reqs_cerca ?? 0,
    solo_whatsapp: r.reqs_solo_whatsapp ?? 0,
    geografia: r.reqs_geografia ?? 0,
    sin_oferta: r.reqs_sin_oferta ?? 0,
  };
  // El total se saca de los cubos, no de reqs_open: si el tick aún no alcanzó
  // a clasificar a todos, los porcentajes deben sumar sobre lo clasificado y
  // no mentir contra un denominador mayor.
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const silent = r.reqs_sin_apto ?? 0;
  return {
    computedAt: r.computed_at,
    open: total,
    silent,
    silentPct: Math.round((silent / total) * 100),
    buckets: BUCKETS.map((b) => ({
      ...b,
      count: counts[b.key] ?? 0,
      pct: Math.round(((counts[b.key] ?? 0) / total) * 100),
    })),
  };
}
