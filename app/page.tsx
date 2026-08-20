import Link from "next/link";
import { fetchInicio } from "@/lib/inicio";
import { fetchPulse } from "@/lib/pulse";
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
  try {
    [data, pulse] = await Promise.all([fetchInicio(), fetchPulse()]);
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
