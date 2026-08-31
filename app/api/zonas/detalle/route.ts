import { NextResponse } from "next/server";
import { fetchZonaDetail } from "@/lib/zonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// One curated zone, for the bench's inspect/edit mode.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Falta key" }, { status: 400 });
  try {
    return NextResponse.json(await fetchZonaDetail(key), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
