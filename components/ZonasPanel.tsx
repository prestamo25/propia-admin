"use client";

import { useMemo, useState } from "react";
import type { MapZona, Propuesta, PropuestaTipo, ZonaKind } from "@/lib/mapaZonas";
import type { Failure } from "@/lib/zonas";

// The side panel of the big map: which zones exist in this estado, how they
// nest, which ones collide, and how much of what's on the map sits inside
// one. Fase 2: «Nueva zona», «Editar» on a zone's card and the «Sin
// resolver» queue open the editor, which replaces the panel body.

const LOW = new Set(["de", "del", "la", "las", "los", "y", "a", "en", "el"]);
export const zonaLabel = (nombre: string) =>
  nombre
    .replace(/\s*\(ZONA\)\s*$/i, "")
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i && LOW.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

export const KIND_LABEL: Record<ZonaKind, { title: string; hint: string }> = {
  curada: {
    title: "Hechas a mano",
    hint: "Creadas a mano por el equipo, aquí mismo.",
  },
  familia: {
    title: "Familias automáticas",
    hint: "Se crearon solas cuando un requerimiento eligió un nombre que agrupa varias colonias.",
  },
  google: {
    title: "De Google · sin revisar",
    hint: "Se crearon solas a partir de un área o un punto de Google. Muchas son calles; se revisan en la fase 3.",
  },
};

export type ZoneCounts = { props: number; reqs: number };
export type PanelTab = "zonas" | "pendientes" | "propuestas";

export const TIPO_PROPUESTA: Record<PropuestaTipo, string> = {
  familia: "familia de colonias",
  colonias: "colonias",
  localidad: "localidad INEGI",
  municipio: "municipio",
  pins: "por pins",
  dibujar: "dibujar",
};

export function ZonasPanel({
  estado,
  zonas,
  loading,
  error,
  kinds,
  onKind,
  colorOf,
  counts,
  coverage,
  colonias,
  onColonias,
  coloniasNote,
  fuera,
  onFuera,
  selected,
  onSelect,
  onHover,
  pendientes,
  onNew,
  onEdit,
  onFailure,
  editor,
  flash,
  tab,
  onTab,
  propuestas,
  onPropuesta,
}: {
  estado: string;
  zonas: MapZona[] | null;
  loading: boolean;
  error: string | null;
  kinds: Record<ZonaKind, boolean>;
  onKind: (k: ZonaKind) => void;
  colorOf: (z: MapZona) => string;
  counts: Map<string, ZoneCounts>;
  coverage: { total: number; dentro: number };
  colonias: boolean;
  onColonias: () => void;
  coloniasNote: string | null;
  fuera: boolean;
  onFuera: () => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
  pendientes: Failure[] | null;
  onNew: () => void;
  onEdit: (key: string) => void;
  onFailure: (f: Failure) => void;
  /** while a zone is being edited, the editor takes over the panel body */
  editor: React.ReactNode | null;
  /** last save/delete result, shown until the next action */
  flash: string | null;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  propuestas: Propuesta[] | null;
  onPropuesta: (p: Propuesta) => void;
}) {
  const [q, setQ] = useState("");
  const setTab = onTab;
  const [open, setOpen] = useState<Record<ZonaKind, boolean>>({ curada: true, familia: true, google: false });

  const byKey = useMemo(() => new Map((zonas ?? []).map((z) => [z.key, z])), [zonas]);
  const sel = selected ? byKey.get(selected) ?? null : null;

  // Grouped by origin; inside a group, children sit under their parent.
  const groups = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const needle = norm(q.trim());
    const hit = (z: MapZona) => !needle || norm(z.nombre).includes(needle) || norm(z.municipio ?? "").includes(needle);
    const out: Record<ZonaKind, { z: MapZona; depth: number }[]> = { curada: [], familia: [], google: [] };
    for (const kind of ["curada", "familia", "google"] as ZonaKind[]) {
      const list = (zonas ?? []).filter((z) => z.kind === kind);
      const inGroup = new Set(list.map((z) => z.key));
      const kids = new Map<string, MapZona[]>();
      const roots: MapZona[] = [];
      for (const z of list) {
        if (z.padre && inGroup.has(z.padre)) kids.set(z.padre, [...(kids.get(z.padre) ?? []), z]);
        else roots.push(z);
      }
      const byName = (a: MapZona, b: MapZona) => zonaLabel(a.nombre).localeCompare(zonaLabel(b.nombre), "es");
      const walk = (z: MapZona, depth: number) => {
        if (hit(z)) out[kind].push({ z, depth: needle ? 0 : depth });
        for (const k of (kids.get(z.key) ?? []).sort(byName)) walk(k, depth + 1);
      };
      roots.sort(byName).forEach((z) => walk(z, 0));
    }
    return out;
  }, [zonas, q]);

  const pct = coverage.total ? Math.round((coverage.dentro / coverage.total) * 100) : 0;
  const nTraslapes = (zonas ?? []).filter((z) => z.traslapes.length).length;

  if (editor)
    return <aside className="flex h-full w-full flex-col border-l border-neutral-200 bg-white">{editor}</aside>;

  return (
    <aside className="flex h-full w-full flex-col border-l border-neutral-200 bg-white">
      {/* header: estado + coverage */}
      <div className="border-b border-neutral-100 px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            Zonas{estado ? ` de ${estado}` : ""}
          </h2>
          {zonas ? (
            <button
              type="button"
              onClick={onNew}
              className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm hover:opacity-90"
            >
              ＋ Nueva zona
            </button>
          ) : null}
        </div>
        {flash ? (
          <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[13px] text-emerald-800">{flash}</p>
        ) : null}
        {!estado ? (
          <p className="mt-2 text-sm text-neutral-500">Elige un estado arriba para ver sus zonas.</p>
        ) : loading ? (
          <p className="mt-2 text-sm text-neutral-500">Cargando zonas…</p>
        ) : error ? (
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        ) : zonas ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              value={`${pct}%`}
              label="propiedades dentro de una zona"
              sub={`${coverage.dentro.toLocaleString("en-US")} de ${coverage.total.toLocaleString("en-US")} con ubicación`}
            />
            <Stat
              value={String(nTraslapes)}
              label="zonas que se traslapan"
              sub="sin que una contenga a la otra"
              warn={nTraslapes > 0}
            />
          </div>
        ) : null}
      </div>

      {/* what to paint */}
      {estado && zonas ? (
        <div className="space-y-1.5 border-b border-neutral-100 px-4 py-3">
          {(["curada", "familia", "google"] as ZonaKind[]).map((k) => (
            <Toggle
              key={k}
              on={kinds[k]}
              onClick={() => onKind(k)}
              label={KIND_LABEL[k].title}
              count={(zonas ?? []).filter((z) => z.kind === k).length}
              title={KIND_LABEL[k].hint}
              swatch={<KindSwatch kind={k} />}
            />
          ))}
          <Toggle
            on={colonias}
            onClick={onColonias}
            label="Colonias INEGI"
            title="Los polígonos oficiales, sólo de lo que está a la vista."
            note={colonias ? coloniasNote : null}
            swatch={<span className="inline-block h-3 w-3 rounded-sm border border-dashed border-neutral-500" />}
          />
          <Toggle
            on={fuera}
            onClick={onFuera}
            label="Propiedades sin zona"
            count={coverage.total - coverage.dentro}
            title="Pinta en rojo las propiedades que no caen en ninguna zona visible: lo que falta mapear."
            swatch={<span className="inline-block h-3 w-3 rounded-full bg-rose-600" />}
          />
        </div>
      ) : null}

      {/* selected zone */}
      {sel ? (
        <ZoneCard
          z={sel}
          byKey={byKey}
          counts={counts.get(sel.key)}
          color={colorOf(sel)}
          zonas={zonas ?? []}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ) : null}

      {/* list */}
      {estado && zonas ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 px-4 pt-3">
            {(
              [
                ["zonas", "Zonas", zonas.length],
                ["propuestas", "Propuestas", propuestas?.filter((p) => p.revision === "pendiente").length ?? 0],
                ["pendientes", "Sin resolver", pendientes?.length ?? 0],
              ] as const
            ).map(([t, label, n]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  tab === t ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {label}{" "}
                <span className={`tabular-nums ${tab === t ? "text-white/70" : "text-neutral-400"}`}>{n}</span>
              </button>
            ))}
          </div>
          {tab === "pendientes" ? (
            <Pendientes items={pendientes} onPick={onFailure} />
          ) : tab === "propuestas" ? (
            <Propuestas items={propuestas} onPick={onPropuesta} />
          ) : (
          <>
          <div className="px-4 pt-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar zona o municipio"
              className="h-9 w-full rounded-full border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 outline-none ring-brand/40 placeholder:text-neutral-400 focus:ring-2"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
            {(["curada", "familia", "google"] as ZonaKind[]).map((k) => {
              const rows = groups[k];
              const isOpen = open[k] || !!q.trim();
              return (
                <section key={k} className="mt-1">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400 hover:bg-neutral-50"
                  >
                    <span>
                      {isOpen ? "▾" : "▸"} {KIND_LABEL[k].title}
                    </span>
                    <span className="tabular-nums">{rows.length}</span>
                  </button>
                  {isOpen ? (
                    rows.length ? (
                      <ul>
                        {rows.map(({ z, depth }) => {
                          const c = counts.get(z.key);
                          const active = z.key === selected;
                          return (
                            <li key={z.key}>
                              <button
                                type="button"
                                onClick={() => onSelect(active ? null : z.key)}
                                onMouseEnter={() => onHover(z.key)}
                                onMouseLeave={() => onHover(null)}
                                className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition ${
                                  active ? "bg-brand-light" : "hover:bg-neutral-50"
                                }`}
                                style={{ paddingLeft: 8 + depth * 16 }}
                              >
                                {depth ? <span className="text-neutral-300">└</span> : null}
                                <span
                                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                                  style={{ background: colorOf(z), opacity: kinds[z.kind] ? 1 : 0.35 }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-neutral-800">
                                    {zonaLabel(z.nombre)}
                                  </span>
                                  <span className="block truncate text-[11px] text-neutral-400">
                                    {z.municipio}
                                  </span>
                                </span>
                                {z.traslapes.length ? (
                                  <span
                                    title={`Se traslapa con ${z.traslapes.length}`}
                                    className="rounded-full bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700"
                                  >
                                    ⚠
                                  </span>
                                ) : null}
                                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-neutral-500">
                                  {c?.props ?? 0}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="px-2 py-1 text-xs text-neutral-400">
                        {q.trim() ? "Nada con ese nombre." : "Ninguna todavía."}
                      </p>
                    )
                  ) : null}
                </section>
              );
            })}
            <p className="mt-3 px-2 text-[11px] leading-4 text-neutral-400">
              El número a la derecha = propiedades con ubicación que caen dentro de la zona.
            </p>
          </div>
          </>
          )}
        </div>
      ) : null}
    </aside>
  );
}

function ZoneCard({
  z,
  byKey,
  counts,
  color,
  zonas,
  onSelect,
  onEdit,
}: {
  z: MapZona;
  byKey: Map<string, MapZona>;
  counts: ZoneCounts | undefined;
  color: string;
  zonas: MapZona[];
  onSelect: (key: string | null) => void;
  onEdit: (key: string) => void;
}) {
  const padre = z.padre ? byKey.get(z.padre) : null;
  const hijos = zonas.filter((o) => o.padre === z.key);
  const link = (o: MapZona) => (
    <button
      key={o.key}
      type="button"
      onClick={() => onSelect(o.key)}
      className="font-medium text-brand underline-offset-2 hover:underline"
    >
      {zonaLabel(o.nombre)}
    </button>
  );
  const join = (xs: MapZona[]) =>
    xs.flatMap((o, i) => (i ? [<span key={`s${o.key}`}>, </span>, link(o)] : [link(o)]));

  return (
    <div className="border-b border-neutral-100 bg-neutral-50/60 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-5 text-neutral-900">{zonaLabel(z.nombre)}</h3>
          <p className="text-xs text-neutral-500">
            {KIND_LABEL[z.kind].title} · {z.municipio}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Cerrar"
          className="rounded-full px-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini value={String(counts?.props ?? 0)} label="propiedades" />
        <Mini value={String(counts?.reqs ?? 0)} label="búsquedas" />
        <Mini value={z.km2 < 10 ? z.km2.toFixed(2) : Math.round(z.km2).toLocaleString("en-US")} label="km²" />
      </dl>
      <ul className="mt-3 space-y-1 text-[13px] text-neutral-600">
        <li>{z.dibujada ? "Dibujada a mano" : `${z.miembros} colonia${z.miembros === 1 ? "" : "s"} INEGI`}</li>
        {padre ? <li>Dentro de {link(padre)}</li> : null}
        {hijos.length ? <li>Contiene {join(hijos)}</li> : null}
        {z.traslapes.length ? (
          <li className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
            ⚠ Se traslapa con {join(z.traslapes.map((k) => byKey.get(k)).filter((o): o is MapZona => !!o))} sin
            que una contenga a la otra
          </li>
        ) : null}
      </ul>
      {z.kind === "google" ? (
        <p className="mt-3 text-[11px] leading-4 text-neutral-400">
          Las zonas de Google se revisan en la fase 3 (promover, fusionar o borrar).
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onEdit(z.key)}
          className="mt-3 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          ✏️ Editar zona
        </button>
      )}
    </div>
  );
}

function Propuestas({ items, onPick }: { items: Propuesta[] | null; onPick: (p: Propuesta) => void }) {
  const [ver, setVer] = useState<Propuesta["revision"]>("pendiente");
  if (!items) return <p className="px-4 py-3 text-sm text-neutral-500">Cargando…</p>;
  const n = (r: Propuesta["revision"]) => items.filter((p) => p.revision === r).length;
  const shown = items.filter((p) => p.revision === ver);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
      <p className="px-2 pb-2 text-[11px] leading-4 text-neutral-400">
        Zonas sugeridas a partir de cómo los brokers nombran los lugares (WhatsApp, propiedades, perfiles y
        requerimientos). No cambian nada hasta que alguien las aprueba. Toca una para revisarla.
      </p>
      <div className="flex gap-1 px-2 pb-2 text-xs">
        {(
          [
            ["pendiente", "Por revisar"],
            ["aprobada", "Aprobadas"],
            ["descartada", "Descartadas"],
          ] as const
        ).map(([r, label]) => (
          <button
            key={r}
            type="button"
            onClick={() => setVer(r)}
            className={`rounded-full px-2.5 py-0.5 font-medium ${
              ver === r ? "bg-violet-100 text-violet-800" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {label} <span className="tabular-nums opacity-70">{n(r)}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul>
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
              >
                <span
                  className={`inline-block h-3 w-3 shrink-0 rounded-sm border-2 ${
                    p.tipo === "dibujar" ? "border-dashed border-violet-500" : "border-violet-600 bg-violet-200"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-800">{p.nombre}</span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {TIPO_PROPUESTA[p.tipo]}
                    {p.n_miembros ? ` · ${p.n_miembros} colonia${p.n_miembros === 1 ? "" : "s"}` : ""}
                    {p.existe && !p.existe.igual ? " · ajusta una zona existente" : ""}
                  </span>
                </span>
                <span
                  title="Veces que aparece el nombre (WhatsApp, propiedades, perfiles, requerimientos)"
                  className="rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-violet-700"
                >
                  {p.total}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-4 text-center text-xs text-neutral-400">Nada aquí.</p>
      )}
    </div>
  );
}

function Pendientes({ items, onPick }: { items: Failure[] | null; onPick: (f: Failure) => void }) {
  if (!items) return <p className="px-4 py-3 text-sm text-neutral-500">Cargando…</p>;
  if (!items.length)
    return (
      <p className="px-4 py-6 text-center text-sm text-neutral-500">
        Nada pendiente aquí: todo lo que escriben los brokers en este estado está resolviendo.
      </p>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
      <p className="px-2 pb-2 text-[11px] leading-4 text-neutral-400">
        Nombres que los brokers usan y hoy no llevan a ninguna zona, por impacto. Toca uno para verlo en el mapa.
      </p>
      <ul>
        {items.map((f) => (
          <li key={f.nombre}>
            <button
              type="button"
              onClick={() => onPick(f)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-neutral-800">{f.nombre}</span>
                {f.ejemplo ? <span className="block truncate text-[11px] text-neutral-400">{f.ejemplo}</span> : null}
              </span>
              {f.props > 0 ? (
                <span title={`${f.props} propiedades sin zona`} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rose-600">
                  {f.props}
                </span>
              ) : null}
              {f.brokers > 0 ? (
                <span title={`${f.brokers} brokers la tienen en su perfil`} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-indigo-600">
                  {f.brokers}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ value, label, sub, warn }: { value: string; label: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2">
      <b className={`block text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : "text-neutral-900"}`}>{value}</b>
      <span className="block text-[11px] leading-4 text-neutral-600">{label}</span>
      <span className="block text-[11px] leading-4 text-neutral-400">{sub}</span>
    </div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm">
      <dd className="text-base font-semibold tabular-nums text-neutral-900">{value}</dd>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</dt>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  count,
  title,
  note,
  swatch,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  title?: string;
  note?: string | null;
  swatch: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm hover:bg-neutral-50"
    >
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${
          on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span className={on ? "" : "opacity-40"}>{swatch}</span>
      <span className={`flex-1 ${on ? "text-neutral-800" : "text-neutral-500"}`}>
        {label}
        {note ? <span className="block text-[11px] text-neutral-400">{note}</span> : null}
      </span>
      {count != null ? <span className="text-xs tabular-nums text-neutral-400">{count}</span> : null}
    </button>
  );
}

function KindSwatch({ kind }: { kind: ZonaKind }) {
  if (kind === "google")
    return <span className="inline-block h-3 w-3 rounded-sm border border-neutral-400 bg-neutral-200" />;
  const colors = kind === "curada" ? ["#2563eb", "#16a34a", "#d97706"] : ["#0891b2", "#9333ea"];
  return (
    <span className="inline-flex -space-x-1">
      {colors.map((c) => (
        <span
          key={c}
          className={`inline-block h-3 w-3 rounded-sm ring-2 ring-white ${kind === "familia" ? "opacity-60" : ""}`}
          style={{ background: c }}
        />
      ))}
    </span>
  );
}
