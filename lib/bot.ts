import { supabaseAdmin } from "@/lib/supabaseAdmin";

// WhatsApp group → state/region. As you spin up one group per state, add a line
// here (group JID → state). Captures from unmapped groups fall back to their
// group name (admin_bot_monitor applies the map). Could become a DB table later
// if you'd rather not redeploy.
const GROUP_REGIONS: Record<string, string> = {
  "120363428754679761@g.us": "Puebla", // Propia AI TEST
};

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
  // Captures in the chosen region (all of them when no region): `captures`
  // holds only the most recent `limit` of these.
  matching: number;
};

export const CAPTURES_PAGE = 100;

// One query (admin_bot_monitor, admin-bot-monitor-2026-10-13.sql): the
// database counts the KPIs and the per-region totals over every capture and
// returns only the `limit` most recent captures of `region`, already summed
// up. Until 2026-10-13 this read every wa_listings row with its body, images
// and extracted JSON and shipped all of them to the browser — 25 MB and 12 s
// at 10k captures, ~1,250 more a day, heading for Lambda's 6 MB cap.
export async function fetchBotMonitor(region: string | null, limit: number): Promise<BotMonitor> {
  const { data, error } = await supabaseAdmin().rpc("admin_bot_monitor", {
    p_group_regions: GROUP_REGIONS,
    p_region: region,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const r = data as {
    kpis: BotMonitor["kpis"];
    last_captured_at: string | null;
    by_region: RegionStat[];
    matching: number;
    captures: Capture[];
  };
  return {
    captures: r.captures,
    byRegion: r.by_region,
    kpis: r.kpis,
    lastCapturedAt: r.last_captured_at,
    matching: r.matching,
  };
}
