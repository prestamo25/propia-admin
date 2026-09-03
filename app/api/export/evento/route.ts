import { NextResponse } from "next/server";
import { getRole } from "@/lib/session";
import { ATTENDEE_STATUS_LABEL, fetchEventDetail, fmtStamp } from "@/lib/eventos";
import { buildXlsx, type Column } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

// One event's participants as .xlsx — the sheet an organizer or Pablo works
// from at the door or after the event. Same text-only cells as the brokers
// export (phones survive Excel intact).

const COLUMNS: Column[] = [
  { header: "Nombre", width: 30 },
  { header: "Teléfono", width: 16 },
  { header: "Empresa", width: 26 },
  { header: "Estatus", width: 16 },
  { header: "Registro", width: 18 },
  { header: "Check-in", width: 18 },
  { header: "Escaneó", width: 24 },
  { header: "Comprobante", width: 12 },
  { header: "Aprobó", width: 24 },
];

export async function GET(req: Request) {
  if (!(await getRole())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const ev = id ? await fetchEventDetail(id) : null;
  if (!ev) return NextResponse.json({ error: "Evento no encontrado." }, { status: 404 });

  const rows = ev.participants.map((p) => [
    p.name ?? "",
    p.phone ?? "",
    p.company ?? "",
    ATTENDEE_STATUS_LABEL[p.status] ?? p.status,
    fmtStamp(p.created_at),
    fmtStamp(p.checked_in_at),
    p.checked_in_at ? (p.checked_in_by ?? "sin registro") : "",
    p.receipt_url ? "Sí" : "",
    p.approved_by ?? "",
  ]);

  const file = buildXlsx(COLUMNS, rows);
  const slug = ev.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase();
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="participantes-${slug || "evento"}.xlsx"`,
      // Same rule as the brokers export: CloudFront caches by URL and drops
      // cookies from the key, so a cacheable response would leak across sessions.
      "cache-control": "no-store",
    },
  });
}
