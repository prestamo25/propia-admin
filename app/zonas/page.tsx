import { TopNav } from "@/components/TopNav";
import { ZonaBench } from "@/components/ZonaBench";
import { requireRole } from "@/lib/session";
import { fetchFailures, fetchCandidates, fetchSalud, fetchZonas } from "@/lib/zonas";

export const dynamic = "force-dynamic";

export default async function ZonasPage() {
  await requireRole("admin");

  let failures, salud, zonas, initial = null;
  try {
    [failures, salud, zonas] = await Promise.all([
      fetchFailures(2),
      fetchSalud(),
      fetchZonas(),
    ]);
    // Preload the worst offender so the bench opens on something useful.
    if (failures.length) {
      initial = { failure: failures[0], set: await fetchCandidates(failures[0].estado, failures[0].nombre) };
    }
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

  const total = salud.reduce((a, s) => a + s.props, 0);
  const ligadas = salud.reduce((a, s) => a + s.ligadas, 0);
  const pct = total ? Math.round((ligadas / total) * 1000) / 10 : 0;
  const pendientes = failures.reduce((a, f) => a + f.props, 0);

  return (
    <div className="min-h-screen">
      <TopNav active="zonas" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Zonas</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Los brokers no hablan en colonias del INEGI. Una zona junta varios polígonos
              oficiales bajo el nombre que sí usan — como Lomas de Angelópolis, que el INEGI
              parte en tres. Aquí sólo aparece lo que hoy no está resolviendo.
            </p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <b className="block text-2xl font-semibold tabular-nums text-neutral-900">{pct}%</b>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                Inventario con zona
              </span>
            </div>
            <div className="text-right">
              <b className="block text-2xl font-semibold tabular-nums text-rose-600">{pendientes}</b>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                Props sin resolver
              </span>
            </div>
            <div className="text-right">
              <b className="block text-2xl font-semibold tabular-nums text-neutral-900">{zonas.length}</b>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                Zonas curadas
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <ZonaBench failures={failures} zonas={zonas} initial={initial} />
        </div>

        {/* per-state health */}
        <section className="mt-8">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Cobertura por estado
          </h2>
          <ul className="mt-2 space-y-1.5">
            {salud.filter((s) => s.props >= 5).map((s) => (
              <li key={s.estado} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate text-neutral-700">{s.estado}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${s.pct}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-neutral-500">
                  {s.ligadas}/{s.props} · {s.pct}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
