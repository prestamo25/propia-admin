import { NextResponse } from "next/server";
import { getRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Search from anywhere (UI/UX batch B, 2026-10-14): members by name, company
// or phone, events by title, curated zones by name — accent-insensitive, one
// query (admin_search). The team only: a regional session never gets here
// (proxy) and getRole() is null for it anyway.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getRole())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ miembros: [], eventos: [], zonas: [] });
  const { data, error } = await supabaseAdmin().rpc("admin_search", { p_q: q });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
