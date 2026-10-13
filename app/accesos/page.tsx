import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import {
  AddTeamForm,
  CloseSessionsButton,
  RevokeButton,
  TeamRoleSelect,
  UnlockButton,
} from "@/components/AccesoButtons";
import { requireRole } from "@/lib/session";
import { ROL_LABEL } from "@/lib/auth";
import { fetchAccesos, type AccessEvent, type AccessRow } from "@/lib/accesos";
import { SECCION_OPTIONS } from "@/lib/accesoShared";
import { avatarColors, fmtDate, fmtPhone, initials, relative } from "@/lib/format";
import { fmtStamp } from "@/lib/eventos";

// «Accesos» (Franz + Pablo 2026-10-13): everyone who can open this panel —
// the team (dueño / admin / equipo, phone + PIN + WhatsApp code) and the
// regional viewers (phone + PIN, view-only) — what each can see, and what they
// did: logins, codes, failed attempts, member pages opened. Regional access is
// given from the member's own page («Acceso al panel»); the team is managed
// here, by the dueño only. Admin + dueño open this page.
export const dynamic = "force-dynamic";

const seccionLabel = (k: string) => SECCION_OPTIONS.find((o) => o.key === k)?.label ?? k;
const ROL_ORDER = { dueno: 0, admin: 1, equipo: 2, regional: 3 } as const;
const ROL_CLS: Record<string, string> = {
  dueno: "bg-violet-100 text-violet-700 ring-violet-200",
  admin: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  equipo: "bg-sky-50 text-sky-700 ring-sky-200",
  regional: "bg-amber-50 text-amber-800 ring-amber-200",
};

function eventLabel(e: AccessEvent): string {
  const d = e.detalle ?? {};
  const por = typeof d.por === "string" ? ` por ${d.por}` : "";
  const rol = typeof d.rol === "string" && d.rol in ROL_LABEL ? ROL_LABEL[d.rol as keyof typeof ROL_LABEL] : null;
  switch (e.evento) {
    case "login":
      return d.primera ? "Entró por primera vez" : d.dispositivo ? "Entró (dispositivo de confianza)" : "Entró";
    case "login_fallido":
      return d.motivo === "pin"
        ? "PIN incorrecto"
        : d.motivo === "sin_privilegios"
          ? "PIN correcto, pero sin acceso al panel"
          : d.motivo === "sin_cuenta"
            ? "Teléfono sin cuenta de Propia"
            : "Intento sin acceso";
    case "bloqueado":
      return "Bloqueado 15 min por intentos fallidos";
    case "ver_miembro":
      return `Vio a ${typeof d.nombre === "string" && d.nombre ? d.nombre : "un miembro"}`;
    case "otorgado":
      return rol && rol !== "Regional" ? `Entró al equipo como ${rol}${por}` : `Acceso otorgado${por}`;
    case "editado":
      return rol && rol !== "Regional" ? `Ahora es ${rol}${por}` : `Acceso cambiado${por}`;
    case "renovado":
      return `Renovado ${typeof d.dias === "number" ? `${d.dias} días ` : ""}${por}`.trim();
    case "revocado":
      return `Acceso retirado${por}`;
    case "codigo_enviado":
      return d.error ? "No se pudo mandar el código" : `Código enviado por ${d.canal === "sms" ? "SMS" : "WhatsApp"}`;
    case "codigo_fallido":
      return d.motivo === "expired" ? "Código vencido" : "Código incorrecto";
    case "emergencia":
      return `Entró con contraseña${rol ? ` (${rol === "Equipo" ? "Mariana" : rol === "Dueño" ? "técnico" : rol})` : ""}`;
    case "desbloqueado":
      return `Desbloqueado${por}`;
    case "sesiones_cerradas":
      return `Sesiones cerradas${por}`;
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
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-neutral-900 group-hover:text-brand">
            {a.alias ? `${a.alias} · ${a.nombre}` : a.nombre}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ROL_CLS[a.rol]}`}>
            {ROL_LABEL[a.rol]}
          </span>
        </span>
        <span className="block text-xs tabular-nums text-neutral-400">{a.phone ? fmtPhone(a.phone) : "—"}</span>
      </span>
    </Link>
  );
}

function Bitacora({ eventos }: { eventos: AccessEvent[] }) {
  if (!eventos.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-neutral-500 hover:text-neutral-800">
        Bitácora · {eventos.length}
      </summary>
      <ol className="mt-2 divide-y divide-neutral-100">
        {eventos.slice(0, 50).map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
            <span className="w-28 shrink-0 tabular-nums text-neutral-400">{fmtStamp(e.at)}</span>
            <span
              className={
                e.evento === "login_fallido" || e.evento === "bloqueado" || e.evento === "codigo_fallido"
                  ? "text-rose-700"
                  : "text-neutral-700"
              }
            >
              {eventLabel(e)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function TeamCard({
  a,
  eventos,
  isOwner,
  dispositivos = 0,
}: {
  a: AccessRow;
  eventos: AccessEvent[];
  isOwner: boolean;
  dispositivos?: number;
}) {
  const seen = a.last_seen_at ? relative(a.last_seen_at) : null;
  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Person a={a} />
        {isOwner ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {a.rol === "admin" || a.rol === "equipo" ? <TeamRoleSelect userId={a.user_id} rol={a.rol} /> : null}
            <CloseSessionsButton id={a.id} />
            {a.rol !== "dueno" ? <RevokeButton id={a.id} label="Sacarlo del equipo" /> : null}
          </div>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-400">Con su teléfono</dt>
          <dd className={a.last_login_at ? "text-emerald-700" : "text-amber-700"}>
            {a.last_login_at ? `✓ ${fmtStamp(a.last_login_at)}` : "Todavía no entra así"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Última vez</dt>
          <dd className="text-neutral-800" suppressHydrationWarning>{seen ? seen.label : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400" title="Navegadores donde ya pasó el código de WhatsApp: ahí entra sólo con su PIN (90 días). «Cerrar sesiones» los olvida.">
            Dispositivos de confianza
          </dt>
          <dd className="tabular-nums text-neutral-800">{dispositivos}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Desde</dt>
          <dd className="text-neutral-800">{fmtDate(a.created_at)}</dd>
        </div>
      </dl>
      <Bitacora eventos={eventos} />
    </li>
  );
}

function RegionalCard({ a, eventos, canManage }: { a: AccessRow; eventos: AccessEvent[]; canManage: boolean }) {
  const seen = a.last_seen_at ? relative(a.last_seen_at) : null;
  const vistos = eventos.filter((e) => e.evento === "ver_miembro").length;
  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Person a={a} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canManage && a.vigente ? <CloseSessionsButton id={a.id} /> : null}
          <Link href={`/broker/${a.user_id}#acceso`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-neutral-50">
            Administrar
          </Link>
        </div>
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
      <Bitacora eventos={eventos} />
    </li>
  );
}

function SectionTitle({ title, n }: { title: string; n?: number }) {
  return (
    <h2 className="mb-3 text-lg font-semibold tracking-tight text-neutral-900">
      {title} {n != null ? <span className="text-sm font-normal tabular-nums text-neutral-400">{n}</span> : null}
    </h2>
  );
}

export default async function AccesosPage() {
  const role = await requireRole("admin");
  if (role !== "admin" && role !== "dev") redirect("/");
  const isOwner = role === "dev";

  const { accesos, eventos, fallidos, bloqueados, contrasena, dispositivos } = await fetchAccesos();
  const byAccess = new Map<string, AccessEvent[]>();
  for (const e of eventos) {
    if (!e.access_id) continue;
    byAccess.set(e.access_id, [...(byAccess.get(e.access_id) ?? []), e]);
  }
  const equipo = accesos
    .filter((a) => a.vigente && a.rol !== "regional")
    .sort((a, b) => ROL_ORDER[a.rol] - ROL_ORDER[b.rol]);
  const regionales = accesos.filter((a) => a.vigente && a.rol === "regional");
  const pasados = accesos.filter((a) => !a.vigente);
  const nameByPhone = new Map(accesos.filter((a) => a.phone).map((a) => [a.phone!, a.alias ?? a.nombre]));

  return (
    <div className="min-h-screen">
      <TopNav active="accesos" />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Accesos al panel</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Quién puede entrar a este panel y qué hizo. Todos entran con su teléfono y el PIN de la app; el equipo,
          además, con un código por WhatsApp.
        </p>

        {bloqueados.length ? (
          <section className="mt-6 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
            <h2 className="text-sm font-semibold text-rose-800">Bloqueados ahora</h2>
            <ul className="mt-2 space-y-2">
              {bloqueados.map((b) => (
                <li key={b.phone} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium tabular-nums text-rose-900">
                    {nameByPhone.get(b.phone) ?? fmtPhone(b.phone)}
                  </span>
                  <span className="text-rose-700">hasta {fmtStamp(b.hasta)}</span>
                  <UnlockButton phone={b.phone} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <SectionTitle title="Equipo" n={equipo.length} />
          <ul className="space-y-3">
            {equipo.map((a) => (
              <TeamCard
                key={a.id}
                a={a}
                eventos={byAccess.get(a.id) ?? []}
                isOwner={isOwner}
                dispositivos={dispositivos.get(a.id) ?? 0}
              />
            ))}
          </ul>
          {isOwner ? (
            <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-white/50 p-4">
              <p className="mb-2 text-sm text-neutral-600">
                Agregar a alguien al equipo con el teléfono de su cuenta de Propia. <b>Admin</b> = todo lo de negocio y
                dar accesos regionales; <b>Equipo</b> = lo de negocio, sin accesos.
              </p>
              <AddTeamForm />
            </div>
          ) : null}
          {contrasena.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-neutral-500 hover:text-neutral-800">
                Entradas con contraseña · 30 días · {contrasena.length}
              </summary>
              <ol className="mt-2 divide-y divide-neutral-100 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-black/[0.05]">
                {contrasena.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 py-2 text-sm">
                    <span className="w-28 shrink-0 tabular-nums text-neutral-400">{fmtStamp(e.at)}</span>
                    <span className="text-neutral-700">{eventLabel(e)}</span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>

        <section className="mt-10">
          <SectionTitle title="Accesos regionales" n={regionales.length} />
          {regionales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 px-6 py-10 text-center text-sm text-neutral-400">
              Nadie fuera del equipo tiene acceso. Abre la página de un miembro en{" "}
              <Link href="/brokers" className="text-brand hover:underline">
                Miembros
              </Link>{" "}
              y usa «Dar acceso al panel».
            </div>
          ) : (
            <ul className="space-y-3">
              {regionales.map((a) => (
                <RegionalCard key={a.id} a={a} eventos={byAccess.get(a.id) ?? []} canManage />
              ))}
            </ul>
          )}
        </section>

        {pasados.length ? (
          <section className="mt-10">
            <SectionTitle title="Vencidos o retirados" n={pasados.length} />
            <ul className="space-y-3 opacity-80">
              {pasados.map((a) =>
                a.rol === "regional" ? (
                  <RegionalCard key={a.id} a={a} eventos={byAccess.get(a.id) ?? []} canManage={false} />
                ) : (
                  <TeamCard key={a.id} a={a} eventos={byAccess.get(a.id) ?? []} isOwner={false} />
                ),
              )}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-neutral-900">
            Intentos sin acceso · 7 días{" "}
            <span className="text-sm font-normal tabular-nums text-neutral-400">{fallidos.length}</span>
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Teléfonos que intentaron entrar sin tener acceso. Después de 5 intentos fallidos en 15 minutos el número se
            bloquea 15 minutos.
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
