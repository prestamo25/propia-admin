import { supabaseAdmin } from "./supabaseAdmin";

// Zonas — the curation bench for Propia's own zone layer.
//
// The INEGI colonia catalog is ground truth we never edit. On top of it sits a
// small editorial layer (tipo='ZONA') that speaks the way brokers do: INEGI
// files Lomas de Angelópolis as three polygons under three names, brokers call
// it one place. A zone's geometry is always the union of its members, so
// membership is the only thing anyone edits.
//
// The queue is DEMAND-driven on purpose. Reviewing the catalog for zones that
// might matter one day is open-ended; reviewing what is actually failing to
// resolve right now is a short list that refills itself and follows brokers
// into new cities without anyone deciding to go curate them.

export type Failure = {
  nombre: string;
  estado: string;
  props: number;
  brokers: number;
  ejemplo: string | null;
  catalogo: boolean;
};

export type Candidate = {
  key: string;
  nombre: string;
  municipio: string;
  tipo: string;
  pins_dentro: number;
  parecido: number;
  geom: { type: string; coordinates: unknown };
};

export type CandidateSet = {
  pins: [number, number][];
  sin_coords: number;
  candidatos: Candidate[];
};

export type ZonaDetail = {
  key: string;
  nombre: string;
  municipio: string;
  estado: string;
  dibujada: boolean;
  km2: number;
  props: number;
  geom: { type: string; coordinates: unknown };
  miembros: { key: string; nombre: string; municipio: string;
              geom: { type: string; coordinates: unknown } }[];
  vecinos: { key: string; nombre: string; municipio: string;
             geom: { type: string; coordinates: unknown } }[];
};

export type Zona = {
  key: string;
  nombre: string;
  municipio: string;
  estado: string;
  miembros: string[] | null;
  props: number;
};

export type Salud = {
  estado: string;
  props: number;
  ligadas: number;
  pct: number;
};

// What hurts: names that resolve to nothing, worst first.
export async function fetchFailures(min = 2): Promise<Failure[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_failures", { p_min: min });
  if (error) throw new Error(error.message);
  return (data ?? []) as Failure[];
}

// What could fix one of them: the failing listings' own pins, plus every
// polygon plausibly part of that place. The pins are the point — you pick
// members by seeing which polygons the listings actually fall in.
export async function fetchCandidates(
  estado: string,
  nombre: string,
): Promise<CandidateSet> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_candidates", {
    p_estado: estado,
    p_nombre: nombre,
  });
  if (error) throw new Error(error.message);
  const set = (data ?? { pins: [], sin_coords: 0, candidatos: [] }) as CandidateSet;
  // strongest evidence first: polygons containing pins, then name similarity
  set.candidatos = [...(set.candidatos ?? [])].sort(
    (a, b) => b.pins_dentro - a.pins_dentro || b.parecido - a.parecido,
  );
  return set;
}

// The zones that exist today, with how much inventory each one carries.
export async function fetchZonas(): Promise<Zona[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("colonias")
    .select("key, nombre, municipio, estado, miembros")
    .eq("tipo", "ZONA")
    .order("key");
  if (error) throw new Error(error.message);
  const zonas = (data ?? []) as Omit<Zona, "props">[];

  const counts = await Promise.all(
    zonas.map(async (z) => {
      const { count } = await sb
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("colonia_key", z.key);
      return count ?? 0;
    }),
  );
  return zonas.map((z, i) => ({ ...z, props: counts[i] }));
}

// One number that says whether this needs attention at all. Aggregated in
// SQL on purpose: a supabase-js read of `properties` silently caps at 1,000
// rows, and a health number computed over a truncated table is a lie — the
// header showed 72.7% when the truth was 67.3%.
export async function fetchSalud(): Promise<Salud[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_salud");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { estado: string; props: number; ligadas: number }[]).map(
    (r) => ({
      ...r,
      pct: r.props ? Math.round((r.ligadas / r.props) * 1000) / 10 : 0,
    }),
  );
}

// Everything about one curated zone: geometry, members, neighbours it could
// absorb, and the inventory it carries. This is the inspect/edit surface.
export async function fetchZonaDetail(key: string): Promise<ZonaDetail> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_detail", { p_key: key });
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No existe la zona ${key}`);
  return data as ZonaDetail;
}
