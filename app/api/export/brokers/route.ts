import { NextResponse } from "next/server";
import { fetchOverview } from "@/lib/data";
import { filterBrokers } from "@/lib/brokerFilter";
import { getRole } from "@/lib/session";
import { fmtDate, statusLabel } from "@/lib/format";
import { buildXlsx, type Column } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

// The brokers list as a real .xlsx — the contact sheet Pablo works from for
// campaigns. Sorted A–Z by name (it's a contact list, not a timeline) and
// filtered by the same ?q= the table's search box uses.

const COLUMNS: Column[] = [
  { header: "Nombre", width: 30 },
  { header: "Teléfono", width: 16 },
  { header: "Email", width: 34 },
  { header: "Empresa", width: 26 },
  { header: "Estados", width: 24 },
  { header: "WhatsApp", width: 11 },
  { header: "Estatus", width: 13 },
  { header: "Alta", width: 14 },
];

export async function GET(req: Request) {
  // Personal data leaves the building here, so re-check the session instead of
  // trusting the proxy alone to have gated the route.
  if (!(await getRole())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const { brokers } = await fetchOverview();

  const rows = filterBrokers(brokers, q)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es"))
    .map((b) => [
      b.name ?? "",
      // Straight from the database (52 + 10 digits), untouched — the text cell
      // is what keeps Excel from mangling it into 5.22225E+11.
      b.phone ?? "",
      b.email ?? "",
      b.company ?? "",
      b.states.join(", "),
      b.whatsapp_opt_in ? "Sí" : "No",
      statusLabel(b.status, b.blocked),
      fmtDate(b.created_at),
    ]);

  const file = buildXlsx(COLUMNS, rows);
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date());

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="brokers-propia-${stamp}.xlsx"`,
      // Load-bearing, not hygiene: the CloudFront in front of admin.propia.dev
      // honors origin cache headers and leaves cookies out of the cache key, so
      // a cacheable response here would hand one session's contact list to the
      // next viewer. Don't drop this.
      "cache-control": "no-store",
    },
  });
}
