import Link from "next/link";
import { notFound } from "next/navigation";
import { ParticipantsTable } from "@/components/ParticipantsTable";
import { requireRole } from "@/lib/session";
import {
  ATTENDEE_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  MODALITY_LABEL,
  fetchEventDetail,
  fmtPhone,
  fmtWhen,
} from "@/lib/eventos";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.05]">
      <div className={`text-2xl font-semibold tabular-nums ${tone ?? "text-neutral-900"}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const ev = await fetchEventDetail(id);
  if (!ev) notFound();

  const c = ev.counts;
  const rate = c.registered > 0 ? Math.round((c.attended / c.registered) * 100) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/[0.05] bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/eventos" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Eventos
          </Link>
          <a
            href={`/api/export/evento?id=${ev.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-white px-3 py-1.5 text-sm font-medium text-brand shadow-sm transition hover:bg-brand-light"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel de participantes
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05] sm:flex-row">
          {ev.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.image_url} alt="" className="h-40 w-full shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06] sm:w-64" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                {EVENT_TYPE_LABEL[ev.type] ?? ev.type}
              </span>
              <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-500">{MODALITY_LABEL[ev.modality] ?? ev.modality}</span>
              {ev.visibility === "private" ? (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-600/10">Privado</span>
              ) : null}
              {ev.is_paid ? (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-600/10">
                  {ev.price != null ? `$${ev.price.toLocaleString("en-US")}` : "De pago"} · aprobación {ev.approval_mode === "manual" ? "manual" : "automática"}
                </span>
              ) : null}
              {ev.commission != null ? (
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-500">{ev.commission}% comisión</span>
              ) : null}
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">{ev.title}</h1>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-400">Cuándo</dt><dd className="text-neutral-800">{fmtWhen(ev.start_at, ev.end_at)}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-400">Dónde</dt><dd className="min-w-0 truncate text-neutral-800">{ev.modality === "online" ? "En línea" : [ev.location, ev.state].filter(Boolean).join(" · ") || "—"}</dd></div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-neutral-400">Organiza</dt>
                <dd className="min-w-0 truncate text-neutral-800">
                  {ev.organizer ? (
                    <Link href={`/broker/${ev.organizer.id}`} className="hover:text-brand hover:underline">{ev.organizer.name ?? "—"}</Link>
                  ) : "—"}
                  {ev.organizer?.company ? <span className="text-neutral-400"> · {ev.organizer.company}</span> : null}
                  {ev.organiser && ev.organiser !== ev.organizer?.name ? <span className="text-neutral-400"> · {ev.organiser}</span> : null}
                </dd>
              </div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-400">Contacto</dt><dd className="tabular-nums text-neutral-800">{fmtPhone(ev.phone) || "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-400">Capacidad</dt><dd className="text-neutral-800">{ev.capacity ?? "Sin límite"}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-neutral-400">Compartido</dt><dd className="text-neutral-800">{ev.share_links} {ev.share_links === 1 ? "enlace" : "enlaces"}</dd></div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="w-24 shrink-0 text-neutral-400">Staff</dt>
                <dd className="min-w-0 text-neutral-800">
                  {ev.staff.length === 0 ? "Solo el organizador" : ev.staff.map((s) => s.name ?? "—").join(", ")}
                </dd>
              </div>
            </dl>
            {ev.description ? <p className="mt-3 whitespace-pre-line text-sm text-neutral-600">{ev.description}</p> : null}
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Inscritos" value={c.registered} />
          <Stat label={rate != null ? `Asistieron · ${rate}%` : "Asistieron"} value={c.attended} tone="text-emerald-700" />
          <Stat label={ATTENDEE_STATUS_LABEL.confirmed} value={c.confirmed} tone="text-sky-700" />
          <Stat label={ATTENDEE_STATUS_LABEL.pending} value={c.pending} tone={c.pending ? "text-amber-700" : undefined} />
          <Stat label={ATTENDEE_STATUS_LABEL.waitlist} value={c.waitlist} />
          <Stat label={ATTENDEE_STATUS_LABEL.invited} value={c.invited} />
        </section>

        <ParticipantsTable participants={ev.participants} isPaid={ev.is_paid} />
      </main>
    </div>
  );
}
