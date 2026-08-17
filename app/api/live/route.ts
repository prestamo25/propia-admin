import { NextResponse } from "next/server";
import { pageAll } from "@/lib/pageAll";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Live registration metrics for /en-vivo (event nights, launch week). One
// cheap query — the network is a few hundred rows — recomputed per poll; the
// session proxy already gates this route like every page.

type FeedRow = {
  id: string;
  name: string | null;
  maskedPhone: string;
  created_at: string | null;
  status: string | null;
  tempPin: boolean;
};

export async function GET() {
  const sb = supabaseAdmin();
  // Paged: the en-vivo totals must see EVERY broker — PostgREST caps a single
  // response at 1,000 rows and .limit() can't exceed it.
  type DbUser = {
    id: string;
    name: string | null;
    phone: string | null;
    created_at: string | null;
    status: string | null;
    must_change_pin: boolean | null;
  };
  let rows: DbUser[];
  try {
    rows = await pageAll<DbUser>(() =>
      sb
        .from("users")
        .select("id, name, phone, created_at, status, must_change_pin")
        .order("created_at", { ascending: false }),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const now = Date.now();
  // Event-local day boundary (Puebla). Mexico dropped DST — fixed UTC-6.
  const cdmxDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date(now));
  const midnight = new Date(`${cdmxDay}T00:00:00-06:00`).getTime();

  const ts = (r: { created_at: string | null }) =>
    r.created_at ? new Date(r.created_at).getTime() : 0;
  const today = rows.filter((r) => ts(r) >= midnight);

  const body = {
    total: rows.length,
    today: today.length,
    lastHour: rows.filter((r) => now - ts(r) <= 60 * 60_000).length,
    last5m: rows.filter((r) => now - ts(r) <= 5 * 60_000).length,
    tempPin: rows.filter((r) => r.must_change_pin).length,
    sinNombre: rows.filter((r) => !r.name?.trim()).length,
    feed: rows.slice(0, 14).map(
      (r): FeedRow => ({
        id: r.id,
        name: r.name?.trim() || null,
        maskedPhone: `··· ${String(r.phone ?? "").slice(-4)}`,
        created_at: r.created_at,
        status: r.status,
        tempPin: Boolean(r.must_change_pin),
      }),
    ),
    at: new Date(now).toISOString(),
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
