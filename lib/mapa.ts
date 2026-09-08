import { supabaseAdmin } from "./supabaseAdmin";
import { pageAll } from "./pageAll";

// «Mapa» (Pablo via Franz 2026-09-07, fase 1): every active listing and open
// requerimiento as a point. Rows with only a colonia/zona are placed at that
// polygon's centroid and flagged `precise: false` so the map can draw them
// hollow — an honest "somewhere in this colonia", never a fake address.
// WhatsApp captures (colonia only, thousands) are phase 2 as colonia shading.

export type MapListing = {
  id: string;
  name: string | null;
  price: number | null;
  currency: string | null;
  transaction: "venta" | "renta";
  type: string;
  state: string | null;
  lat: number;
  lng: number;
  precise: boolean;
  place: string | null; // colonia name when placed by centroid
  user_id: string;
  owner: string | null;
  created_at: string;
};

export type MapRequest = {
  id: string;
  title: string | null;
  transaction: string;
  types: string[] | null;
  states: string[] | null;
  price_min: number | null;
  price_max: number | null;
  lat: number;
  lng: number;
  radius_km: number | null;
  precise: boolean;
  place: string | null;
  created_by: string;
  owner: string | null;
  created_at: string;
};

// Requerimientos that arrived through WhatsApp groups (Franz 2026-09-07):
// the bot's demand captures, placed by the resolver's own geo — exact point,
// or the centre of the zone it resolved to (hollow). Nobody owns them until a
// broker claims one in the app; the popup shows the group and the sender.
export type MapWaDemand = {
  id: string;
  title: string | null;
  operation: string | null;
  property_type: string | null;
  price: number | null;
  price_min: number | null;
  location: string | null;
  group_name: string | null;
  state: string | null;
  sender_name: string | null;
  // Last 10 digits of the sender's phone (the capture's contact_phone): lets
  // «Sólo Pablo y yo» show the test messages we post in the groups ourselves.
  sender_phone10: string | null;
  lat: number;
  lng: number;
  precise: boolean;
  place: string | null;
  captured_at: string;
};

export type MapData = {
  listings: MapListing[];
  requests: MapRequest[];
  waDemands: MapWaDemand[];
  missing: { listings: number; requests: number; wa: number };
  states: string[];
  // Accounts whose pins are test material (Franz 2026-09-07: «show only what
  // Pablo Prestamo and I upload for testing purposes») — the «Sólo Pablo y yo»
  // toggle filters to these.
  testOwnerIds: string[];
  // Last 10 digits of the test accounts' phones, for the WhatsApp layer.
  testPhones: string[];
  generatedAt: string;
};

// Pablo Prestamo (Propia AI) and Franz's «Propia Broker» account.
const TEST_OWNER_IDS = [
  "fb561d43-ae89-4d96-b045-046edaad2eb3",
  "15fef8d4-0384-4d50-89c5-059c93e9003d",
];

type PropRow = {
  id: string; name: string | null; price: number | null; currency: string | null;
  transaction: "venta" | "renta"; type: string; state: string | null;
  lat: number | null; lng: number | null; colonia_key: string | null;
  user_id: string; created_at: string;
};
type ReqRow = {
  id: string; title: string | null; transaction: string; types: string[] | null;
  states: string[] | null; price_min: number | null; price_max: number | null;
  lat: number | null; lng: number | null; radius_km: number | null;
  zona_key: string | null; zona_keys: string[] | null; created_by: string; created_at: string;
};
type Centroid = { key: string; nombre: string; estado: string; lat: number; lng: number };
type WaRow = {
  id: string; captured_at: string; group_jid: string; sender_name: string | null; contact_phone: string | null;
  extracted: { title?: string | null; operation?: string | null; property_type?: string | null; price?: number | null; price_min?: number | null; location?: string | null } | null;
  geo_lat: number | null; geo_lng: number | null; geo_precision: string | null; geo_place: string | null;
};
type GroupRow = { group_jid: string; name: string | null; state: string | null };
const WA_DEMAND_DAYS = 30; // same window as the demand lifecycle: older asks are stale

const chunk = <T,>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function fetchMapData(): Promise<MapData> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - WA_DEMAND_DAYS * 24 * 3600 * 1000).toISOString();
  const [props, reqs, waRows, groups] = await Promise.all([
    pageAll<PropRow>(() =>
      sb
        .from("properties")
        .select("id, name, price, currency, transaction, type, state, lat, lng, colonia_key, user_id, created_at")
        .eq("lifecycle", "active")
        .is("archived_at", null)
        .or("source.is.null,source.neq.whatsapp")
        .order("created_at", { ascending: false }),
    ),
    pageAll<ReqRow>(() =>
      sb
        .from("search_requests")
        .select("id, title, transaction, types, states, price_min, price_max, lat, lng, radius_km, zona_key, zona_keys, created_by, created_at")
        .eq("status", "open")
        .eq("lifecycle", "active")
        .order("created_at", { ascending: false }),
    ),
    pageAll<WaRow>(() =>
      sb
        .from("wa_listings")
        .select("id, captured_at, group_jid, sender_name, contact_phone, extracted, geo_lat, geo_lng, geo_precision, geo_place")
        .eq("kind", "demanda")
        .is("declined_at", null)
        .gte("captured_at", since)
        .order("captured_at", { ascending: false }),
    ),
    sb.from("wa_groups").select("group_jid, name, state").then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupRow[];
    }),
  ]);
  const groupByJid = new Map(groups.map((g) => [g.group_jid, g]));
  const last10 = (v: string | null | undefined) => {
    const d = (v ?? "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : null;
  };
  const { data: testUsers, error: tuErr } = await sb.from("users").select("id, phone").in("id", TEST_OWNER_IDS);
  if (tuErr) throw new Error(tuErr.message);
  const testPhones = ((testUsers ?? []) as { phone: string | null }[]).map((u) => last10(u.phone)).filter((x): x is string => !!x);

  // Centroids for the colonia-only rows (one RPC, service role only).
  const keys = new Set<string>();
  for (const p of props) if (p.lat == null && p.colonia_key) keys.add(p.colonia_key);
  for (const r of reqs) {
    if (r.lat != null) continue;
    const k = r.zona_key ?? r.zona_keys?.[0] ?? null;
    if (k) keys.add(k);
  }
  const centroids = new Map<string, Centroid>();
  if (keys.size) {
    const { data, error } = await sb.rpc("map_colonia_centroids", { p_keys: Array.from(keys) });
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Centroid[]) centroids.set(c.key, c);
  }

  // Owner names in one sweep.
  const ids = Array.from(new Set([...props.map((p) => p.user_id), ...reqs.map((r) => r.created_by)]));
  const owners = new Map<string, string>();
  for (const part of chunk(ids, 200)) {
    const { data, error } = await sb.from("users").select("id, name, company").in("id", part);
    if (error) throw new Error(error.message);
    for (const u of (data ?? []) as { id: string; name: string | null; company: string | null }[]) {
      owners.set(u.id, [u.name, u.company].filter(Boolean).join(" · ") || "—");
    }
  }

  const listings: MapListing[] = [];
  let missingListings = 0;
  for (const p of props) {
    let lat = p.lat, lng = p.lng, precise = true, place: string | null = null;
    if (lat == null || lng == null) {
      const c = p.colonia_key ? centroids.get(p.colonia_key) : undefined;
      if (!c) { missingListings++; continue; }
      lat = c.lat; lng = c.lng; precise = false; place = c.nombre;
    }
    listings.push({
      id: p.id, name: p.name, price: p.price, currency: p.currency, transaction: p.transaction,
      type: p.type, state: p.state, lat, lng, precise, place, user_id: p.user_id,
      owner: owners.get(p.user_id) ?? null, created_at: p.created_at,
    });
  }

  const requests: MapRequest[] = [];
  let missingRequests = 0;
  for (const r of reqs) {
    let lat = r.lat, lng = r.lng, precise = true, place: string | null = null;
    if (lat == null || lng == null) {
      const k = r.zona_key ?? r.zona_keys?.[0] ?? null;
      const c = k ? centroids.get(k) : undefined;
      if (!c) { missingRequests++; continue; }
      lat = c.lat; lng = c.lng; precise = false; place = c.nombre;
    }
    requests.push({
      id: r.id, title: r.title, transaction: r.transaction, types: r.types, states: r.states,
      price_min: r.price_min, price_max: r.price_max, lat, lng, radius_km: r.radius_km, precise, place,
      created_by: r.created_by, owner: owners.get(r.created_by) ?? null, created_at: r.created_at,
    });
  }

  // WhatsApp demands: the resolver's point (exact) or zone centre (hollow);
  // municipality-level and unresolved ones have no honest place on a map.
  const waDemands: MapWaDemand[] = [];
  let missingWa = 0;
  for (const w of waRows) {
    if (w.geo_lat == null || w.geo_lng == null || (w.geo_precision !== "point" && w.geo_precision !== "area")) { missingWa++; continue; }
    const g = groupByJid.get(w.group_jid);
    const x = w.extracted ?? {};
    waDemands.push({
      id: w.id, title: x.title ?? null, operation: x.operation ?? null, property_type: x.property_type ?? null,
      price: x.price ?? null, price_min: x.price_min ?? null, location: x.location ?? null,
      group_name: g?.name ?? null, state: g?.state ?? null, sender_name: w.sender_name, sender_phone10: last10(w.contact_phone),
      lat: w.geo_lat, lng: w.geo_lng, precise: w.geo_precision === "point",
      place: w.geo_precision === "point" ? null : (w.geo_place ?? x.location ?? null), captured_at: w.captured_at,
    });
  }

  const stateCount = new Map<string, number>();
  for (const l of listings) if (l.state) stateCount.set(l.state, (stateCount.get(l.state) ?? 0) + 1);
  for (const r of requests) for (const s of r.states ?? []) stateCount.set(s, (stateCount.get(s) ?? 0) + 1);
  for (const w of waDemands) if (w.state) stateCount.set(w.state, (stateCount.get(w.state) ?? 0) + 1);
  const states = Array.from(stateCount.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s);

  return {
    listings,
    requests,
    waDemands,
    missing: { listings: missingListings, requests: missingRequests, wa: missingWa },
    states,
    testOwnerIds: TEST_OWNER_IDS,
    testPhones,
    generatedAt: new Date().toISOString(),
  };
}
