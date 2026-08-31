import { NextResponse } from "next/server";
import { fetchCandidates } from "@/lib/zonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// Candidate polygons for one failing name. Selecting a name in the bench must
// not reload the page, so this is the one piece the client fetches directly.
// Gated the same as the page itself — the service key lives only in here.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "dev")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const estado = searchParams.get("estado");
  const nombre = searchParams.get("nombre");
  if (!estado || !nombre) {
    return NextResponse.json({ error: "Faltan estado o nombre" }, { status: 400 });
  }
  try {
    const set = await fetchCandidates(estado, nombre);
    return NextResponse.json(set, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
