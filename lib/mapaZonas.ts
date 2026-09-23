import { supabaseAdmin } from "./supabaseAdmin";

// Zonas page (2026-09-23): every zone of one estado on its big map at once.
// Two reads, both service-role RPCs behind the admin gate:
// the zones themselves (with origin, nesting and overlaps worked out in SQL),
// and INEGI colonia outlines for the current viewport only — Puebla alone has
// 3,277, far too many to draw at city zoom.

export type ZonaKind = "curada" | "familia" | "google";

export type Geo = { type: string; coordinates: unknown };

export type MapZona = {
  key: string;
  nombre: string;
  municipio: string;
  /** curada = made by hand in the bench · familia = auto name family from a
   *  requerimiento · google = auto from a Google area or pin cluster */
  kind: ZonaKind;
  dibujada: boolean;
  miembros: number;
  km2: number;
  /** the smallest zone that covers ≥ 90 % of this one (curada/familia only) */
  padre: string | null;
  /** zones sharing > 5 % of area without either containing the other */
  traslapes: string[];
  geom: Geo;
};

export type MapColonia = {
  key: string;
  nombre: string;
  municipio: string;
  /** colonias of the estado with this same name (1 = the name alone resolves) */
  homonimos?: number;
  geom: Geo;
};

export async function fetchMapaZonas(estado: string): Promise<MapZona[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_mapa_zonas", { p_estado: estado });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapZona[];
}

export async function fetchMapaColonias(
  estado: string,
  [w, s, e, n]: [number, number, number, number],
): Promise<MapColonia[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_mapa_colonias", {
    p_estado: estado, p_w: w, p_s: s, p_e: e, p_n: n,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapColonia[];
}

// Propuestas (2026-09-23): draft zones mined from how brokers name places.
// Nothing here touches matching until someone approves one in the editor.
export type PropuestaTipo = "familia" | "colonias" | "localidad" | "municipio" | "pins" | "dibujar";

export type Propuesta = {
  id: number;
  nombre: string;
  sinonimos: string[];
  tipo: PropuestaTipo;
  n_miembros: number;
  menciones: { wa?: number; prop?: number; perfil?: number; req?: number };
  total: number;
  brokers: number;
  pins: [number, number][];
  nota: string | null;
  revision: "pendiente" | "aprobada" | "descartada";
  zona_key: string | null;
  /** an existing zone with the same name or the same members */
  existe: { key: string; miembros: number; igual: boolean } | null;
  geom: Geo | null;
};

export async function fetchPropuestas(estado: string): Promise<Propuesta[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_propuestas", { p_estado: estado });
  if (error) throw new Error(error.message);
  return (data ?? []) as Propuesta[];
}

export async function fetchPropuestaMiembros(id: number): Promise<MapColonia[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("admin_zona_propuesta_miembros", { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapColonia[];
}
