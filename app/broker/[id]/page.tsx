import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchBroker, type Listing } from "@/lib/data";
import { BlockButton } from "@/components/BlockButton";
import { avatarColors, fmtDate, initials, relative } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  casa: "Casa",
  departamento: "Depto",
  terreno: "Terreno",
  oficina: "Oficina",
  local: "Local",
  bodega: "Bodega",
  nave: "Nave",
};

function money(price: number | null, currency: string | null): string {
  if (price == null) return "—";
  return `$${price.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "Aprobado", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  rejected: { label: "Rechazado", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export default async function BrokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await fetchBroker(id);
  if (!broker) notFound();

  const c = avatarColors(broker.name);
  const act = relative(broker.last_active);
  const s = STATUS[broker.status ?? ""] ?? {
    label: broker.status ?? "—",
    cls: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Volver
          </Link>
          <a
            href="/api/logout"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800"
          >
            Salir
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Profile header */}
        <div className="mb-8 rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-6 shadow-soft backdrop-blur-sm">
          <div className="flex flex-wrap items-start gap-5">
            {broker.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={broker.avatar_url}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-black/[0.06]"
              />
            ) : (
              <span
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-semibold"
                style={{ background: c.bg, color: c.fg }}
              >
                {initials(broker.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                  {broker.name ?? "—"}
                </h1>
                {broker.blocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Bloqueado
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
                    {s.label}
                  </span>
                )}
              </div>
              {broker.company ? (
                <p className="mt-0.5 text-sm text-neutral-500">{broker.company}</p>
              ) : null}

              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Meta label="Teléfono">
                  <span className="font-mono text-neutral-700">{broker.phone ?? "—"}</span>
                </Meta>
                <Meta label="Estados">
                  {broker.states.length ? broker.states.join(", ") : "—"}
                </Meta>
                <Meta label="Miembro desde">{fmtDate(broker.created_at)}</Meta>
                <Meta label="Última actividad">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${act.fresh ? "bg-emerald-500" : "bg-neutral-300"}`} />
                    {act.label}
                  </span>
                </Meta>
              </dl>
            </div>

            <div className="shrink-0">
              <BlockButton id={broker.id} name={broker.name} blocked={broker.blocked} size="md" />
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div className="mb-4 flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Inventario</h2>
          <span className="text-sm tabular-nums text-neutral-400">{broker.listings.length}</span>
        </div>

        {broker.listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 py-16 text-center text-sm text-neutral-400">
            Este broker aún no tiene propiedades.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {broker.listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-neutral-700">{children}</dd>
    </div>
  );
}

function ListingCard({ listing: l }: { listing: Listing }) {
  const typeLabel = l.type ? (TYPE_LABELS[l.type] ?? l.type) : null;
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="relative aspect-[4/3] bg-neutral-100">
        {l.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.thumb_url} alt={l.name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-neutral-300">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {l.transaction === "renta" ? "Renta" : "Venta"}
        </span>
        {l.source === "whatsapp" ? (
          <span className="absolute right-2 top-2 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
            WhatsApp
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <div className="text-base font-semibold tracking-tight tabular-nums text-neutral-900">
          {money(l.price, l.currency)}
        </div>
        <div className="mt-0.5 truncate text-sm text-neutral-700">{l.name ?? "—"}</div>
        <div className="mt-1 truncate text-xs text-neutral-400">
          {[typeLabel, l.state].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
    </div>
  );
}
