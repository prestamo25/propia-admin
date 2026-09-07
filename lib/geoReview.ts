import { supabaseAdmin } from "@/lib/supabaseAdmin";

// «Ubicaciones dudosas» — the human half of the metro plan (2026-09-07). The
// resolver never guesses when a location is doubtful: a broker's map pick far
// from their metro, a name-linked colonia that disagrees with the ladder, or a
// listing whose only answer lies far away lands here with what the system
// would suggest. One tap accepts the suggestion, one tap keeps the current.

export type GeoPoint = {
  lat?: number | null;
  lng?: number | null;
  colonia_key?: string | null;
  colonia?: string | null;
  address?: string | null;
  place_id?: string | null;
  place?: string | null;
  precision?: string | null;
  source?: string | null;
  metro_km?: number | null;
};

export type GeoReviewRow = {
  id: string;
  kind: "property" | "wa_listing" | "request";
  ref_id: string;
  owner_id: string | null;
  current: GeoPoint;
  suggested: GeoPoint;
  reason: string;
  created_at: string;
  // resolved for display
  name: string | null;
  owner_name: string | null;
  current_colonia: string | null; // «LA PAZ · Chietla»
  suggested_colonia: string | null;
};

export const REASON_LABEL: Record<string, string> = {
  bare_far_pick: "Punto elegido lejos de su zona metropolitana",
  disagree: "El catálogo y el resolver no coinciden",
  disagree_far: "Ligada a una colonia lejana",
  outside_metro: "Sólo se encontró lejos de su zona metropolitana",
};

export async function fetchGeoReview(): Promise<GeoReviewRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("geo_review")
    .select("id, kind, ref_id, owner_id, current, suggested, reason, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<GeoReviewRow, "name" | "owner_name" | "current_colonia" | "suggested_colonia">[];
  if (rows.length === 0) return [];

  const propIds = rows.filter((r) => r.kind === "property").map((r) => r.ref_id);
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean))) as string[];
  const keys = Array.from(
    new Set(rows.flatMap((r) => [r.current?.colonia_key, r.suggested?.colonia_key]).filter(Boolean)),
  ) as string[];

  const [props, owners, colonias] = await Promise.all([
    propIds.length
      ? sb.from("properties").select("id, name").in("id", propIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    ownerIds.length
      ? sb.from("users").select("id, name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    keys.length
      ? sb.from("colonias").select("key, nombre, municipio").in("key", keys)
      : Promise.resolve({ data: [] as { key: string; nombre: string; municipio: string }[] }),
  ]);
  const nameOf = new Map((props.data ?? []).map((p) => [p.id, p.name]));
  const ownerOf = new Map((owners.data ?? []).map((u) => [u.id, u.name]));
  const colOf = new Map((colonias.data ?? []).map((c) => [c.key, `${c.nombre} · ${c.municipio}`]));

  return rows.map((r) => ({
    ...r,
    name: r.kind === "property" ? (nameOf.get(r.ref_id) ?? null) : null,
    owner_name: r.owner_id ? (ownerOf.get(r.owner_id) ?? null) : null,
    current_colonia: r.current?.colonia_key ? (colOf.get(r.current.colonia_key) ?? null) : null,
    suggested_colonia: r.suggested?.colonia_key ? (colOf.get(r.suggested.colonia_key) ?? null) : null,
  }));
}

export async function countGeoReview(): Promise<number> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from("geo_review")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
