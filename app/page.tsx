import Link from "next/link";
import { fetchInicio, type WeekMetric } from "@/lib/inicio";
import { fetchPulse } from "@/lib/pulse";
import { fetchServicios, type ServiceItem } from "@/lib/servicios";
import { fmtWhen } from "@/lib/eventos";
import { TopNav } from "@/components/TopNav";
import { LivePulse } from "@/components/LivePulse";
import { getRole } from "@/lib/session";
import { requireRole } from "@/lib/session";

// Always fetch fresh — this is an ops view, never cache it.
export const dynamic = "force-dynamic";

type Section = {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  dev?: boolean;
};

const S = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SECTIONS: Section[] = [
  {
    href: "/brokers",
    title: "Miembros",
    desc: "Toda la red: perfiles, inventario y bloqueos",
    icon: (
      <svg {...S}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/aprobaciones",
    title: "Aprobaciones",
    desc: "Cuentas nuevas esperando revisión y documentos",
    icon: (
      <svg {...S}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  {
    href: "/eventos",
    title: "Eventos",
    desc: "Todos los eventos, participantes y quién escaneó",
    icon: (
      <svg {...S}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/alta",
    title: "Rescate SMS",
    desc: "Códigos de rescate cuando no llega el SMS",
    icon: (
      <svg {...S}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" x2="19" y1="8" y2="14" />
        <line x1="22" x2="16" y1="11" y2="11" />
      </svg>
    ),
  },
  {
    href: "/en-vivo",
    title: "En vivo",
    desc: "Actividad de la red en tiempo real",
    icon: (
      <svg {...S}>
        <circle cx="12" cy="12" r="2" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
        <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
      </svg>
    ),
  },
  {
    href: "/panorama",
    title: "Panorama",
    desc: "Métricas y tendencias semanales",
    icon: (
      <svg {...S}>
        <line x1="12" x2="12" y1="20" y2="10" />
        <line x1="18" x2="18" y1="20" y2="4" />
        <line x1="6" x2="6" y1="20" y2="16" />
      </svg>
    ),
  },
  {
    href: "/reportes",
    title: "Reportes",
    desc: "Contenido reportado por la comunidad",
    icon: (
      <svg {...S}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" x2="4" y1="22" y2="15" />
      </svg>
    ),
  },
  {
    href: "/salidas",
    title: "Salidas",
    desc: "Por qué se retiran propiedades y búsquedas",
    icon: (
      <svg {...S}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" x2="9" y1="12" y2="12" />
      </svg>
    ),
  },
  {
    href: "/whatsapp",
    title: "WhatsApp",
    desc: "Bot de captura y grupos monitoreados",
    dev: true,
    icon: (
      <svg {...S}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      </svg>
    ),
  },
  {
    href: "/almacenamiento",
    title: "Almacenamiento",
    desc: "Uso de R2 y limpieza de archivos",
    dev: true,
    icon: (
      <svg {...S}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    href: "/lifecycle",
    title: "Ciclo de vida",
    desc: "Renovaciones, archivado y purgas",
    dev: true,
    icon: (
      <svg {...S}>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
  },
];

const LEVEL_DOT: Record<ServiceItem["level"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-rose-500",
  unknown: "bg-neutral-300",
};

// The money and capacity behind the network — Twilio credit for OTPs, Claude
// spend for the cerebro, database size. Levels turn amber/red on thresholds
// set in lib/servicios.ts.
function ServiciosStrip({ items }: { items: ServiceItem[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-900">Servicios</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((it) => {
          const inner = (
            <>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[it.level]}`} />
                {it.label}
              </div>
              <div className={`mt-1.5 text-lg font-semibold tabular-nums ${it.level === "down" ? "text-rose-700" : it.level === "warn" ? "text-amber-700" : it.level === "unknown" ? "text-neutral-400" : "text-neutral-900"}`}>
                {it.value}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">{it.detail}</div>
            </>
          );
          const cls = "block rounded-2xl border border-black/[0.05] bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift";
          return it.href ? (
            <a key={it.key} href={it.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
          ) : (
            <div key={it.key} className={cls}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

function Delta7({ m }: { m: WeekMetric }) {
  const diff = m.now - m.prev;
  const pct = m.prev > 0 ? Math.round((diff / m.prev) * 100) : null;
  const tone = diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-neutral-400";
  const body = (
    <>
      <div className="text-xs text-neutral-500">{m.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-neutral-900">{m.now}</span>
        <span className={`text-xs font-medium tabular-nums ${tone}`} title="Contra los 7 días anteriores">
          {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {pct != null ? `${Math.abs(pct)}%` : diff === 0 ? "" : "nuevo"}
        </span>
      </div>
      <div className="text-[11px] text-neutral-400">7 días antes: {m.prev}</div>
    </>
  );
  const cls = "block rounded-2xl border border-black/[0.05] bg-white p-4 shadow-soft";
  return m.href ? <Link href={m.href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-lift`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-1">
      <div className="text-xl font-semibold tabular-nums text-neutral-900">
        {value.toLocaleString("es-MX")}
      </div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

export default async function InicioPage() {
  await requireRole("admin");
  const role = await getRole();
  const isDev = role === "dev";

  let data;
  let pulse;
  let servicios: ServiceItem[] = [];
  try {
    [data, pulse, servicios] = await Promise.all([fetchInicio(), fetchPulse(), fetchServicios()]);
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="inicio" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {e instanceof Error ? e.message : "Error desconocido."}
          </p>
        </main>
      </div>
    );
  }

  const rawToday = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // Only the first letter — CSS capitalize would title-case the "de" too.
  const today = rawToday.charAt(0).toUpperCase() + rawToday.slice(1);

  return (
    <div className="min-h-screen">
      <TopNav active="inicio" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Inicio
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{today}</p>
        </div>

        {/* LIVE operations — polls /api/pulse every 20 s, seeded server-side
            so the dashboard never shows a loading state. */}
        <LivePulse initial={pulse} />

        {/* Today's events + what needs a hand — only rendered when there is
            something to show, so a quiet day stays quiet. */}
        {data.eventsToday.length > 0 || data.tomorrowRegistrations > 0 || data.receiptsWaiting > 0 || data.emptyUpcoming.length > 0 ? (
          <section className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.eventsToday.length > 0 || data.tomorrowRegistrations > 0 ? (
              <div className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900">Eventos de hoy</h2>
                  <Link href="/eventos" className="text-xs font-medium text-brand hover:underline">Ver todos</Link>
                </div>
                {data.eventsToday.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-500">Hoy no hay eventos.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-black/[0.04]">
                    {data.eventsToday.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <Link href={`/eventos/${e.id}`} className="min-w-0 flex-1 hover:text-brand">
                          <span className="block truncate text-sm font-medium text-neutral-900">{e.title}</span>
                          <span className="block text-xs text-neutral-500">
                            {fmtWhen(e.start_at, e.end_at)}
                            {e.visibility === "private" ? " · privado" : ""}
                          </span>
                        </Link>
                        <span className="shrink-0 text-sm tabular-nums">
                          <span className="font-semibold text-emerald-700">{e.attended}</span>
                          <span className="text-neutral-400"> / {e.registered} inscritos</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.tomorrowRegistrations > 0 ? (
                  <p className="mt-3 text-xs text-neutral-500">Mañana: {data.tomorrowRegistrations} inscritos en total.</p>
                ) : null}
              </div>
            ) : null}
            {data.receiptsWaiting > 0 || data.emptyUpcoming.length > 0 ? (
              <div className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
                <h2 className="text-sm font-semibold text-neutral-900">Necesita una mano</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.receiptsWaiting > 0 ? (
                    <li className="flex items-center gap-2 text-neutral-800">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      {data.receiptsWaiting === 1 ? "1 comprobante de pago espera aprobación del organizador" : `${data.receiptsWaiting} comprobantes de pago esperan aprobación de sus organizadores`}
                    </li>
                  ) : null}
                  {data.emptyUpcoming.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-neutral-800">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300" />
                      <Link href={`/eventos/${e.id}`} className="min-w-0 truncate hover:text-brand">«{e.title}»</Link>
                      <span className="shrink-0 text-xs text-neutral-500">{fmtWhen(e.start_at, null)} · sin inscritos</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900">Últimos 7 días</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.week.map((m) => <Delta7 key={m.label} m={m} />)}
          </div>
        </section>

        <ServiciosStrip items={servicios} />

        {/* standing totals of the whole network */}
        <section className="mt-8 grid grid-cols-2 gap-3 rounded-2xl border border-black/[0.05] bg-white/70 p-4 shadow-soft sm:grid-cols-4">
          <Total label="Miembros" value={data.miembros} />
          <Total label="Propiedades" value={data.propiedades} />
          <Total label="Requerimientos" value={data.requerimientos} />
          <Total label="Eventos próximos" value={data.eventosProximos} />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900">Secciones</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.filter((s) => !s.dev || isDev).map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-center gap-3.5 rounded-2xl border border-black/[0.05] bg-white p-4 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600 ring-1 ring-black/[0.04] transition group-hover:bg-[#e8edff] group-hover:text-[#1c4588]">
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">
                    {s.title}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {s.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
