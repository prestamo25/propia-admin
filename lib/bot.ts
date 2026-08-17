import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// WhatsApp group → state/region. As you spin up one group per state, add a line
// here (group JID → state). Captures from unmapped groups fall back to their
// group name. Could become a DB table later if you'd rather not redeploy.
const GROUP_REGIONS: Record<string, string> = {
  "120363428754679761@g.us": "Puebla", // Propia AI TEST
};

function resolveRegion(groupJid: string | null, groupName: string | null): string {
  if (groupJid && GROUP_REGIONS[groupJid]) return GROUP_REGIONS[groupJid];
  return groupName?.trim() || "Sin grupo";
}

export type Capture = {
  id: string;
  captured_at: string | null;
  region: string;
  group_name: string | null;
  sender_name: string | null;
  contact_phone: string | null;
  kind: string | null; // oferta / demanda / ruido
  review_status: string | null;
  image_count: number;
  promoted: boolean;
  title: string | null;
  price: number | null;
  currency: string | null;
  property_type: string | null;
  operation: string | null;
  location: string | null;
  body_preview: string | null;
};

export type RegionStat = {
  region: string;
  total: number;
  promoted: number;
  lastCapturedAt: string | null;
};

export type BotMonitor = {
  captures: Capture[];
  byRegion: RegionStat[];
  kpis: {
    total: number;
    promoted: number;
    pending: number;
    oferta: number;
    demanda: number;
    regions: number;
  };
  lastCapturedAt: string | null;
};

export async function fetchBotMonitor(): Promise<BotMonitor> {
  const sb = supabaseAdmin();

  // Paged (pageAll): wa_listings holds ~1–2k rows inside its 7-day retention
  // window, past PostgREST's 1,000-row cap — an unpaged read silently drops
  // the tail of the feed.
  const [waRows, promoRows] = await Promise.all([
    pageAll<Record<string, unknown>>(() =>
      sb
        .from("wa_listings")
        .select(
          "id, captured_at, group_jid, group_name, sender_name, contact_phone, kind, review_status, images, extracted, body",
        )
        .order("captured_at", { ascending: false }),
    ),
    pageAll<{ wa_listing_id: string | null }>(() =>
      sb.from("properties").select("wa_listing_id").eq("source", "whatsapp"),
    ),
  ]);

  const promoted = new Set(
    promoRows.map((p) => p.wa_listing_id).filter(Boolean) as string[],
  );

  const captures: Capture[] = waRows.map((row) => {
    const r = row as {
      id: string;
      captured_at: string | null;
      group_jid: string | null;
      group_name: string | null;
      sender_name: string | null;
      contact_phone: string | null;
      kind: string | null;
      review_status: string | null;
      images: unknown;
      extracted: Record<string, unknown> | null;
      body: string | null;
    };
    const ex = r.extracted ?? {};
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const body = typeof r.body === "string" ? r.body.replace(/\s+/g, " ").trim() : "";
    return {
      id: r.id,
      captured_at: r.captured_at,
      region: resolveRegion(r.group_jid, r.group_name),
      group_name: r.group_name,
      sender_name: r.sender_name,
      contact_phone: r.contact_phone,
      kind: r.kind,
      review_status: r.review_status,
      image_count: Array.isArray(r.images) ? r.images.length : 0,
      promoted: promoted.has(r.id),
      title: str(ex.title),
      price: num(ex.price),
      currency: str(ex.currency),
      property_type: str(ex.property_type),
      operation: str(ex.operation),
      location: str(ex.location),
      body_preview: body ? body.slice(0, 180) : null,
    };
  });

  // by-region aggregation
  const rm = new Map<string, RegionStat>();
  for (const c of captures) {
    let e = rm.get(c.region);
    if (!e) {
      e = { region: c.region, total: 0, promoted: 0, lastCapturedAt: null };
      rm.set(c.region, e);
    }
    e.total++;
    if (c.promoted) e.promoted++;
    if (c.captured_at && (!e.lastCapturedAt || c.captured_at > e.lastCapturedAt)) {
      e.lastCapturedAt = c.captured_at;
    }
  }
  const byRegion = [...rm.values()].sort((a, b) => b.total - a.total);

  return {
    captures,
    byRegion,
    kpis: {
      total: captures.length,
      promoted: captures.filter((c) => c.promoted).length,
      pending: captures.filter((c) => c.review_status === "pending").length,
      oferta: captures.filter((c) => c.kind === "oferta").length,
      demanda: captures.filter((c) => c.kind === "demanda").length,
      regions: byRegion.length,
    },
    lastCapturedAt: captures[0]?.captured_at ?? null,
  };
}
