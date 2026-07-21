import Link from "next/link";
import { fetchStorage, humanBytes, type StorageData } from "@/lib/storage";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AlmacenamientoPage() {
  await requireRole("dev"); // técnico only

  let data: StorageData;
  try {
    data = await fetchStorage();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="almacenamiento" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
          <p className="mt-4 text-sm text-neutral-500">
            Configura R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET.
          </p>
        </main>
      </div>
    );
  }

  const { rows, totals } = data;
  const maxBytes = Math.max(1, ...rows.map((r) => r.bytes));

  return (
    <div className="min-h-screen">
      <TopNav active="almacenamiento" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Almacenamiento
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Uso de R2 por broker (fotos de propiedades y del bot).
          </p>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Total" value={humanBytes(totals.bytes)} dot="#1c4588" />
          <Kpi label="Objetos" value={totals.objects.toLocaleString("en-US")} dot="#059669" />
          <Kpi label="Brokers con fotos" value={String(totals.brokers)} dot="#7c3aed" />
          <Kpi label="Carpetas" value={String(totals.folders)} dot="#d97706" />
        </section>

        <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white/90 shadow-soft backdrop-blur-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Carpeta</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 text-right font-medium">Objetos</th>
                <th className="px-4 py-3 font-medium">Uso</th>
                <th className="px-4 py-3 text-right font-medium">Tamaño</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.prefix} className="hover:bg-neutral-50/70">
                  <td className="px-4 py-3">
                    {r.brokerId ? (
                      <Link href={`/broker/${r.brokerId}`} className="font-medium text-neutral-900 hover:text-brand">
                        {r.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-neutral-900">{r.label}</span>
                    )}
                    <div className="font-mono text-[11px] text-neutral-400">{r.prefix}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        r.isBroker
                          ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                          : "bg-neutral-100 text-neutral-600 ring-neutral-200"
                      }`}
                    >
                      {r.isBroker ? "Broker" : "Sistema"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{r.objects}</td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100 sm:w-40">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(r.bytes / maxBytes) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-800">
                    {humanBytes(r.bytes)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-neutral-400">
                    El bucket está vacío.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value, dot }: { label: string; value: string; dot: string }) {
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
