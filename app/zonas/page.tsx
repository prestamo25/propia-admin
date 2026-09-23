import { TopNav } from "@/components/TopNav";
import { ZonasClient } from "@/components/ZonasClient";
import { requireRole } from "@/lib/session";
import { fetchMapData } from "@/lib/mapa";

export const dynamic = "force-dynamic";

// «Zonas» (Franz 2026-09-23): every zone of an estado on one big map, with the
// editor in the side panel. Kept apart from «Mapa» on purpose — properties and
// zones together read as a wall of ink. Listings come along only to count
// what each zone holds and to show, on demand, the ones no zone covers; the
// zones themselves are fetched per estado by the client.
export default async function ZonasPage() {
  await requireRole("admin");

  let data;
  try {
    data = await fetchMapData();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="zonas" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  // Only what counting needs crosses to the browser.
  const listings = data.listings.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, state: l.state }));
  const demand = [
    ...data.requests.map((r) => ({ lat: r.lat, lng: r.lng, states: r.states ?? [] })),
    ...data.waDemands.map((w) => ({ lat: w.lat, lng: w.lng, states: w.state ? [w.state] : [] })),
  ];

  return (
    // exactly one screen tall: the map never scrolls away, only the panel's list does
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopNav active="zonas" />
      <ZonasClient states={data.states} listings={listings} demand={demand} />
    </div>
  );
}
