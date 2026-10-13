import { TopNav } from "@/components/TopNav";
import { MapaClient } from "@/components/MapaClient";
import { estadosOf, isRegional, requireViewer } from "@/lib/access";
import { fetchMapData } from "@/lib/mapa";

export const dynamic = "force-dynamic";

// «Mapa» (Pablo via Franz 2026-09-07, fase 1): where listings and
// requerimientos land. Data is read once server-side with the service key;
// the client filters in place so the Google map is created exactly once per
// visit (each map creation is a billed load — free under 10k/month, but only
// if we don't remount it on every filter change).
// A regional viewer (2026-10-13) gets their estados only, with every person
// stripped server-side.
export default async function MapaPage() {
  const viewer = await requireViewer("mapa");
  const limited = isRegional(viewer);

  let data;
  try {
    data = await fetchMapData({ estados: estadosOf(viewer), redact: limited });
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="mapa" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="mapa" />
      <MapaClient data={data} limited={limited} />
    </div>
  );
}
