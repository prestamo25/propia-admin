import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchMemberDossier, type Person } from "@/lib/miembro";
import type { Listing } from "@/lib/data";
import { BlockButton } from "@/components/BlockButton";
import { avatarColors, fmtDate, initials, relative } from "@/lib/format";
import { profileDetails, profileTypeLabel, tierOf } from "@/lib/profileTypes";
import { ATTENDEE_STATUS_LABEL, fmtStamp, fmtWhen } from "@/lib/eventos";

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

const REQ_STATUS: Record<string, string> = { open: "Abierto", closed: "Cerrado", paused: "Pausado" };

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  return p.startsWith("52") && p.length === 12 ? `+52 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : `+${p}`;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 truncate text-neutral-800">{children}</dd>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.05]">
      <div className={`text-2xl font-semibold tabular-nums ${value === 0 ? "text-neutral-300" : (tone ?? "text-neutral-900")}`}>{value}</div>
      <div className="text-xs text-neutral-500">
        {label}
        {sub ? <span className="text-neutral-400"> · {sub}</span> : null}
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
        {count != null ? <span className="text-sm tabular-nums text-neutral-400">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

function PersonRow({ p, right }: { p: Person; right?: ReactNode }) {
  const c = avatarColors(p.id);
  const tier = tierOf(p.profile_type);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Link href={`/broker/${p.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.fg }}>
            {initials(p.name)}
          </span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-neutral-900 group-hover:text-brand">{p.name ?? "—"}</span>
            {tier !== "asesor" ? (
              <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                {profileTypeLabel(p.profile_type)}
              </span>
            ) : null}
          </span>
          {p.company ? <span className="block truncate text-xs text-neutral-400">{p.company}</span> : null}
        </span>
      </Link>
      <span className="shrink-0 text-xs text-neutral-400">{right ?? (p.since ? fmtDate(p.since) : null)}</span>
    </li>
  );
}

function ListingCard({ l }: { l: Listing }) {
  return (
    <li className="flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/[0.05]">
      {l.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={l.thumb_url} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]" />
      ) : (
        <span className="grid h-16 w-20 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
            <path d="M3 9.5 12 3l9 6.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-neutral-900">{l.name ?? TYPE_LABELS[l.type ?? ""] ?? "Propiedad"}</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {[TYPE_LABELS[l.type ?? ""] ?? l.type, l.transaction === "renta" ? "Renta" : l.transaction === "venta" ? "Venta" : l.transaction, l.state]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-neutral-900">{money(l.price, l.currency)}</span>
          <span className="text-[11px] text-neutral-400">
            {l.source === "whatsapp" ? "Público · " : ""}
            {fmtDate(l.created_at)}
          </span>
        </div>
      </div>
    </li>
  );
}

export default async function BrokerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await fetchMemberDossier(id);
  if (!d) notFound();
  const { broker } = d;
  const c = avatarColors(broker.name);
  const act = relative(broker.last_active);
  const s = STATUS[broker.status ?? ""] ?? { label: broker.status ?? "—", cls: "bg-neutral-100 text-neutral-600 ring-neutral-200" };
  const tier = tierOf(d.profile_type);
  const details = profileDetails(d.profile_type, d.profile_data);
  const mod = d.moderation;
  const hasModeration = mod.reportsMade + mod.reportsReceived + mod.blocksMade + mod.blockedBy > 0;
  const upcomingAttended = d.eventsAttended.filter((e) => e.status !== "attended" && e.upcoming);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/brokers" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Miembros
          </Link>
          <a href="/api/logout" className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-white hover:text-neutral-800">
            Salir
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Identity */}
        <div className="mb-6 rounded-2xl border border-black/[0.05] bg-gradient-to-b from-white to-neutral-50/40 p-6 shadow-soft backdrop-blur-sm">
          <div className="flex flex-wrap items-start gap-5">
            {broker.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={broker.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-black/[0.06]" />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-semibold" style={{ background: c.bg, color: c.fg }}>
                {initials(broker.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{broker.name ?? "—"}</h1>
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${tier === "asesor" ? "bg-neutral-100 text-neutral-500 ring-neutral-500/10" : "bg-indigo-50 text-indigo-700 ring-indigo-600/10"}`}>
                  {profileTypeLabel(d.profile_type)}
                  {d.profile_type === "otros" && details.find((x) => x.key === "giro") ? ` · ${details.find((x) => x.key === "giro")!.value}` : ""}
                </span>
                {broker.blocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Bloqueado
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.cls}`}>{s.label}</span>
                )}
              </div>
              {broker.company ? <p className="mt-0.5 text-sm text-neutral-500">{broker.company}</p> : null}
              {d.bio ? <p className="mt-2 max-w-2xl text-sm text-neutral-600">{d.bio}</p> : null}

              <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                <Meta label="Teléfono">
                  {broker.phone ? (
                    <a href={`https://wa.me/${broker.phone.startsWith("52") && broker.phone.length === 12 ? `521${broker.phone.slice(2)}` : broker.phone}`} target="_blank" rel="noreferrer" className="tabular-nums text-brand hover:underline">
                      {fmtPhone(broker.phone)}
                    </a>
                  ) : "—"}
                  {d.whatsapp_opt_in ? <span className="ml-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">acepta WhatsApp</span> : null}
                </Meta>
                <Meta label="Email">{d.email ? <a href={`mailto:${d.email}`} title={d.email} className="text-neutral-800 hover:text-brand">{d.email}</a> : "—"}</Meta>
                <Meta label="Estados">{broker.states.length ? broker.states.join(", ") : "—"}</Meta>
                <Meta label="Zonas">{d.zonas.length ? d.zonas.join(", ") : "—"}</Meta>
                <Meta label="Miembro desde">{fmtDate(broker.created_at)}</Meta>
                <Meta label="Última actividad">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${act.fresh ? "bg-emerald-500" : "bg-neutral-300"}`} />
                    {act.label}
                  </span>
                </Meta>
                <Meta label="Último inicio de sesión">{d.last_sign_in_at ? fmtStamp(d.last_sign_in_at) : "—"}</Meta>
                <Meta label="App">{d.platforms.length ? d.platforms.map((p) => (p === "ios" ? "iPhone" : p === "android" ? "Android" : p)).join(" y ") : "Sin notificaciones registradas"}</Meta>
                {d.instagram ? (
                  <Meta label="Instagram">
                    <a href={`https://instagram.com/${d.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">@{d.instagram.replace(/^@/, "")}</a>
                  </Meta>
                ) : null}
                {d.facebook ? (
                  <Meta label="Facebook">
                    <a href={d.facebook.startsWith("http") ? d.facebook : `https://facebook.com/${d.facebook}`} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">{d.facebook}</a>
                  </Meta>
                ) : null}
                {details.filter((x) => !(d.profile_type === "otros" && x.key === "giro")).map((x) => (
                  <Meta key={x.key} label={x.label}>
                    {x.href ? <a href={x.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">{x.value}</a> : x.value}
                  </Meta>
                ))}
              </dl>
            </div>
            <div className="shrink-0">
              <BlockButton id={broker.id} name={broker.name} blocked={broker.blocked} size="md" />
            </div>
          </div>
        </div>

        {/* Numbers */}
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Inventario" value={d.counts.inventory} />
          <Stat label="Requerimientos" value={d.counts.requests} sub="abiertos" />
          <Stat label="Contactos" value={d.counts.contacts} />
          <Stat label="Eventos" value={d.counts.events_attended} sub="asistidos" tone="text-emerald-700" />
          <Stat label="Fichas enviadas" value={d.counts.sends} />
          <Stat label="Aperturas" value={d.counts.opens} sub="de sus fichas" />
        </section>

        {/* Inventory */}
        <Section title="Inventario" count={broker.listings.length}>
          {broker.listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 py-10 text-center text-sm text-neutral-400">Sin propiedades publicadas.</div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {broker.listings.map((l) => <ListingCard key={l.id} l={l} />)}
            </ul>
          )}
        </Section>

        {d.requests.length > 0 ? (
          <Section title="Requerimientos" count={d.requests.length}>
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                    <th className="px-4 py-2.5 font-medium">Cliente / título</th>
                    <th className="px-4 py-2.5 font-medium">Busca</th>
                    <th className="px-4 py-2.5 font-medium">Dónde</th>
                    <th className="px-4 py-2.5 text-right font-medium">Presupuesto</th>
                    <th className="px-4 py-2.5 font-medium">Estatus</th>
                    <th className="px-4 py-2.5 font-medium">Creado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {d.requests.map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-[14rem] truncate px-4 py-2.5 font-medium text-neutral-900">
                        {r.title ?? "—"}
                        {r.visibility === "private" ? <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Privado</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700">
                        {[r.transaction === "renta" ? "Renta" : r.transaction === "venta" ? "Venta" : r.transaction, r.types.map((t) => TYPE_LABELS[t] ?? t).join("/")].filter(Boolean).join(" · ")}
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-2.5 text-neutral-600">{r.zona ?? r.states.join(", ") ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-neutral-800">
                        {r.price_max != null ? `hasta $${r.price_max.toLocaleString("en-US")}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${r.status === "open" ? "bg-sky-50 text-sky-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {REQ_STATUS[r.status ?? ""] ?? r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        {d.eventsOrganized.length > 0 || d.eventsAttended.length > 0 ? (
          <Section title="Eventos">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
                <div className="border-b border-black/[0.05] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Organizó · {d.eventsOrganized.length}
                </div>
                {d.eventsOrganized.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-neutral-400">Ninguno.</p>
                ) : (
                  <ul className="divide-y divide-black/[0.04]">
                    {d.eventsOrganized.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Link href={`/eventos/${e.id}`} className="min-w-0 flex-1 hover:text-brand">
                          <span className="block truncate text-sm font-medium text-neutral-900">{e.title}</span>
                          <span className="block text-xs text-neutral-500">
                            {fmtWhen(e.start_at, e.end_at)}
                            {e.visibility === "private" ? " · privado" : ""}
                          </span>
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                          <span className="font-semibold text-emerald-700">{e.attended}</span> / {e.registered}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
                <div className="border-b border-black/[0.05] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Se registró · {d.eventsAttended.length}
                  {upcomingAttended.length ? <span className="normal-case tracking-normal text-neutral-400"> · {upcomingAttended.length} próximos</span> : null}
                </div>
                {d.eventsAttended.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-neutral-400">Ninguno.</p>
                ) : (
                  <ul className="divide-y divide-black/[0.04]">
                    {d.eventsAttended.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Link href={`/eventos/${e.id}`} className="min-w-0 flex-1 hover:text-brand">
                          <span className="block truncate text-sm font-medium text-neutral-900">{e.title}</span>
                          <span className="block text-xs text-neutral-500">{fmtWhen(e.start_at, null)}</span>
                        </Link>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${e.status === "attended" ? "bg-emerald-50 text-emerald-700" : e.status === "confirmed" ? "bg-sky-50 text-sky-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {ATTENDEE_STATUS_LABEL[e.status] ?? e.status}
                          {e.checked_in_at ? ` · ${fmtStamp(e.checked_in_at)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        ) : null}

        {d.contacts.length > 0 || d.vinculos.length > 0 ? (
          <Section title="Red">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
                <div className="border-b border-black/[0.05] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-400">Contactos · {d.contacts.length}</div>
                {d.contacts.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-neutral-400">Sin contactos aceptados.</p>
                ) : (
                  <ul className="max-h-96 divide-y divide-black/[0.04] overflow-y-auto">{d.contacts.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
                )}
              </div>
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
                <div className="border-b border-black/[0.05] px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {tier === "servicios" ? "Asesores vinculados" : "Proveedores vinculados"} · {d.vinculos.length}
                </div>
                {d.vinculos.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-neutral-400">Sin vínculos.</p>
                ) : (
                  <ul className="max-h-96 divide-y divide-black/[0.04] overflow-y-auto">
                    {d.vinculos.map((p) => (
                      <PersonRow key={p.id} p={p} right={p.status === "accepted" ? (p.since ? fmtDate(p.since) : null) : <span className="text-amber-700">{p.status === "pending" ? "pendiente" : p.status}</span>} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        ) : null}

        {d.activity.length > 0 ? (
          <Section title="Actividad reciente" count={d.activity.length}>
            <ol className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
              {d.activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-center gap-3 border-b border-black/[0.04] px-4 py-2.5 last:border-0">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-neutral-400">{fmtStamp(a.at)}</span>
                  <span className="w-24 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{a.kind}</span>
                  {a.href ? (
                    <Link href={a.href} className="min-w-0 flex-1 truncate text-sm text-neutral-800 hover:text-brand">{a.label}</Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{a.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {hasModeration ? (
          <Section title="Moderación">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Reportes hechos" value={mod.reportsMade} />
              <Stat label="Reportes recibidos" value={mod.reportsReceived} tone="text-rose-700" />
              <Stat label="Bloqueó a" value={mod.blocksMade} />
              <Stat label="Bloqueado por" value={mod.blockedBy} tone="text-rose-700" />
            </div>
          </Section>
        ) : null}
      </main>
    </div>
  );
}
