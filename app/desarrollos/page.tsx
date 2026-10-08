import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { fmtPhone } from "@/lib/format";
import { fetchDevelopments, STAGE_LABEL, staleDays, type DevelopmentRow } from "@/lib/desarrollos";

export const dynamic = "force-dynamic";

// «Desarrollos» (2026-10-07, plan fase A): every constructora development in
// one list. What the team watches is FRESHNESS — the app shows brokers
// «Disponibilidad actualizada hace N días»; past 7 days this list tints amber,
// past 21 red (those get the reminder / demotion in fase B).

const money = (v: number | null) =>
  v == null ? "—" : `$${Math.round(v).toLocaleString("es-MX")}`;
const shortMoney = (v: number | null) =>
  v == null ? "—" : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)} M` : money(v);

const waLink = (phone: string, text: string) =>
  `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;

function freshness(iso: string) {
  const d = staleDays(iso);
  const label = d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
  const cls =
    d > 21 ? "bg-rose-50 text-rose-700 ring-rose-200" : d > 7 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return { d, label, cls };
}

const STATUS: Record<DevelopmentRow["status"], { label: string; cls: string }> = {
  published: { label: "Publicado", cls: "bg-brand-light text-brand ring-brand/20" },
  draft: { label: "Borrador", cls: "bg-neutral-100 text-neutral-600 ring-neutral-300" },
  archived: { label: "Archivado", cls: "bg-neutral-100 text-neutral-400 ring-neutral-200" },
};

const LOCATED: Record<DevelopmentRow["located"], string> = {
  zona: "Zona de Propia",
  google: "Google Maps",
  texto: "Texto sin verificar",
};

function Bar({ u }: { u: DevelopmentRow["units"] }) {
  const t = Math.max(u.total, 1);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100" title={`${u.available} disponibles · ${u.held} apartados · ${u.sold} vendidos`}>
      <div className="bg-emerald-500" style={{ width: `${(u.available / t) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(u.held / t) * 100}%` }} />
      <div className="bg-neutral-300" style={{ width: `${(u.sold / t) * 100}%` }} />
    </div>
  );
}

function Row({ d }: { d: DevelopmentRow }) {
  const f = freshness(d.availability_updated_at);
  const s = STATUS[d.status];
  const unit = d.kind === "horizontal" ? "lotes" : "deptos";
  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${d.status === "published" && f.d > 7 ? "ring-amber-300/60" : "ring-black/[0.05]"} ${d.status === "archived" ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <Link href={`/desarrollos/${d.id}`} className="flex min-w-0 items-center gap-4 lg:w-[22rem] lg:shrink-0">
          {d.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.cover} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]" />
          ) : (
            <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-[#9A3412] text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                {d.kind === "horizontal" ? <path d="M3 21h18M5 21V11l4-3 4 3v10M13 21v-7l4-3 4 3v7" /> : <path d="M4 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M16 9h3a1 1 0 0 1 1 1v11M8 8h4M8 12h4M8 16h4M3 21h18" />}
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium text-neutral-900 hover:underline">{d.name}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${s.cls}`}>{s.label}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-neutral-500">
              {d.kind === "horizontal" ? "Fraccionamiento" : "Torre"} · {STAGE_LABEL[d.stage]}
            </div>
            <div className="mt-0.5 truncate text-xs text-neutral-500">
              {[d.zona, d.state].filter(Boolean).join(", ") || "Sin ubicación"}
              <span className="text-neutral-400"> · {LOCATED[d.located]}</span>
            </div>
          </div>
        </Link>

        <div className="min-w-0 lg:w-56 lg:shrink-0">
          <Link href={`/broker/${d.owner.id}`} className="block truncate text-sm font-medium text-neutral-800 underline-offset-2 hover:underline">
            {d.owner.name}
            {d.owner.is_premium ? <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-semibold text-amber-800">Premium</span> : null}
          </Link>
          {d.owner.phone ? (
            <a
              href={waLink(d.owner.phone, `Hola, te escribo de Propia por tu desarrollo ${d.name}.`)}
              target="_blank"
              rel="noreferrer"
              className="text-xs tabular-nums text-brand underline-offset-2 hover:underline"
            >
              {fmtPhone(d.owner.phone)}
            </a>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <Bar u={d.units} />
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-neutral-500">
            <span>
              <b className="font-semibold text-emerald-700">{d.units.available}</b> de {d.units.total} {unit} disponibles
            </span>
            <span>{d.units.held} apartados</span>
            <span>{d.units.sold} vendidos</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-right text-xs text-neutral-500 lg:w-64 lg:justify-end">
          <div>
            <div className="text-sm font-medium tabular-nums text-neutral-900">
              {d.price_from == null ? "—" : `${shortMoney(d.price_from)} – ${shortMoney(d.price_to)}`}
            </div>
            <div>{d.commission_pct != null ? `Comisión ${d.commission_pct}%` : "Sin comisión"}</div>
          </div>
          <span className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${f.cls}`} title="Última vez que la constructora cambió la disponibilidad">
            {f.label}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-neutral-500">
        <span className={`rounded-md px-1.5 py-0.5 ring-1 ${d.photos ? "ring-neutral-200" : "bg-rose-50 text-rose-700 ring-rose-200"}`}>
          {d.photos ? `${d.photos} fotos` : "Sin fotos"}
        </span>
        <span className={`rounded-md px-1.5 py-0.5 ring-1 ${d.has_brochure ? "ring-neutral-200" : "ring-neutral-200 text-neutral-400"}`}>
          {d.has_brochure ? "Brochure" : "Sin brochure"}
        </span>
        <span className="rounded-md px-1.5 py-0.5 ring-1 ring-neutral-200">{d.models} modelos</span>
        <span className="rounded-md px-1.5 py-0.5 ring-1 ring-neutral-200">Registro {d.registration_days} días</span>
      </div>
    </li>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${tone === "warn" ? "ring-amber-300/60" : "ring-black/[0.05]"}`}>
      <div className={`text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-700" : "text-neutral-900"}`}>{value}</div>
      <div className="mt-0.5 text-sm text-neutral-500">{label}</div>
    </div>
  );
}

export default async function DesarrollosPage() {
  await requireRole("admin");

  let devs: DevelopmentRow[];
  try {
    devs = await fetchDevelopments();
  } catch (e) {
    return (
      <div className="min-h-screen">
        <TopNav active="desarrollos" />
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-rose-600">No se pudo cargar</h1>
          <p className="mt-2 text-sm text-neutral-600">{e instanceof Error ? e.message : "Error desconocido."}</p>
        </main>
      </div>
    );
  }

  const live = devs.filter((d) => d.status === "published");
  const units = live.reduce(
    (a, d) => ({ total: a.total + d.units.total, available: a.available + d.units.available, held: a.held + d.units.held, sold: a.sold + d.units.sold }),
    { total: 0, available: 0, held: 0, sold: 0 },
  );
  const stale = live.filter((d) => staleDays(d.availability_updated_at) > 7).length;
  const constructoras = new Set(devs.filter((d) => d.status !== "archived").map((d) => d.owner.id)).size;
  // Published first, freshest first; drafts after; archived last.
  const order = { published: 0, draft: 1, archived: 2 } as const;
  const sorted = [...devs].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="min-h-screen">
      <TopNav active="desarrollos" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Desarrollos</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Obra nueva de constructoras. Lo que más importa: que la disponibilidad esté al día.
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            Piloto · sólo cuentas de prueba lo ven en la app
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat value={live.length} label="Publicados" />
          <Stat value={constructoras} label="Constructoras" />
          <Stat value={units.available} label={`Disponibles de ${units.total}`} />
          <Stat value={`${units.held} / ${units.sold}`} label="Apartados / vendidos" />
          <Stat value={stale} label="Sin actualizar +7 días" tone={stale ? "warn" : undefined} />
        </div>

        {sorted.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-neutral-500 shadow-sm ring-1 ring-black/[0.05]">
            Aún no hay desarrollos.
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {sorted.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
