import { fetchPanorama, type Panorama, type WeekPoint } from "@/lib/analytics";
import { fetchShareStats, type ShareDay, type ShareStats } from "@/lib/shares";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

const SERIES = [
  { key: "signups", label: "Altas", color: "#1c4588" },
  { key: "listings", label: "Propiedades", color: "#059669" },
  { key: "requerimientos", label: "Requerimientos", color: "#d97706" },
] as const;

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

  const { kpis, growth, activity, supplyDemand } = data;

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
          <Kpi label="Activos 7d" value={kpis.active7d} dot="#10b981" />
          <Kpi label="Propiedades" value={kpis.listings} dot="#059669" />
          <Kpi label="Requerimientos" value={kpis.requerimientos} dot="#d97706" />
          <Kpi label="Coincidencias" value={kpis.matches} dot="#7c3aed" />
          <Kpi label="Ofertas" value={kpis.offers} dot="#0e7490" />
        </section>

        {/* Growth */}
        <Card className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Crecimiento · últimas 8 semanas
            </h2>
            <div className="flex items-center gap-4">
              {SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <GrowthChart data={growth} />
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
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Demanda
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" /> Oferta
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
                  <span className="h-2 w-2 rounded-full" style={{ background: "#1c4588" }} />
                  Envíos
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
                  Aperturas
                </span>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Envíos hoy" value={shares.sends.today} dot="#1c4588" />
              <Kpi label="Envíos 7d" value={shares.sends.week} dot="#1c4588" />
              <Kpi label="Aperturas 7d" value={shares.opens.week} dot="#10b981" />
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

function GrowthChart({ data }: { data: WeekPoint[] }) {
  const W = 760;
  const H = 240;
  const padX = 12;
  const padTop = 16;
  const padBottom = 30;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const baseY = padTop + plotH;
  const groupW = plotW / data.length;
  const barW = 14;
  const stride = 18;
  const groupInset = (groupW - (barW * 2 + stride)) / 2;

  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.signups, d.listings, d.requerimientos]),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {/* baseline */}
      <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="#e5e7eb" strokeWidth="1" />
      {data.map((d, i) => {
        const gx = padX + i * groupW + groupInset;
        return (
          <g key={i}>
            {SERIES.map((s, j) => {
              const v = d[s.key];
              const h = (v / max) * plotH;
              const x = gx + j * stride;
              return (
                <g key={s.key}>
                  {v > 0 ? (
                    <rect
                      x={x}
                      y={baseY - h}
                      width={barW}
                      height={h}
                      rx={3}
                      fill={s.color}
                    />
                  ) : null}
                </g>
              );
            })}
            <text
              x={padX + i * groupW + groupW / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize="11"
              fill="#9ca3af"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SharesChart({ data }: { data: ShareDay[] }) {
  const W = 760;
  const H = 200;
  const padX = 12;
  const padTop = 16;
  const padBottom = 26;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const baseY = padTop + plotH;
  const groupW = plotW / data.length;
  const barW = 10;
  const stride = 13;
  const groupInset = (groupW - (barW * 2 + stride)) / 2;
  const max = Math.max(1, ...data.flatMap((d) => [d.sends, d.opens]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="#e5e7eb" strokeWidth="1" />
      {data.map((d, i) => {
        const gx = padX + i * groupW + groupInset;
        return (
          <g key={d.day}>
            {[
              { v: d.sends, color: "#1c4588" },
              { v: d.opens, color: "#10b981" },
            ].map((s, j) =>
              s.v > 0 ? (
                <rect
                  key={j}
                  x={gx + j * stride}
                  y={baseY - (s.v / max) * plotH}
                  width={barW}
                  height={(s.v / max) * plotH}
                  rx={3}
                  fill={s.color}
                />
              ) : null,
            )}
            <text
              x={padX + i * groupW + groupW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#9ca3af"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ActivityBar({ activity }: { activity: Panorama["activity"] }) {
  const segs = [
    { label: "Activos (7d)", value: activity.active7d, color: "#10b981" },
    { label: "Activos (8–30d)", value: activity.active8to30, color: "#1c4588" },
    { label: "Inactivos (>30d)", value: activity.dormant, color: "#d97706" },
    { label: "Nunca", value: activity.never, color: "#e5e7eb" },
  ];
  const total = activity.total || 1;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
        {segs.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              className="h-full"
            />
          ) : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <dt className="text-sm text-neutral-500">{s.label}</dt>
            <dd className="ml-auto text-sm font-semibold tabular-nums text-neutral-900">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SupplyDemand({ rows }: { rows: Panorama["supplyDemand"] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Sin datos todavía.</p>;
  }
  const max = Math.max(1, ...rows.flatMap((r) => [r.supply, r.demand]));

  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const gap = r.demand > 0 && r.supply === 0;
        return (
          <div key={r.state} className="flex items-center gap-3">
            {/* demand — grows left */}
            <div className="flex flex-1 items-center justify-end gap-2">
              <span className="w-4 text-right text-xs tabular-nums text-neutral-400">
                {r.demand || ""}
              </span>
              <div
                className="h-2.5 rounded-full bg-amber-500"
                style={{ width: `${(r.demand / max) * 100}%` }}
              />
            </div>
            {/* state */}
            <div className="w-20 shrink-0 truncate text-center text-xs font-medium text-neutral-700 sm:w-28">
              {r.state}
            </div>
            {/* supply — grows right */}
            <div className="flex flex-1 items-center gap-2">
              <div
                className="h-2.5 rounded-full bg-emerald-600"
                style={{ width: `${(r.supply / max) * 100}%` }}
              />
              <span className="w-4 text-xs tabular-nums text-neutral-400">
                {r.supply || ""}
              </span>
              {gap ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
                  sin oferta
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
