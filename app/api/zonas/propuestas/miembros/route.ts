import { NextResponse } from "next/server";
import { fetchPropuestaMiembros } from "@/lib/mapaZonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// The member polygons of one proposal, to load it into the editor.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  try {
    return NextResponse.json(await fetchPropuestaMiembros(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
