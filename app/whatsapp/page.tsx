import { CAPTURES_PAGE, fetchBotMonitor, type BotMonitor } from "@/lib/bot";
import { TopNav } from "@/components/TopNav";
import { CapturesList } from "@/components/CapturesList";
import { requireRole } from "@/lib/session";
import { relative } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY = 86400000;

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; n?: string }>;
}) {
  await requireRole("dev"); // técnico only
  const sp = await searchParams;
  const region = sp.region?.trim() || null;
  // ?n= grows by CAPTURES_PAGE with «Mostrar más»; capped by the SQL at 2,000.
  const n = Math.max(CAPTURES_PAGE, Math.min(2000, Number(sp.n) || CAPTURES_PAGE));

  let data: BotMonitor;
  try {
    data = await fetchBotMonitor(region, n);
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="whatsapp" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  const { captures, byRegion, kpis, lastCapturedAt, matching } = data;
  // Server component on a force-dynamic route: freshness is measured at
  // request time, so reading the clock during render is the point. The purity
  // rule is written for client components and flags this legitimately-impure
  // read as if it could re-render.
  // eslint-disable-next-line react-hooks/purity
  const ageMs = lastCapturedAt ? Date.now() - new Date(lastCapturedAt).getTime() : null;
  const stale = ageMs == null || ageMs > DAY;
  const lastLabel = relative(lastCapturedAt).label;
  const maxRegion = Math.max(1, ...byRegion.map((r) => r.total));

  return (
    <div className="min-h-screen">
      <TopNav active="whatsapp" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            WhatsApp · Bot
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Capturas del bot por estado y cuántas reclamaron los brokers.
          </p>
        </div>

        {/* liveness banner */}
        <div
          className={`mb-6 flex items-center gap-3 rounded-2xl border px-4 py-3 ${
            stale ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              stale ? "bg-amber-100" : "bg-emerald-100"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
          </span>
          <div>
            <p className={`text-sm font-medium ${stale ? "text-amber-800" : "text-emerald-800"}`}>
              {lastCapturedAt
                ? stale
                  ? `El bot no captura desde hace ${lastLabel.toLowerCase()} — ¿está corriendo?`
                  : `Activo · última captura ${lastLabel.toLowerCase()}`
                : "El bot aún no ha capturado nada."}
            </p>
            <p className="text-xs text-neutral-500">
              La liveness se infiere de la última captura (el bot no manda heartbeat todavía).
            </p>
          </div>
        </div>

        {/* KPIs */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Capturas" value={kpis.total} dot="#1c4588" />
          <Kpi label="Hoy" value={kpis.today} dot="#d97706" />
          <Kpi label="Estados" value={kpis.states} dot="#7c3aed" />
          <Kpi label="Reclamadas" value={kpis.claimed} dot="#059669" />
          <Kpi label="Ofertas" value={kpis.oferta} dot="#10b981" />
          <Kpi label="Demandas" value={kpis.demanda} dot="#0e7490" />
        </section>

        {/* by region */}
        <section className="mb-8 rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-5 shadow-soft backdrop-blur-sm">
          <h2 className="mb-4 text-base font-semibold tracking-tight text-neutral-900">
            Capturas por estado
          </h2>
          <div className="space-y-1">
            {byRegion.map((r) => (
              <div key={r.region} className="flex items-center gap-3 py-1">
                <div className="w-24 shrink-0 truncate text-sm font-medium text-neutral-700">
                  {r.region}
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${(r.total / maxRegion) * 100}%` }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-800">
                  {r.total.toLocaleString("es-MX")}
                </div>
                <div className="hidden w-24 shrink-0 text-right text-xs text-neutral-400 sm:block">
                  {r.claimed} reclam.
                </div>
                <div className="hidden w-20 shrink-0 text-right text-xs text-neutral-400 sm:block">
                  {relative(r.lastCapturedAt).label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <h2 className="mb-4 text-base font-semibold tracking-tight text-neutral-900">
          Capturas recientes
          <span className="ml-2 text-sm font-normal tabular-nums text-neutral-400">
            {captures.length.toLocaleString("en-US")} de {matching.toLocaleString("en-US")}
            {region ? ` · ${region}` : ""}
          </span>
        </h2>
        <CapturesList
          captures={captures}
          regions={byRegion}
          total={kpis.total}
          region={region}
          matching={matching}
        />
      </main>
    </div>
  );
}

function Kpi({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-4 shadow-soft backdrop-blur-sm">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="text-xs text-neutral-500">{label}</span>
      </span>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
        {value.toLocaleString("es-MX")}
      </div>
    </div>
  );
}
