import { supabaseAdmin } from "./supabaseAdmin";

// Desarrollos de constructoras (app 2.0.0, pilot since 2026-10-07). The panel
// reads the tables directly with the service role: the app's RPCs filter by
// the viewer, the panel sees everything. Freshness is THE health signal —
// brokers lose trust the day a «Disponible» unit turns out to be sold.

export type UnitStatus = "available" | "held" | "sold";

export type DevelopmentRow = {
  id: string;
  name: string;
  kind: "vertical" | "horizontal";
  stage: "preventa" | "construccion" | "entrega_inmediata";
  delivery_date: string | null;
  state: string | null;
  city: string | null;
  zona: string | null;
  status: "draft" | "published" | "archived";
  commission_pct: number | null;
  registration_days: number;
  cover: string | null;
  photos: number;
  has_brochure: boolean;
  located: "zona" | "google" | "texto";
  availability_updated_at: string;
  created_at: string;
  owner: { id: string; name: string; phone: string; avatar_url: string | null; is_premium: boolean };
  units: { total: number; available: number; held: number; sold: number };
  price_from: number | null;
  price_to: number | null;
  models: number;
};

export const STAGE_LABEL: Record<DevelopmentRow["stage"], string> = {
  preventa: "Preventa",
  construccion: "En construcción",
  entrega_inmediata: "Entrega inmediata",
};

const n = (v: unknown) => (v == null ? null : Number(v));

export async function fetchDevelopments(): Promise<DevelopmentRow[]> {
  const sb = supabaseAdmin();
  const [{ data: devs, error }, { data: units, error: e2 }, { data: models, error: e3 }] = await Promise.all([
    sb
      .from("developments")
      .select(
        "id, name, kind, stage, delivery_date, state, city, zona, status, commission_pct, registration_days, photos, brochure_url, place_id, colonia_key, availability_updated_at, created_at, owner_id",
      )
      .order("availability_updated_at", { ascending: false }),
    sb.from("development_units").select("development_id, status, price"),
    sb.from("development_models").select("development_id"),
  ]);
  if (error || e2 || e3) throw error ?? e2 ?? e3;

  const ownerIds = [...new Set((devs ?? []).map((d) => d.owner_id as string))];
  const { data: owners } = ownerIds.length
    ? await sb.from("users").select("id, name, company, phone, avatar_url, is_premium").in("id", ownerIds)
    : { data: [] };
  const ownerBy = new Map((owners ?? []).map((o) => [o.id as string, o]));

  return (devs ?? []).map((d) => {
    const us = (units ?? []).filter((u) => u.development_id === d.id);
    const avail = us.filter((u) => u.status === "available");
    const prices = avail.map((u) => n(u.price)).filter((p): p is number => p != null);
    const o = ownerBy.get(d.owner_id as string);
    const photos = Array.isArray(d.photos) ? d.photos : [];
    const first = photos[0] as { thumb?: string } | string | undefined;
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      stage: d.stage,
      delivery_date: d.delivery_date,
      state: d.state,
      city: d.city,
      zona: d.zona,
      status: d.status,
      commission_pct: n(d.commission_pct),
      registration_days: d.registration_days,
      cover: typeof first === "string" ? first : first?.thumb ?? null,
      photos: photos.length,
      has_brochure: !!d.brochure_url,
      located: d.place_id ? "google" : d.colonia_key ? "zona" : "texto",
      availability_updated_at: d.availability_updated_at,
      created_at: d.created_at,
      owner: {
        id: d.owner_id,
        name: (o?.company || o?.name || "Constructora") as string,
        phone: (o?.phone ?? "") as string,
        avatar_url: (o?.avatar_url ?? null) as string | null,
        is_premium: !!o?.is_premium,
      },
      units: {
        total: us.length,
        available: avail.length,
        held: us.filter((u) => u.status === "held").length,
        sold: us.filter((u) => u.status === "sold").length,
      },
      price_from: prices.length ? Math.min(...prices) : null,
      price_to: prices.length ? Math.max(...prices) : null,
      models: (models ?? []).filter((m) => m.development_id === d.id).length,
    } satisfies DevelopmentRow;
  });
}

export type DevelopmentDetail = {
  row: DevelopmentRow;
  description: string | null;
  amenities: string[];
  brochure_url: string | null;
  photos: { url: string; thumb: string }[];
  address: string | null;
  lat: number | null;
  lng: number | null;
  models: {
    id: string;
    code: string;
    name: string | null;
    beds: number | null;
    baths: number | null;
    m2: number | null;
    terrain_m2: number | null;
    base_price: number | null;
    floor_plan_url: string | null;
    units: number;
    available: number;
  }[];
  units: { id: string; grp: string; level: number; pos: number; label: string; status: UnitStatus; price: number | null }[];
  events: {
    at: string;
    kind: "status" | "price";
    label: string | null;
    from: string | null;
    to: string | null;
    actor: string;
  }[];
};

export async function fetchDevelopment(id: string): Promise<DevelopmentDetail | null> {
  const all = await fetchDevelopments();
  const row = all.find((d) => d.id === id);
  if (!row) return null;
  const sb = supabaseAdmin();
  const [{ data: d }, { data: models }, { data: units }, { data: events }] = await Promise.all([
    sb.from("developments").select("description, amenities, brochure_url, photos, address, lat, lng").eq("id", id).single(),
    sb.from("development_models").select("*").eq("development_id", id).order("sort_order"),
    sb
      .from("development_units")
      .select("id, model_id, grp, level, pos, label, status, price")
      .eq("development_id", id)
      .order("grp")
      .order("level")
      .order("pos"),
    sb
      .from("development_unit_events")
      .select("at, kind, unit_id, from_value, to_value, actor")
      .eq("development_id", id)
      .order("at", { ascending: false })
      .limit(60),
  ]);
  const actorIds = [...new Set((events ?? []).map((e) => e.actor).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await sb.from("users").select("id, name, company").in("id", actorIds)
    : { data: [] };
  const actorBy = new Map((actors ?? []).map((a) => [a.id, a.company || a.name || "—"]));
  const labelBy = new Map((units ?? []).map((u) => [u.id, u.label]));

  return {
    row,
    description: d?.description ?? null,
    amenities: d?.amenities ?? [],
    brochure_url: d?.brochure_url ?? null,
    photos: (Array.isArray(d?.photos) ? d.photos : []).map((p: { url: string; thumb: string }) => ({ url: p.url, thumb: p.thumb })),
    address: d?.address ?? null,
    lat: n(d?.lat),
    lng: n(d?.lng),
    models: (models ?? []).map((m) => {
      const us = (units ?? []).filter((u) => u.model_id === m.id);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        beds: m.beds,
        baths: n(m.baths),
        m2: n(m.m2),
        terrain_m2: n(m.terrain_m2),
        base_price: n(m.base_price),
        floor_plan_url: m.floor_plan_url,
        units: us.length,
        available: us.filter((u) => u.status === "available").length,
      };
    }),
    units: (units ?? []).map((u) => ({ ...u, price: n(u.price) })),
    events: (events ?? []).map((e) => ({
      at: e.at,
      kind: e.kind,
      label: e.unit_id ? labelBy.get(e.unit_id) ?? "(unidad borrada)" : null,
      from: e.from_value,
      to: e.to_value,
      actor: (e.actor && actorBy.get(e.actor)) || "—",
    })),
  };
}

/** Days since the constructora last touched availability. */
export const staleDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
