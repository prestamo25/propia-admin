import { NextResponse } from "next/server";
import { fetchMapaZonas } from "@/lib/mapaZonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// Every zone of one estado, for the big map. Fetched on estado change so the
// map itself is created once per visit. Gated like the page.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const estado = new URL(req.url).searchParams.get("estado");
  if (!estado) return NextResponse.json({ error: "Falta estado" }, { status: 400 });
  try {
    return NextResponse.json(await fetchMapaZonas(estado), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
