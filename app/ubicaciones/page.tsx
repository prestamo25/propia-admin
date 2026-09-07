import Link from "next/link";
import { fetchGeoReview, REASON_LABEL, type GeoPoint, type GeoReviewRow } from "@/lib/geoReview";
import { TopNav } from "@/components/TopNav";
import { GeoReviewButtons } from "@/components/GeoReviewButtons";
import { requireRole } from "@/lib/session";
import { relative } from "@/lib/format";

export const dynamic = "force-dynamic";

// Where a location is described: colonia if we have it, else the address or
// the place the resolver named, plus how far from the broker's metro centre.
function describe(p: GeoPoint, colonia: string | null): string {
  const where = colonia ?? p.place ?? (p.lat != null ? "Punto en el mapa" : "Sin ubicación");
  const km = p.metro_km != null ? ` · a ${p.metro_km} km del centro` : "";
  const how =
    p.precision === "point" || (p.lat != null && !colonia && !p.precision)
      ? " · punto"
      : p.precision === "area" || colonia
        ? " · área"
        : p.precision === "municipio"
          ? " · municipio"
          : "";
  return `${where}${how}${km}`;
}

function Row({ r }: { r: GeoReviewRow }) {
  const hasSuggestion =
    r.suggested && (r.suggested.colonia_key || (r.suggested.lat != null && r.suggested.precision === "point"));
  const when = relative(r.created_at);
  return (
    <li className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutral-900">
            {r.name ?? (r.kind === "property" ? "Propiedad" : r.kind)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {r.owner_id && r.owner_name ? (
              <Link href={`/broker/${r.owner_id}`} className="text-blue-700 hover:underline">
                {r.owner_name}
              </Link>
            ) : (
              "Sin dueño"
            )}
            {" · "}
            {REASON_LABEL[r.reason] ?? r.reason}
            {" · "}
            <span className={when.fresh ? "text-emerald-700" : ""}>{when.label}</span>
          </p>
        </div>
        <GeoReviewButtons id={r.id} hasSuggestion={Boolean(hasSuggestion)} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-neutral-50 p-3">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Ahora</dt>
          <dd className="mt-1 text-sm text-neutral-800">{describe(r.current, r.current_colonia)}</dd>
          {r.current.address && (
            <dd className="mt-1 truncate text-xs text-neutral-500" title={r.current.address}>
              {r.current.address}
            </dd>
          )}
        </div>
        <div className="rounded-xl bg-blue-50/60 p-3">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-blue-700">Sugerida</dt>
          <dd className="mt-1 text-sm text-neutral-800">
            {hasSuggestion ? describe(r.suggested, r.suggested_colonia) : "Sin sugerencia: sólo decide si se queda"}
          </dd>
          {hasSuggestion && r.suggested.source && (
            <dd className="mt-1 text-xs text-neutral-500">
              vía {r.suggested.source === "google" ? "Google" : r.suggested.source === "inegi" ? "catálogo INEGI" : r.suggested.source === "alias" ? "zona editorial" : r.suggested.source}
            </dd>
          )}
        </div>
      </dl>
    </li>
  );
}

export default async function UbicacionesPage() {
  await requireRole("dev"); // técnico only for now — Pablo gets it once the queue proves itself

  let rows: GeoReviewRow[];
  try {
    rows = await fetchGeoReview();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="ubicaciones" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">{e instanceof Error ? e.message : "Error desconocido."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav active="ubicaciones" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ubicaciones dudosas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Lo que el resolver no se atrevió a decidir solo: puntos elegidos lejos de la zona metropolitana del asesor,
            colonias del catálogo que no coinciden, o propiedades cuya única respuesta queda lejos. Una decisión por
            fila; lo que aceptes se aplica al instante y el barrido no lo vuelve a levantar.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-black/[0.05] bg-white p-8 text-center text-sm text-neutral-500 shadow-soft">
            Nada pendiente. El barrido corre cada 10 minutos.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-neutral-500">{rows.length} pendiente{rows.length === 1 ? "" : "s"}</p>
            <ul className="space-y-4">
              {rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
