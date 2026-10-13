"use client";

import { useState, useTransition } from "react";
import { grantAccess, renewAccess, revokeAccess } from "@/app/accesos/actions";
import type { AccessRow } from "@/lib/accesos";
import {
  DEFAULT_VIGENCIA,
  ESTADOS,
  SECCION_OPTIONS,
  VIGENCIAS,
  type Seccion,
} from "@/lib/accesoShared";
import { fmtDate, relative } from "@/lib/format";
import { ROL_LABEL } from "@/lib/auth";

// «Acceso al panel» card on /broker/[id] (acceso regional, Franz + Pablo
// 2026-10-13): give this member read-only access to chosen sections of the
// panel for chosen estados. They sign in at admin.propia.dev with their phone
// and the PIN they already use in the app. Same shape as the Plan card: state
// at a glance, one primary action that opens a dialog, revoke one click deeper.

export function AccesoRegionalCard({
  userId,
  name,
  memberStates,
  access,
  pinSet,
}: {
  userId: string;
  name: string | null;
  memberStates: string[];
  access: AccessRow | null;
  pinSet: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [estados, setEstados] = useState<string[]>([]);
  const [otro, setOtro] = useState("");
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [verTelefonos, setVerTelefonos] = useState(true);
  const [dias, setDias] = useState<number>(DEFAULT_VIGENCIA);

  const vigente = access?.vigente ?? false;
  const seen = access?.last_seen_at ? relative(access.last_seen_at) : null;

  function openDialog() {
    setEstados(access?.estados ?? memberStates.slice(0, 1));
    setOtro("");
    setSecciones(access?.secciones ?? SECCION_OPTIONS.map((s) => s.key));
    setVerTelefonos(access?.ver_telefonos ?? true);
    setDias(DEFAULT_VIGENCIA);
    setError(null);
    setOpen(true);
  }

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  // The member's own estados first, then any other one added by hand.
  const estadoChips = [...new Set([...memberStates, ...estados])];

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await grantAccess({ userId, estados, secciones, verTelefonos, dias });
      if (res.error) setError(res.error);
      else setOpen(false);
    });
  }

  function renew() {
    if (!access) return;
    setError(null);
    startTransition(async () => {
      const res = await renewAccess(access.id, DEFAULT_VIGENCIA, userId);
      if (res.error) setError(res.error);
    });
  }

  function revoke() {
    if (!access) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeAccess(access.id, userId);
      if (res.error) setError(res.error);
      setConfirmRevoke(false);
    });
  }

  // Someone on the team (dueño / admin / equipo) isn't given regional access:
  // their role lives on the Accesos page, where only the dueño changes it.
  if (access && access.rol !== "regional") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.05]">
        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
          Equipo · {ROL_LABEL[access.rol]}
        </span>
        <span className="text-sm text-neutral-500">
          Entra al panel con su teléfono, su PIN y un código por WhatsApp. Su rol se cambia en{" "}
          <a href="/accesos" className="text-brand hover:underline">
            Accesos
          </a>
          .
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            vigente ? "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200" : "bg-neutral-100 text-neutral-400"
          }`}
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="15.5" r="4.5" />
            <path d="m10.7 12.3 9.3-9.3" />
            <path d="m16 7 3 3" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-neutral-900">
              {vigente ? `Ve ${access!.estados.join(", ")}` : access ? "Acceso vencido" : "Sin acceso al panel"}
            </span>
            {vigente
              ? access!.secciones.map((s) => (
                  <span key={s} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
                    {SECCION_OPTIONS.find((o) => o.key === s)?.label ?? s}
                  </span>
                ))
              : null}
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            {access ? (
              <>
                {vigente ? "Vence" : "Venció"} el <span className="font-medium text-neutral-800">{fmtDate(access.expires_at)}</span>
                {" · "}
                {access.ver_telefonos ? "ve teléfonos" : "sin teléfonos"}
                {" · "}
                {seen ? <span suppressHydrationWarning>visto {seen.label}</span> : "todavía no entra"}
              </>
            ) : (
              "Puede ver el mapa, las zonas y los miembros de sus estados, sólo para consultar. Entra con su teléfono y su PIN de la app."
            )}
          </div>
          {!pinSet ? (
            <p className="mt-2 text-xs text-amber-700">
              Este miembro no tiene PIN en la app, así que todavía no podría entrar: primero tiene que crear su PIN.
            </p>
          ) : null}
          {error && !open ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {access ? (
            confirmRevoke ? (
              <>
                <span className="text-sm text-neutral-600">¿Quitar el acceso?</span>
                <button type="button" disabled={pending} onClick={revoke} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50">
                  Sí, quitar
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirmRevoke(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-neutral-50">
                  No
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => setConfirmRevoke(true)} className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50">
                  Quitar
                </button>
                <button type="button" disabled={pending} onClick={renew} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 transition hover:bg-neutral-50 disabled:opacity-50">
                  Renovar {DEFAULT_VIGENCIA} días
                </button>
                <button type="button" onClick={openDialog} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
                  Cambiar
                </button>
              </>
            )
          ) : (
            <button type="button" onClick={openDialog} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
              Dar acceso al panel
            </button>
          )}
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => !pending && setOpen(false)}>
          <div role="dialog" aria-modal="true" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-lift" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
              {access ? "Cambiar acceso" : "Dar acceso al panel"}
              {name ? <span className="font-normal text-neutral-500"> · {name}</span> : null}
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Sólo para consultar: no puede aprobar, editar ni descargar nada. Entra en admin.propia.dev con su teléfono y su PIN de la app.
            </p>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">1 · Estados</div>
              <div className="flex flex-wrap gap-2">
                {estadoChips.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEstados((xs) => toggle(xs, e))}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      estados.includes(e) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {e}
                  </button>
                ))}
                <select
                  value={otro}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    if (v) setEstados((xs) => (xs.includes(v) ? xs : [...xs, v]));
                    setOtro("");
                  }}
                  aria-label="Agregar otro estado"
                  className="rounded-full border border-dashed border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-500"
                >
                  <option value="">＋ Otro estado</option>
                  {ESTADOS.filter((e) => !estadoChips.includes(e)).map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">2 · Qué puede ver</div>
              <div className="grid gap-2">
                {SECCION_OPTIONS.map((o) => (
                  <label key={o.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 transition ${secciones.includes(o.key) ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                    <input type="checkbox" checked={secciones.includes(o.key)} onChange={() => setSecciones((xs) => toggle(xs, o.key))} className="mt-1 accent-neutral-900" />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{o.label}</span>
                      <span className="block text-xs text-neutral-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={verTelefonos} onChange={(e) => setVerTelefonos(e.target.checked)} className="accent-neutral-900" />
                Ver los teléfonos de los miembros
              </label>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">3 · Vigencia</div>
              <div className="flex flex-wrap gap-2">
                {VIGENCIAS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDias(d)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      dias === d ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {d} días
                  </button>
                ))}
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200 transition hover:bg-neutral-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || !estados.length || !secciones.length}
                onClick={save}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Guardando…" : access ? "Guardar cambios" : "Dar acceso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
