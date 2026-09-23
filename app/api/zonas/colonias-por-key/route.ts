import { NextResponse } from "next/server";
import { fetchColoniasPorKeys } from "@/lib/mapaZonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// INEGI colonias by key (≤200), for «Aplicar sugerencia» in the zone editor.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const keys = (new URL(req.url).searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => /^[0-9]{9,13}$/.test(k))
    .slice(0, 200);
  if (!keys.length) return NextResponse.json([]);
  try {
    return NextResponse.json(await fetchColoniasPorKeys(keys), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
