import { NextResponse } from "next/server";
import { fetchFailures } from "@/lib/zonas";
import { getRole } from "@/lib/session";
import { roleCan } from "@/lib/auth";

// The «Sin resolver» queue for one estado: names brokers use that resolve to
// nothing, worst first (same RPC the Zonas bench used, filtered here).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRole();
  if (!role || !roleCan(role, "admin")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const estado = new URL(req.url).searchParams.get("estado");
  if (!estado) return NextResponse.json({ error: "Falta estado" }, { status: 400 });
  try {
    const all = await fetchFailures(2);
    return NextResponse.json(all.filter((f) => f.estado === estado), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}
