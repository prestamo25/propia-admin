import { NextResponse } from "next/server";
import { fetchPulse } from "@/lib/pulse";

export const dynamic = "force-dynamic";

// Polled by the Inicio dashboard. The session proxy gates this route like
// every page, so no extra auth here.
export async function GET() {
  try {
    const pulse = await fetchPulse();
    return NextResponse.json(pulse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
