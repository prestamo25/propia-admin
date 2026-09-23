import { NextResponse } from "next/server";
import { fetchPropuestas } from "@/lib/mapaZonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// Draft zones of one estado (the «Propuestas» tab of the Zonas page).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const estado = new URL(req.url).searchParams.get("estado");
  if (!estado) return NextResponse.json({ error: "Falta estado" }, { status: 400 });
  try {
    return NextResponse.json(await fetchPropuestas(estado), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
