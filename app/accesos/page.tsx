import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { requireRole } from "@/lib/session";
import { fetchAccesos, type AccessEvent, type AccessRow } from "@/lib/accesos";
import { SECCION_OPTIONS } from "@/lib/accesoShared";
import { avatarColors, fmtDate, fmtPhone, initials, relative } from "@/lib/format";
import { fmtStamp } from "@/lib/eventos";

// «Accesos» (acceso regional, Franz + Pablo 2026-10-13): everyone outside the
// team who can open this panel, what they can see, and what they did — logins,
// failed PINs and every member page they opened. Access is given, changed and
// taken back from the member's own page («Acceso al panel»), so there is one
// place to act and this one to oversee. Admin + técnico only.
export const dynamic = "force-dynamic";

const seccionLabel = (k: string) => SECCION_OPTIONS.find((o) => o.key === k)?.label ?? k;

function eventLabel(e: AccessEvent): string {
  const d = e.detalle ?? {};
  const por = typeof d.por === "string" ? ` por ${d.por}` : "";
  switch (e.evento) {
    case "login":
      return d.primera ? "Entró por primera vez" : "Entró";
    case "login_fallido":
      return d.motivo === "pin" ? "PIN incorrecto" : "Intento sin acceso";
    case "bloqueado":
      return "Bloqueado 15 min por intentos fallidos";
    case "ver_miembro":
      return `Vio a ${typeof d.nombre === "string" && d.nombre ? d.nombre : "un miembro"}`;
    case "otorgado":
      return `Acceso otorgado${por}`;
    case "editado":
      return `Acceso cambiado${por}`;
    case "renovado":
      return `Renovado ${typeof d.dias === "number" ? `${d.dias} días ` : ""}${por}`.trim();
    case "revocado":
      return `Acceso retirado${por}`;
  }
}

function Person({ a }: { a: AccessRow }) {
  const c = avatarColors(a.nombre);
  return (
    <Link href={`/broker/${a.user_id}#acceso`} className="group flex min-w-0 items-center gap-3">
      {a.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.fg }}>
          {initials(a.nombre)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-neutral-900 group-hover:text-brand">{a.nombre}</span>
        <span className="block text-xs tabular-nums text-neutral-400">{a.phone ? fmtPhone(a.phone) : "—"}</span>
      </span>
    </Link>
  );
}

function AccessCard({ a, eventos }: { a: AccessRow; eventos: AccessEvent[] }) {
  const seen = a.last_seen_at ? relative(a.last_seen_at) : null;
  const vistos = eventos.filter((e) => e.evento === "ver_miembro").length;
  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Person a={a} />
        <Link href={`/broker/${a.user_id}#acceso`} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-neutral-50">
          Administrar
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {a.estados.map((e) => (
          <span key={e} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            {e}
          </span>
        ))}
        {a.secciones.map((s) => (
          <span key={s} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
            {seccionLabel(s)}
          </span>
        ))}
        <span className="text-xs text-neutral-400">{a.ver_telefonos ? "· ve teléfonos" : "· sin teléfonos"}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-400">{a.vigente ? "Vence" : a.revoked_at ? "Retirado" : "Venció"}</dt>
          <dd className="text-neutral-800">{fmtDate(a.revoked_at ?? a.expires_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Última vez</dt>
          <dd className="text-neutral-800" suppressHydrationWarning>{seen ? seen.label : "Nunca ha entrado"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Miembros consultados</dt>
          <dd className="tabular-nums text-neutral-800">{vistos}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Otorgado</dt>
          <dd className="text-neutral-800">
            {fmtDate(a.created_at)} · {a.granted_by}
          </dd>
        </div>
      </dl>
      {eventos.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-500 hover:text-neutral-800">
            Bitácora · {eventos.length}
          </summary>
          <ol className="mt-2 divide-y divide-neutral-100">
            {eventos.slice(0, 50).map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="w-28 shrink-0 tabular-nums text-neutral-400">{fmtStamp(e.at)}</span>
                <span className={e.evento === "login_fallido" || e.evento === "bloqueado" ? "text-rose-700" : "text-neutral-700"}>
                  {eventLabel(e)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

export default async function AccesosPage() {
  const role = await requireRole("admin");
  if (role !== "admin" && role !== "dev") redirect("/");

  const { accesos, eventos, fallidos } = await fetchAccesos();
  const byAccess = new Map<string, AccessEvent[]>();
  for (const e of eventos) {
    if (!e.access_id) continue;
    byAccess.set(e.access_id, [...(byAccess.get(e.access_id) ?? []), e]);
  }
  const activos = accesos.filter((a) => a.vigente);
  const pasados = accesos.filter((a) => !a.vigente);

  return (
    <div className="min-h-screen">
      <TopNav active="accesos" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Accesos al panel</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Miembros fuera del equipo que pueden entrar a este panel, sólo para consultar y sólo sus estados. Entran
          con su teléfono y su PIN de la app. El acceso se da, cambia o quita desde la página del miembro → «Acceso al
          panel».
        </p>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-neutral-900">
            Con acceso <span className="text-sm font-normal tabular-nums text-neutral-400">{activos.length}</span>
          </h2>
          {activos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-6 py-10 text-center text-sm text-neutral-400">
              Nadie fuera del equipo tiene acceso. Abre la página de un miembro en{" "}
              <Link href="/brokers" className="text-brand hover:underline">
                Miembros
              </Link>{" "}
              y usa «Dar acceso al panel».
            </div>
          ) : (
            <ul className="space-y-3">
              {activos.map((a) => (
                <AccessCard key={a.id} a={a} eventos={byAccess.get(a.id) ?? []} />
              ))}
            </ul>
          )}
        </section>

        {pasados.length ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-neutral-900">
              Vencidos o retirados <span className="text-sm font-normal tabular-nums text-neutral-400">{pasados.length}</span>
            </h2>
            <ul className="space-y-3 opacity-80">
              {pasados.map((a) => (
                <AccessCard key={a.id} a={a} eventos={byAccess.get(a.id) ?? []} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-neutral-900">
            Intentos sin acceso · 7 días{" "}
            <span className="text-sm font-normal tabular-nums text-neutral-400">{fallidos.length}</span>
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Teléfonos que intentaron entrar sin tener acceso. Después de 5 intentos en 15 minutos el número se bloquea
            15 minutos.
          </p>
          {fallidos.length === 0 ? (
            <p className="text-sm text-neutral-400">Ninguno.</p>
          ) : (
            <ol className="divide-y divide-neutral-100 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-black/[0.05]">
              {fallidos.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-neutral-400">{fmtStamp(e.at)}</span>
                  <span className="tabular-nums text-neutral-700">{e.phone ? fmtPhone(e.phone) : "—"}</span>
                  <span className={e.evento === "bloqueado" ? "text-rose-700" : "text-neutral-500"}>{eventLabel(e)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
