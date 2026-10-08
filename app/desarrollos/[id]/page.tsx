import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { fmtPhone } from "@/lib/format";
import { fetchDevelopment, STAGE_LABEL, staleDays, type DevelopmentDetail } from "@/lib/desarrollos";

export const dynamic = "force-dynamic";

// One development (2026-10-07): photos, models, the board exactly as brokers
// see it, and the change log (who marked what, when) — the record a dispute
// will be settled with in fase B.

const money = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-MX")}`);
const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const STATUS_TXT: Record<string, string> = { available: "Disponible", held: "Apartado", sold: "Vendido" };
const CELL: Record<string, string> = {
  available: "bg-emerald-500 text-white",
  held: "bg-amber-400 text-amber-950",
  sold: "bg-neutral-300 text-neutral-700",
};
const waLink = (phone: string, text: string) =>
  `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;

function Board({ d }: { d: DevelopmentDetail }) {
  const vertical = d.row.kind === "vertical";
  const groups = [...new Set(d.units.map((u) => u.grp))];
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const us = d.units.filter((u) => u.grp === g);
        const levels = [...new Set(us.map((u) => u.level))].sort((a, b) => (vertical ? b - a : a - b));
        return (
          <div key={g}>
            {groups.length > 1 || !vertical ? (
              <div className="mb-1.5 text-xs font-semibold text-[#9A3412]">{vertical ? `Torre ${g}` : g}</div>
            ) : null}
            <div className="space-y-1">
              {levels.map((lv) => (
                <div key={lv} className="flex items-center gap-1">
                  {vertical ? <span className="w-14 shrink-0 text-[11px] tabular-nums text-neutral-400">Piso {lv}</span> : null}
                  {us
                    .filter((u) => u.level === lv)
                    .sort((a, b) => a.pos - b.pos)
                    .map((u) => (
                      <span
                        key={u.id}
                        title={`${u.label} · ${STATUS_TXT[u.status]} · ${money(u.price)}`}
                        className={`grid h-7 min-w-11 flex-1 place-items-center rounded-md px-1 text-[11px] font-medium tabular-nums ${CELL[u.status]}`}
                      >
                        {vertical ? u.label : u.label.replace("Lote ", "")}
                      </span>
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventLine({ e }: { e: DevelopmentDetail["events"][number] }) {
  let what: string;
  if (e.kind === "status") what = `${e.label}: ${STATUS_TXT[e.from ?? ""] ?? e.from} → ${STATUS_TXT[e.to ?? ""] ?? e.to}`;
  else if (!e.label) what = `Cambio de precios ${e.to?.startsWith("-") ? "" : "+"}${e.to} a las disponibles`;
  else what = `${e.label}: precio ${money(Number(e.from))} → ${money(Number(e.to))}`;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-neutral-100 py-2 text-sm last:border-0">
      <span className="text-neutral-800">{what}</span>
      <span className="text-xs text-neutral-500">
        {e.actor} · {fmtStamp(e.at)}
      </span>
    </li>
  );
}

export default async function DesarrolloPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const d = await fetchDevelopment(id);
  if (!d) notFound();
  const r = d.row;
  const stale = staleDays(r.availability_updated_at);
  const maps = r.located === "google" && d.lat != null ? `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}` : null;

  return (
    <div className="min-h-screen">
      <TopNav active="desarrollos" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/desarrollos" className="text-sm text-brand underline-offset-2 hover:underline">
          ← Desarrollos
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{r.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {r.kind === "horizontal" ? "Fraccionamiento" : "Torre"} · {STAGE_LABEL[r.stage]}
              {r.delivery_date ? ` · entrega ${new Date(r.delivery_date).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-neutral-500">
              {d.address ?? ([r.zona, r.city, r.state].filter(Boolean).join(", ") || "Sin ubicación")}
              {maps ? (
                <>
                  {" · "}
                  <a href={maps} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                    Ver en Google Maps ↗
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/[0.05] lg:w-72">
            <Link href={`/broker/${r.owner.id}`} className="font-medium text-neutral-900 underline-offset-2 hover:underline">
              {r.owner.name}
            </Link>
            {r.owner.phone ? (
              <a
                href={waLink(r.owner.phone, `Hola, te escribo de Propia por tu desarrollo ${r.name}.`)}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block tabular-nums text-brand underline-offset-2 hover:underline"
              >
                {fmtPhone(r.owner.phone)}
              </a>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-neutral-500">
              <span>Comisión</span>
              <span className="text-right text-neutral-800">{r.commission_pct != null ? `${r.commission_pct}%` : "—"}</span>
              <span>Registro de clientes</span>
              <span className="text-right text-neutral-800">{r.registration_days} días</span>
              <span>Disponibilidad</span>
              <span className={`text-right font-medium ${stale > 21 ? "text-rose-700" : stale > 7 ? "text-amber-700" : "text-emerald-700"}`}>
                {stale <= 0 ? "hoy" : stale === 1 ? "ayer" : `hace ${stale} días`}
              </span>
            </div>
          </div>
        </div>

        {d.photos.length || d.brochure_url ? (
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {d.photos.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" className="h-28 w-40 rounded-xl object-cover ring-1 ring-black/[0.06]" />
              </a>
            ))}
            {d.brochure_url ? (
              <a
                href={d.brochure_url}
                target="_blank"
                rel="noreferrer"
                className="grid h-28 w-40 shrink-0 place-items-center rounded-xl border border-brand/25 bg-white text-sm font-medium text-brand hover:bg-brand-light"
              >
                Brochure PDF ↗
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.05]">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-medium text-neutral-900">{r.kind === "horizontal" ? "Plano de lotes" : "Tablero"}</h2>
              <span className="text-xs tabular-nums text-neutral-500">
                {r.units.available} disponibles · {r.units.held} apartados · {r.units.sold} vendidos
              </span>
            </div>
            <Board d={d} />
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.05]">
            <h2 className="mb-2 font-medium text-neutral-900">Modelos</h2>
            <ul className="divide-y divide-neutral-100">
              {d.models.map((m) => (
                <li key={m.id} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-neutral-900">{m.name ?? m.code}</span>
                    <span className="text-xs tabular-nums text-emerald-700">
                      {m.available} de {m.units} libres
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {[
                      m.beds != null ? `${m.beds} rec` : null,
                      m.baths != null ? `${m.baths} baños` : null,
                      m.m2 ? `${m.m2} m²` : null,
                      m.terrain_m2 ? `terreno ${m.terrain_m2} m²` : null,
                      `base ${money(m.base_price)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {m.floor_plan_url ? (
                      <>
                        {" · "}
                        <a href={m.floor_plan_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                          plano ↗
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.05]">
          <h2 className="font-medium text-neutral-900">Historial de cambios</h2>
          <p className="text-xs text-neutral-500">Cada cambio de estado o precio, con quién lo hizo. Últimos 60.</p>
          {d.events.length ? (
            <ul className="mt-2">
              {d.events.map((e, i) => (
                <EventLine key={i} e={e} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Sin cambios todavía.</p>
          )}
        </section>
      </main>
    </div>
  );
}
