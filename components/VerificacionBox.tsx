"use client";

import type { Verificacion, Veredicto } from "@/lib/mapaZonas";

// The zone-by-zone verdict (our data + web research, 2026-09-23), shown next to
// a zone or a proposal. Suggestions only: «Aplicar sugerencia» loads the
// changes into the editor and a human still saves; «Reemplazar» moves the
// open requerimientos off a Google box (backed up, reversible).

export const VEREDICTO: Record<Veredicto, { label: string; cls: string }> = {
  confirmar: { label: "Verificada", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ajustar: { label: "Ajustar", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  dibujar: { label: "Dibujar", cls: "bg-violet-50 text-violet-800 ring-violet-200" },
  reemplazar: { label: "Reemplazar", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  descartar: { label: "Descartar", cls: "bg-neutral-100 text-neutral-600 ring-neutral-200" },
  fusionar: { label: "Fusionar", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export function VeredictoBadge({ v }: { v: Verificacion }) {
  const s = VEREDICTO[v.veredicto];
  return (
    <span
      title={`${s.label}${v.confianza ? ` · confianza ${v.confianza}` : ""}${v.aplicada ? " · ya aplicada" : ""}`}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold ring-1 ${s.cls} ${
        v.aplicada ? "opacity-50" : ""
      }`}
    >
      {v.veredicto === "confirmar" ? "✓" : null}
      {s.label}
    </span>
  );
}

export function VerificacionBox({
  v,
  onApply,
  onReplace,
  replaceLabel,
  pending,
}: {
  v: Verificacion;
  /** load sumar/quitar into the editor (proposals and editable zones) */
  onApply?: () => void;
  /** re-point the requerimientos (Google boxes with a reemplazar verdict) */
  onReplace?: () => void;
  replaceLabel?: string;
  pending?: boolean;
}) {
  const s = VEREDICTO[v.veredicto];
  const hasChanges = v.sumar.length > 0 || v.quitar.length > 0;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[12px] leading-4 text-neutral-700">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.cls}`}>{s.label}</span>
        {v.confianza ? <span className="text-[11px] text-neutral-400">confianza {v.confianza}</span> : null}
        <span className="text-[11px] text-neutral-400">
          · {v.fuente === "datos" ? "por datos" : "datos + web"}
          {v.datos?.pins ? ` · ${v.datos.dentro ?? 0}/${v.datos.pins} pins dentro` : ""}
        </span>
        {v.aplicada ? <span className="text-[11px] font-medium text-emerald-700">· aplicada</span> : null}
      </div>
      {v.resumen ? <p className="mt-1.5">{v.resumen}</p> : null}
      {v.sumar.length ? (
        <div className="mt-1.5">
          <span className="font-semibold text-emerald-700">Sumar:</span>
          <ul className="mt-0.5 space-y-0.5">
            {v.sumar.map((c) => (
              <li key={c.key} title={c.razon}>
                + {c.nombre}
                {c.razon ? <span className="text-neutral-400"> — {c.razon}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.quitar.length ? (
        <div className="mt-1.5">
          <span className="font-semibold text-rose-700">Quitar:</span>
          <ul className="mt-0.5 space-y-0.5">
            {v.quitar.map((c) => (
              <li key={c.key} title={c.razon}>
                − {c.nombre}
                {c.razon ? <span className="text-neutral-400"> — {c.razon}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {v.dibujo?.descripcion ? (
        <p className="mt-1.5">
          <span className="font-semibold text-violet-700">Cómo dibujarla:</span> {v.dibujo.descripcion}
        </p>
      ) : null}
      {v.nombre_sugerido ? (
        <p className="mt-1.5">
          <span className="font-semibold">Nombre sugerido:</span> {v.nombre_sugerido}
        </p>
      ) : null}
      {v.fuentes.length ? (
        <p className="mt-1.5 truncate text-[11px] text-neutral-400">
          Fuentes:{" "}
          {v.fuentes.slice(0, 4).map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {i ? ", " : ""}
              {(() => {
                try {
                  return new URL(u).hostname.replace(/^www\./, "");
                } catch {
                  return "link";
                }
              })()}
            </a>
          ))}
        </p>
      ) : null}
      {(onApply && hasChanges && !v.aplicada) || onReplace ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onApply && hasChanges && !v.aplicada ? (
            <button
              type="button"
              onClick={onApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              Aplicar sugerencia
            </button>
          ) : null}
          {onReplace ? (
            <button
              type="button"
              onClick={onReplace}
              disabled={pending}
              className="rounded-full bg-sky-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
            >
              {replaceLabel ?? "Reemplazar"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
