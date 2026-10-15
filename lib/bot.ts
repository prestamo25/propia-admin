import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Capture = {
  id: string;
  captured_at: string | null;
  region: string; // estado, from wa_groups.state («Sin estado» when untagged)
  group_name: string | null;
  sender_name: string | null;
  contact_phone: string | null;
  kind: string | null; // oferta / demanda / ruido
  image_count: number;
  claimed: boolean; // a broker turned it into a property with «Reclámala»
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
  claimed: number;
  lastCapturedAt: string | null;
};

export type BotMonitor = {
  captures: Capture[];
  byRegion: RegionStat[];
  kpis: {
    total: number;
    today: number; // new captures today (CDMX), by created_at
    states: number;
    claimed: number; // every claimed capture, also ones no longer stored
    oferta: number;
    demanda: number;
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
// v2 (admin-bot-monitor-v2-2026-10-15.sql): regions are estados from
// wa_groups, «Reclamadas» replaces «Promovidas» (source 'whatsapp' = 0 forever)
// and «Hoy» replaces «Pendientes» (review_status never leaves 'pending').
export async function fetchBotMonitor(region: string | null, limit: number): Promise<BotMonitor> {
  const { data, error } = await supabaseAdmin().rpc("admin_bot_monitor", {
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
