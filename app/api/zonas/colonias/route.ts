import { NextResponse } from "next/server";
import { fetchMapaColonias } from "@/lib/mapaZonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// INEGI colonia outlines inside the current viewport (bbox = w,s,e,n).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const estado = searchParams.get("estado");
  const bbox = (searchParams.get("bbox") ?? "").split(",").map(Number);
  if (!estado || bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "Faltan estado o bbox" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await fetchMapaColonias(estado, bbox as [number, number, number, number]),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
