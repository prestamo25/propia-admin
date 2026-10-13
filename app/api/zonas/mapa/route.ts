import { NextResponse } from "next/server";
import { fetchMapaZonas } from "@/lib/mapaZonas";
import { apiViewer, canSeeEstado } from "@/lib/access";

// Every zone of one estado, for the Zonas map. Fetched on estado change so the
// map itself is created once per visit. Gated like the page — a regional
// viewer only for their own estados.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await apiViewer("zonas");
  if (!viewer) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const estado = new URL(req.url).searchParams.get("estado");
  if (!estado) return NextResponse.json({ error: "Falta estado" }, { status: 400 });
  if (!canSeeEstado(viewer, estado)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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
