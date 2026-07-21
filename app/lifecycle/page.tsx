import Link from "next/link";
import {
  fetchLifecycle,
  GRAY_DAY,
  type LifeRow,
  type LifecycleData,
} from "@/lib/lifecycle";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LifecyclePage() {
  await requireRole("dev"); // técnico only

  let data: LifecycleData;
  try {
    data = await fetchLifecycle();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="lifecycle" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  const { counts, nextSweep, watch } = data;
  const pending = nextSweep.gray.length + nextSweep.archive.length + nextSweep.purge.length;

  return (
    <div className="min-h-screen">
      <TopNav active="lifecycle" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Ciclo de vida
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Caducidad automática: activa → gris ({GRAY_DAY}d) → archivo (37d) → purga (67d).
          </p>
        </div>

        {/* Próximo barrido — the de-risk preview */}
        <section className="mb-8 rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-5 shadow-soft backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Próximo barrido
            </h2>
            <span className="text-xs text-neutral-400">corre a diario · 09:00 UTC</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SweepStat label="→ Gris" value={nextSweep.gray.length} tone="amber" />
            <SweepStat label="→ Archivo (borra fotos)" value={nextSweep.archive.length} tone="orange" />
            <SweepStat label="→ Purga (elimina)" value={nextSweep.purge.length} tone="rose" />
          </div>
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              pending === 0
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {pending === 0 ? (
              <>
                <span className="font-medium">Sin cambios pendientes.</span> Activar el modo
                real ahora no tocaría ninguna propiedad —{" "}
                <code className="rounded bg-emerald-100 px-1 py-0.5 text-xs">LIFECYCLE_DRY_RUN=false</code>.
              </>
            ) : (
              <>
                <span className="font-medium">El próximo barrido en vivo afectaría {pending} propiedad(es).</span>{" "}
                Revisa las listas de abajo antes de activar el modo real.
              </>
            )}
          </div>
        </section>

        {/* distribution */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Activas" value={counts.active} dot="#10b981" />
          <Kpi label="Grises" value={counts.stale} dot="#d97706" />
          <Kpi label="Archivadas" value={counts.archived} dot="#9ca3af" />
          <Kpi label="Archivadas (manual)" value={counts.manual} dot="#1c4588" />
        </section>

        {nextSweep.gray.length > 0 ? (
          <RowList title="Se engrisarán" tone="amber" rows={nextSweep.gray} />
        ) : null}
        {nextSweep.archive.length > 0 ? (
          <RowList title="Se archivarán (fotos borradas)" tone="orange" rows={nextSweep.archive} />
        ) : null}
        {nextSweep.purge.length > 0 ? (
          <RowList title="Se purgarán (eliminadas)" tone="rose" rows={nextSweep.purge} />
        ) : null}

        <RowList title="Más cercanas a engrisar" tone="neutral" rows={watch} showCountdown />
      </main>
    </div>
  );
}

function SweepStat({ label, value, tone }: { label: string; value: number; tone: "amber" | "orange" | "rose" }) {
  const color =
    value === 0
      ? "text-neutral-300"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "orange"
          ? "text-orange-600"
          : "text-rose-600";
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
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
        {value}
      </div>
    </div>
  );
}

function RowList({
  title,
  rows,
  tone,
  showCountdown,
}: {
  title: string;
  rows: LifeRow[];
  tone: "amber" | "orange" | "rose" | "neutral";
  showCountdown?: boolean;
}) {
  const bar =
    tone === "amber" ? "bg-amber-400" : tone === "orange" ? "bg-orange-400" : tone === "rose" ? "bg-rose-400" : "bg-neutral-200";
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-base font-semibold tracking-tight text-neutral-900">
        {title} <span className="text-sm font-normal text-neutral-400">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 py-8 text-center text-sm text-neutral-400">
          Ninguna.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white/90 shadow-soft">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-neutral-50 px-4 py-3 last:border-0">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bar}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">
                  {r.name ?? "Sin nombre"}
                </div>
                {r.owner ? (
                  <Link href={`/broker/${r.brokerId}`} className="text-xs text-neutral-400 hover:text-brand">
                    {r.owner}
                  </Link>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm tabular-nums text-neutral-600">
                  {r.idleDays != null ? `${r.idleDays} d inactiva` : "—"}
                </div>
                {showCountdown && r.daysUntilGray != null ? (
                  <div className="text-xs text-neutral-400">gris en {r.daysUntilGray} d</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
