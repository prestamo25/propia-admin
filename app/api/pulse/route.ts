import { NextResponse } from "next/server";
import { getRole } from "@/lib/session";
import { fetchPulse } from "@/lib/pulse";

export const dynamic = "force-dynamic";

// Polled by the Inicio dashboard. Staff only: the proxy proves *a* session,
// and a regional viewer's is one too.
export async function GET() {
  if (!(await getRole())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const pulse = await fetchPulse();
    return NextResponse.json(pulse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
