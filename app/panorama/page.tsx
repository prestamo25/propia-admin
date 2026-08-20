import { fetchPanorama, type Panorama } from "@/lib/analytics";
import { fetchShareStats, type ShareStats } from "@/lib/shares";
import { TopNav } from "@/components/TopNav";
import {
  ActivityBar,
  CumulativeChart,
  SharesChart,
  SupplyDemand,
  WeeklyMultiples,
} from "@/components/PanoramaCharts";
import { CUM_SERIES } from "@/lib/panoramaPalette";

export const dynamic = "force-dynamic";

export default async function PanoramaPage() {
  let data: Panorama;
  let shares: ShareStats | null = null;
  try {
    [data, shares] = await Promise.all([fetchPanorama(), fetchShareStats().catch(() => null)]);
  } catch (e) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <TopNav active="panorama" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  const { kpis, growth, cumulative, activity, supplyDemand } = data;

  return (
    <div className="min-h-screen">
      <TopNav active="panorama" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Panorama</h1>
          <p className="mt-1 text-sm text-neutral-500">Salud de la red de un vistazo.</p>
        </div>

        {/* KPIs */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Brokers" value={kpis.brokers} dot="#1c4588" />
          <Kpi label="Activos 7d" value={kpis.active7d} dot="#059669" />
          <Kpi label="Propiedades" value={kpis.listings} dot="#059669" />
          <Kpi label="Requerimientos" value={kpis.requerimientos} dot="#C2410C" />
          <Kpi label="Coincidencias" value={kpis.matches} dot="#7c3aed" />
          <Kpi label="Ofertas" value={kpis.offers} dot="#0e7490" />
        </section>

        {/* Growth: cumulative LEVELS (how big are we) … */}
        <Card className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Crecimiento de la red
            </h2>
            <div className="flex items-center gap-4">
              {CUM_SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <CumulativeChart data={cumulative} />
        </Card>

        {/* … and weekly FLOWS (what happened), each on its own scale */}
        <Card className="mb-8">
          <h2 className="mb-4 text-base font-semibold tracking-tight text-neutral-900">
            Actividad nueva por semana
          </h2>
          <WeeklyMultiples data={growth} />
        </Card>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Activity */}
          <Card className="lg:col-span-2">
            <h2 className="mb-4 text-base font-semibold tracking-tight text-neutral-900">
              Actividad de brokers
            </h2>
            <ActivityBar activity={activity} />
          </Card>

          {/* Supply vs demand */}
          <Card className="lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight text-neutral-900">
                Oferta ↔ Demanda por estado
              </h2>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#C2410C" }} /> Demanda
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#059669" }} /> Oferta
                </span>
              </div>
            </div>
            <SupplyDemand rows={supplyDemand} />
          </Card>
        </div>

        {/* Compartir con cliente — envíos reales (cada tap) y aperturas
            verificadas (desde el navegador del cliente). */}
        {shares && (
          <Card className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-neutral-900">
                  Compartidas con clientes
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Un envío por cada «Compartir con cliente»; una apertura por cliente, ficha y día.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#2E5FB0" }} />
                  Envíos
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#059669" }} />
                  Aperturas
                </span>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Envíos hoy" value={shares.sends.today} dot="#2E5FB0" />
              <Kpi label="Envíos 7d" value={shares.sends.week} dot="#2E5FB0" />
              <Kpi label="Aperturas 7d" value={shares.opens.week} dot="#059669" />
              <Kpi label="Brokers 7d" value={shares.brokersWeek} dot="#7c3aed" />
              <Kpi label="Envíos 30d" value={shares.sends.month} dot="#0e7490" />
            </div>

            {shares.counting ? (
              <>
                <SharesChart data={shares.days} />
                {shares.topBrokers.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-medium text-neutral-700">
                      Quién comparte más · últimos 7 días
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-black/[0.05]">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Broker</th>
                            <th className="px-3 py-2 text-right font-medium">Envíos</th>
                            <th className="px-3 py-2 text-right font-medium">Aperturas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shares.topBrokers.map((b) => (
                            <tr key={b.id} className="border-t border-black/[0.04]">
                              <td className="px-3 py-2 text-neutral-800">{b.name}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-neutral-900">
                                {b.sends}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                                {b.opens}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                El contador empieza hoy. Los envíos anteriores no se pueden reconstruir: el enlace
                se reutilizaba, así que sólo sabíamos cuántas fichas distintas se habían compartido.
              </p>
            )}

            <p className="mt-4 text-xs text-neutral-500">
              Histórico previo al contador: {shares.baseline.fichas} fichas distintas compartidas por{" "}
              {shares.baseline.brokers} brokers.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-5 shadow-soft backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

function Kpi({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-4 shadow-soft backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      {/* colored accent glow */}
      <span
        className="absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-[0.18] blur-2xl"
        style={{ background: dot }}
      />
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="text-xs text-neutral-500">{label}</span>
      </span>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
        {value}
      </div>
    </div>
  );
}
