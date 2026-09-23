"use client";

import { useState } from "react";
import type { Failure } from "@/lib/zonas";
import type { Propuesta, Verificacion, ZonaKind } from "@/lib/mapaZonas";
import { VerificacionBox } from "@/components/VerificacionBox";
import type { Evidence, MemberGeo, Ring } from "@/components/useZonaEditor";
import { zonaLabel, KIND_LABEL, TIPO_PROPUESTA } from "@/components/ZonasPanel";

// The panel while a zone is being made or changed. Everything it saves goes
// through the same server actions the Zonas bench used (crearZona,
// crearZonaDibujada, guardarZona, borrarZona, ignorarNombre): each rebuilds the
// zone, re-homes the listings it touches and re-keys broker profiles.

export type EditState = {
  /** null = a new zone */
  key: string | null;
  kind: ZonaKind | null;
  nombre: string;
  modo: "miembros" | "dibujo";
  picked: string[];
  geoms: Record<string, MemberGeo>;
  ring: Ring | null;
  drawing: boolean;
  seed: { id: string; ring: Ring } | null;
  /** set when the edit started from the «Sin resolver» queue */
  failure: Failure | null;
  /** listings the zone holds today (existing zones) */
  props: number;
  /** set when reviewing a draft from the «Propuestas» tab */
  propuesta: Propuesta | null;
  /** the verdict whose suggestion was loaded («Aplicar sugerencia»), marked applied on save */
  verifId: number | null;
};

export function ZonaEditor({
  edit,
  cubre,
  evidence,
  loading,
  pending,
  msg,
  onNombre,
  onModo,
  onDraw,
  onDiscardDrawing,
  onToggle,
  onSave,
  onCancel,
  onDelete,
  onIgnore,
  onDiscardPropuesta,
  verif,
  onApplyVerif,
}: {
  edit: EditState;
  /** listings of the estado the zone would hold as edited */
  cubre: number;
  evidence: Evidence | null;
  loading: boolean;
  pending: boolean;
  msg: { ok: boolean; text: string } | null;
  onNombre: (v: string) => void;
  onModo: (m: "miembros" | "dibujo") => void;
  onDraw: () => void;
  onDiscardDrawing: () => void;
  onToggle: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onIgnore: () => void;
  onDiscardPropuesta: () => void;
  /** zone-by-zone verdict for this zone / proposal, if any */
  verif: Verificacion | null;
  onApplyVerif: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = edit.key === null;
  const canSave =
    edit.nombre.trim().length >= 3 &&
    (edit.modo === "miembros" ? edit.picked.length > 0 : !!edit.ring) &&
    !pending;

  const title = edit.propuesta
    ? `Propuesta: ${edit.propuesta.nombre}`
    : isNew
    ? edit.failure
      ? `Resolver «${edit.failure.nombre}»`
      : "Nueva zona"
    : `Editar ${zonaLabel(edit.nombre)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-100 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-5 tracking-tight text-neutral-900">{title}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {edit.propuesta ? (
                <>
                  <span className="font-medium text-violet-700">{edit.propuesta.total} menciones</span>
                  {" · "}
                  {[
                    ["wa", "WhatsApp"],
                    ["prop", "propiedades"],
                    ["perfil", "perfiles"],
                    ["req", "requerimientos"],
                  ]
                    .filter(([k]) => edit.propuesta!.menciones[k as keyof Propuesta["menciones"]])
                    .map(([k, label]) => `${edit.propuesta!.menciones[k as keyof Propuesta["menciones"]]} ${label}`)
                    .join(" · ")}
                  {" · "}
                  {TIPO_PROPUESTA[edit.propuesta.tipo]}
                </>
              ) : edit.failure ? (
                <>
                  {edit.failure.props > 0 ? (
                    <span className="font-medium text-rose-600">{edit.failure.props} propiedades sin zona</span>
                  ) : null}
                  {edit.failure.props > 0 && edit.failure.brokers > 0 ? " · " : ""}
                  {edit.failure.brokers > 0 ? (
                    <span className="font-medium text-indigo-600">
                      {edit.failure.brokers} broker{edit.failure.brokers === 1 ? "" : "s"} la tienen en su perfil
                    </span>
                  ) : null}
                  {evidence ? ` · ${evidence.pins.length} con punto en el mapa` : ""}
                </>
              ) : isNew ? (
                "Elige colonias INEGI en el mapa o dibuja el límite a mano."
              ) : (
                <>
                  {edit.kind ? KIND_LABEL[edit.kind].title : ""} · hoy tiene {edit.props} propiedades
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            Cancelar
          </button>
        </div>

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Nombre</span>
          <input
            value={edit.nombre}
            onChange={(e) => onNombre(e.target.value)}
            placeholder="Como le dicen los brokers"
            className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none ring-brand/40 focus:ring-2"
          />
        </label>

        {edit.propuesta?.nota || edit.propuesta?.existe ? (
          <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[12px] leading-4 text-violet-900">
            {edit.propuesta.existe && !edit.propuesta.existe.igual
              ? `Ya existe una zona con este nombre (${edit.propuesta.existe.miembros} colonias): aquí la ves con las colonias de la propuesta sumadas. Guardar la actualiza. `
              : ""}
            {edit.propuesta.nota ?? ""}
            {edit.propuesta.sinonimos.length > 1 ? (
              <span className="mt-1 block text-violet-700/80">
                También la escriben: {edit.propuesta.sinonimos.slice(1).join(", ")}
              </span>
            ) : null}
          </p>
        ) : null}

        {isNew ? (
          <div className="mt-3 inline-flex rounded-full bg-neutral-100 p-0.5 text-sm">
            {(
              [
                ["miembros", "Elegir colonias"],
                ["dibujo", "✏️ Dibujar"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onModo(m)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  edit.modo === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {verif ? (
          <div className="mb-3">
            <VerificacionBox
              v={edit.verifId === verif.id ? { ...verif, aplicada: true } : verif}
              onApply={edit.modo === "miembros" ? onApplyVerif : undefined}
              pending={pending || loading}
            />
            {edit.verifId === verif.id ? (
              <p className="mt-1 text-[11px] text-amber-800">
                Sugerencia cargada en la lista de abajo — revísala y guarda para aplicarla.
              </p>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : edit.modo === "miembros" ? (
          <>
            <p className="text-[13px] leading-5 text-neutral-600">
              Toca colonias en el mapa para sumarlas o quitarlas.{" "}
              <span className="text-neutral-400">
                Las líneas de colonia aparecen al acercarte.
                {evidence?.polys.some((p) => p.pins) ? " Ámbar = tiene propiedades de este nombre adentro." : ""}
              </span>
            </p>
            <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              En la zona · {edit.picked.length}
            </h3>
            {edit.picked.length ? (
              <ul className="mt-1 space-y-0.5">
                {edit.picked.map((k) => {
                  const n = edit.geoms[k];
                  return (
                    <li key={k} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-neutral-50">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-neutral-800">{n ? zonaLabel(n.nombre) : k}</span>
                        {n ? <span className="block truncate text-[11px] text-neutral-400">{n.municipio}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggle(k)}
                        aria-label="Quitar"
                        className="rounded-full px-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">Ninguna todavía.</p>
            )}
            {evidence?.polys.length ? (
              <>
                <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  {edit.failure ? "Candidatas" : "Vecinas"}
                </h3>
                <ul className="mt-1 space-y-0.5">
                  {evidence.polys
                    .filter((p) => !edit.picked.includes(p.key))
                    .slice(0, 30)
                    .map((p) => (
                      <li key={p.key}>
                        <button
                          type="button"
                          onClick={() => onToggle(p.key)}
                          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-neutral-50"
                        >
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-neutral-300 text-[11px] text-neutral-400">
                            +
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-neutral-800">{zonaLabel(p.nombre)}</span>
                            <span className="block truncate text-[11px] text-neutral-400">{p.municipio}</span>
                          </span>
                          {p.pins ? (
                            <span className="rounded bg-amber-50 px-1.5 text-[11px] font-semibold tabular-nums text-amber-700">
                              {p.pins}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <div className="text-[13px] leading-5 text-neutral-600">
            {edit.drawing ? (
              <p>
                Haz click en el mapa para poner vértices. Cierra tocando el primero (o con doble click).
              </p>
            ) : edit.ring ? (
              <p>Arrastra los vértices para afinar el límite. Los puntos intermedios agregan vértices nuevos.</p>
            ) : (
              <p>Todavía no hay dibujo.</p>
            )}
            <div className="mt-3 flex gap-2">
              {!edit.drawing ? (
                <button
                  type="button"
                  onClick={onDraw}
                  className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  {edit.ring ? "Volver a dibujar" : "✏️ Empezar a dibujar"}
                </button>
              ) : null}
              {edit.drawing || (edit.ring && isNew) ? (
                <button
                  type="button"
                  onClick={onDiscardDrawing}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Borrar dibujo
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 px-4 py-3">
        <p className="text-xs text-neutral-500">
          Cubriría <b className="tabular-nums text-neutral-800">{cubre}</b> propiedades con ubicación.
        </p>
        {msg ? (
          <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          >
            {pending
              ? "Guardando…"
              : edit.propuesta
                ? isNew
                  ? "Aprobar · crear zona"
                  : "Aprobar · guardar zona"
                : isNew
                  ? "Crear zona"
                  : "Guardar cambios"}
          </button>
          {edit.propuesta && edit.propuesta.revision === "pendiente" ? (
            <button
              type="button"
              onClick={onDiscardPropuesta}
              disabled={pending}
              title="No es una zona que queramos — sale de la lista de propuestas"
              className="rounded-full px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
            >
              Descartar propuesta
            </button>
          ) : null}
          {!isNew && !edit.propuesta ? (
            confirmDelete ? (
              <span className="inline-flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="rounded-full bg-rose-600 px-3 py-2 font-medium text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  Sí, borrar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full px-2 py-2 text-neutral-500 hover:bg-neutral-100"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-rose-50 hover:text-rose-600"
              >
                Borrar zona
              </button>
            )
          ) : edit.failure ? (
            <button
              type="button"
              onClick={onIgnore}
              disabled={pending}
              title="Esto no es una zona — sácalo de la cola"
              className="rounded-full px-3 py-2 text-sm font-medium text-neutral-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
            >
              No es zona · ignorar
            </button>
          ) : null}
        </div>
        {confirmDelete ? (
          <p className="mt-2 text-xs text-neutral-500">
            Sus {edit.props} propiedades se re-asignan solas a la colonia o zona que les toque.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-neutral-400">
            Guardar reconstruye la zona y re-asigna las propiedades al momento.
          </p>
        )}
      </div>
    </div>
  );
}
