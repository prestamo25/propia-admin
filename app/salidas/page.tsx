import Link from "next/link";
import { fetchSalidas, REASON_META, type ExitReason, type SalidasData } from "@/lib/salidas";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const TONE_PILL: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/10",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-500/10",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
  });

export default async function SalidasPage() {
  await requireRole("admin");

  let data: SalidasData;
  try {
    data = await fetchSalidas();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="salidas" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  const { rows, counts, total } = data;
  const winRate = total > 0 ? Math.round((counts.sold_via_propia / total) * 100) : 0;
  const order: ExitReason[] = [
    "sold_via_propia",
    "sold_outside",
    "promotion_ended",
    "created_by_error",
  ];

  return (
    <div className="min-h-screen">
      <TopNav active="salidas" />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Salidas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Por qué se eliminan los requerimientos — cada baja responde una encuesta antes de
            borrarse. «Por conexión de Propia» es el marcador de la red.
          </p>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {order.map((r) => {
            const meta = REASON_META[r];
            const win = r === "sold_via_propia";
            return (
              <div
                key={r}
                title={meta.long}
                className={`rounded-2xl border p-4 ${
                  win
                    ? "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white"
                    : "border-black/[0.05] bg-white"
                }`}
              >
                <div
                  className={`text-3xl font-semibold tabular-nums ${
                    win ? "text-emerald-600" : counts[r] > 0 ? "text-neutral-900" : "text-neutral-300"
                  }`}
                >
                  {counts[r]}
                </div>
                <div className="mt-1 text-xs font-medium text-neutral-500">{meta.label}</div>
                {win && total > 0 ? (
                  <div className="mt-1 text-[11px] text-emerald-600">{winRate}% de las salidas</div>
                ) : null}
              </div>
            );
          })}
        </section>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-black/[0.05] bg-white p-10 text-center text-sm text-neutral-500">
            Aún no hay salidas registradas. Aparecerán aquí cuando un broker elimine un
            requerimiento.
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Broker</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Ficha</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Vivió</th>
                  <th className="px-4 py-3 font-medium">Razón</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = REASON_META[r.reason];
                  return (
                    <tr key={r.id} className="border-b border-neutral-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-500">
                        {fmtDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/broker/${r.broker_id}`}
                          className="font-medium text-neutral-900 hover:underline"
                        >
                          {r.broker_name ?? "—"}
                        </Link>
                        <div className="text-xs text-neutral-400 sm:hidden">{r.summary}</div>
                      </td>
                      <td className="hidden px-4 py-3 text-neutral-600 sm:table-cell">
                        <span className="mr-2 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">
                          {r.kind === "request" ? "Requerimiento" : "Propiedad"}
                        </span>
                        {r.summary}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-neutral-500 md:table-cell">
                        {r.lived_days != null ? `${r.lived_days} d` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={meta.long}
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE_PILL[meta.tone]}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
