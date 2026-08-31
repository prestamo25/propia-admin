"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  borrarZona,
  crearZona,
  crearZonaDibujada,
  guardarZona,
  ignorarNombre,
} from "@/app/actions";
import type { CandidateSet, Failure, Zona, ZonaDetail } from "@/lib/zonas";
import type { Ring } from "@/components/ZonaMap";

// The Google Maps SDK touches window on import, so the map is client-only.
const ZonaMap = dynamic(() => import("@/components/ZonaMap").then((m) => m.ZonaMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-neutral-400">
      Cargando mapa…
    </div>
  ),
});

const LOW = new Set(["de", "del", "la", "las", "los", "y", "a", "en", "el"]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i && LOW.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

// outer ring of the first polygon — what the boundary editor works on
function ringOfGeom(g: { type: string; coordinates: unknown }): Ring {
  if (g.type === "Polygon") return (g.coordinates as Ring[])[0] ?? [];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][])[0]?.[0] ?? [];
  return [];
}

type View =
  | { t: "vacio" }
  | { t: "fix"; f: Failure }
  | { t: "zona"; det: ZonaDetail };

export function ZonaBench({
  failures,
  zonas,
  initial,
}: {
  failures: Failure[];
  zonas: Zona[];
  initial: { failure: Failure; set: CandidateSet } | null;
}) {
  const [view, setView] = useState<View>(
    initial ? { t: "fix", f: initial.failure } : { t: "vacio" },
  );
  const [set, setSet] = useState<CandidateSet | null>(initial?.set ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [nombre, setNombre] = useState(initial?.failure.nombre ?? "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [ring, setRing] = useState<Ring | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Rapid clicking fires overlapping fetches; only the latest may write state.
  const reqSeq = useRef(0);

  function reset(next: View) {
    setView(next);
    setPicked([]);
    setDrawing(false);
    setRing(null);
    setMsg(null);
  }

  async function chooseFailure(f: Failure) {
    const seq = ++reqSeq.current;
    reset({ t: "fix", f });
    setNombre(f.nombre);
    if (!f.catalogo) {
      setSet(null);
      return; // no INEGI catalog for that state — nothing to fetch
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/zonas/candidatos?estado=${encodeURIComponent(f.estado)}&nombre=${encodeURIComponent(f.nombre)}`,
      );
      if (seq !== reqSeq.current) return;
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setSet(null);
        setMsg({ ok: false, text: body?.error ?? `No se pudieron cargar los candidatos (HTTP ${r.status}).` });
        return;
      }
      setSet(await r.json());
    } catch {
      if (seq === reqSeq.current)
        setMsg({ ok: false, text: "No se pudieron cargar los candidatos." });
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  async function chooseZona(z: Zona) {
    const seq = ++reqSeq.current;
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/zonas/detalle?key=${encodeURIComponent(z.key)}`);
      if (seq !== reqSeq.current) return;
      if (!r.ok) {
        setMsg({ ok: false, text: `No se pudo cargar la zona (HTTP ${r.status}).` });
        return;
      }
      const det = (await r.json()) as ZonaDetail;
      reset({ t: "zona", det });
      setNombre(det.nombre.replace(" (ZONA)", ""));
      setPicked(det.miembros.map((m) => m.key));
      if (det.dibujada) setRing(ringOfGeom(det.geom));
    } catch {
      if (seq === reqSeq.current) setMsg({ ok: false, text: "No se pudo cargar la zona." });
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  function save() {
    if (nombre.trim().length < 3) return;
    startTransition(async () => {
      let res: { error?: string; movidas?: number };
      if (view.t === "fix") {
        if (ring) res = await crearZonaDibujada(nombre, view.f.estado, ring);
        else if (picked.length) res = await crearZona(nombre, view.f.estado, picked);
        else return;
      } else if (view.t === "zona") {
        const det = view.det;
        res = det.dibujada
          ? ring
            ? await guardarZona(det.key, nombre, det.estado, { ring })
            : { error: "El dibujo quedó vacío." }
          : picked.length
            ? await guardarZona(det.key, nombre, det.estado, { miembros: picked })
            : { error: "Una zona necesita al menos un polígono." };
      } else return;

      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({
          ok: true,
          text: `${view.t === "zona" ? "Zona actualizada" : "Zona creada"} · ${res.movidas} propiedad${res.movidas === 1 ? "" : "es"} re-asignada${res.movidas === 1 ? "" : "s"}.`,
        });
        if (view.t === "fix") {
          setPicked([]);
          setRing(null);
          setDrawing(false);
        }
        router.refresh();
      }
    });
  }

  function eliminar() {
    if (view.t !== "zona") return;
    const det = view.det;
    const ok = window.confirm(
      `¿Borrar ${titleCase(det.nombre.replace(" (ZONA)", ""))}?\n\nSus ${det.props} propiedades se re-asignarán automáticamente.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await borrarZona(det.key);
      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        reset({ t: "vacio" });
        router.refresh();
      }
    });
  }

  function ignorar() {
    if (view.t !== "fix") return;
    const f = view.f;
    startTransition(async () => {
      const res = await ignorarNombre(f.estado, f.nombre);
      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        reset({ t: "vacio" });
        router.refresh();
      }
    });
  }

  // ---- what the map shows in each mode ----
  const mapa =
    view.t === "zona"
      ? {
          pins: [] as [number, number][],
          candidatos: [
            ...view.det.miembros.map((m) => ({
              key: m.key, nombre: m.nombre, municipio: m.municipio,
              tipo: "", pins_dentro: 0, parecido: 0, geom: m.geom,
            })),
            ...view.det.vecinos.map((v) => ({
              key: v.key, nombre: v.nombre, municipio: v.municipio,
              tipo: "", pins_dentro: 0, parecido: 0, geom: v.geom,
            })),
          ],
          editSeed:
            view.det.dibujada ? { key: view.det.key, ring: ringOfGeom(view.det.geom) } : null,
        }
      : {
          pins: set?.pins ?? [],
          candidatos: set?.candidatos ?? [],
          editSeed: null,
        };

  const lista =
    view.t === "zona"
      ? mapa.candidatos.map((c) => ({ ...c, esMiembro: view.det.miembros.some((m) => m.key === c.key) }))
      : (set?.candidatos ?? []).slice(0, 30).map((c) => ({ ...c, esMiembro: false }));

  const cubiertos =
    view.t === "fix" && picked.length && set
      ? set.candidatos.filter((c) => picked.includes(c.key)).reduce((a, c) => a + c.pins_dentro, 0)
      : 0;

  const puedeGuardar =
    view.t === "fix"
      ? !!ring || picked.length > 0
      : view.t === "zona"
        ? view.det.dibujada
          ? !!ring
          : picked.length > 0
        : false;

  return (
    <div className="grid gap-5 lg:grid-cols-[288px_minmax(0,1fr)]">
      {/* ── left rail: queue + curated ─────────────────────────── */}
      <div className="space-y-5">
        <div className="rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/[0.05]">
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Sin resolver · por impacto
          </p>
          {failures.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">
              Nada pendiente. Todo lo que escriben los brokers está resolviendo.
            </p>
          ) : (
            <ul className="max-h-[380px] overflow-auto">
              {failures.map((f) => {
                const on = view.t === "fix" && view.f.nombre === f.nombre && view.f.estado === f.estado;
                return (
                  <li key={`${f.estado}·${f.nombre}`}>
                    <button
                      onClick={() => chooseFailure(f)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                        on ? "bg-brand-light" : "hover:bg-neutral-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-sm font-medium ${on ? "text-brand" : "text-neutral-900"}`}>
                          {f.nombre}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {f.estado}
                          {!f.catalogo ? " · sin catálogo" : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {f.props > 0 ? (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rose-600"
                                title={`${f.props} propiedades sin zona`}>
                            {f.props}
                          </span>
                        ) : null}
                        {f.brokers > 0 ? (
                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-indigo-600"
                                title={`${f.brokers} brokers la tienen en su perfil`}>
                            {f.brokers}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/[0.05]">
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Zonas curadas
          </p>
          <ul className="max-h-[300px] overflow-auto">
            {zonas.map((z) => {
              const on = view.t === "zona" && view.det.key === z.key;
              return (
                <li key={z.key}>
                  <button
                    onClick={() => chooseZona(z)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                      on ? "bg-brand-light" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-medium ${on ? "text-brand" : "text-neutral-900"}`}>
                        {titleCase(z.nombre.replace(" (ZONA)", ""))}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {z.miembros?.length
                          ? `${z.miembros.length} polígonos`
                          : "dibujada"} · {z.municipio}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                      {z.props}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── bench ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
        {view.t === "vacio" ? (
          <p className="py-24 text-center text-sm text-neutral-500">
            Elige un nombre sin resolver, o una zona curada para revisarla.
          </p>
        ) : view.t === "fix" && !view.f.catalogo ? (
          <div className="grid min-h-[420px] place-items-center px-8 text-center">
            <div className="max-w-md text-sm text-neutral-600">
              <p className="font-medium text-neutral-800">
                {view.f.estado} no tiene catálogo INEGI cargado
              </p>
              <p className="mt-2 leading-relaxed">
                Sin polígonos no hay contra qué resolver. Si ese mercado ya importa, cargar el
                estado es un comando (load_dcah.py + load_localidades.py); si no, ignora este
                nombre y la cola queda limpia.
              </p>
              <button
                onClick={ignorar}
                disabled={pending}
                className="mt-4 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              >
                {pending ? "Ignorando…" : "Ignorar este nombre"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                  {view.t === "fix" ? view.f.nombre : titleCase(view.det.nombre.replace(" (ZONA)", ""))}
                </h2>
                {view.t === "fix" ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-neutral-500">
                    {view.f.props > 0 ? (
                      <span className="font-medium tabular-nums text-rose-600">{view.f.props} sin zona</span>
                    ) : null}
                    {view.f.brokers > 0 ? (
                      <span className="font-medium tabular-nums text-indigo-600">
                        {view.f.brokers} broker{view.f.brokers === 1 ? "" : "s"} la cubren
                      </span>
                    ) : null}
                    <span className="tabular-nums">{set?.pins.length ?? 0} con coordenada</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {view.det.dibujada ? "Dibujada a mano" : `${view.det.miembros.length} polígonos INEGI`} ·{" "}
                    {view.det.km2} km² · {view.det.props} propiedades · {view.det.municipio}
                  </p>
                )}
              </div>
              {view.t === "fix" ? (
                <button
                  onClick={ignorar}
                  disabled={pending}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  title="Esto no es una zona — sácalo de la cola"
                >
                  Ignorar
                </button>
              ) : (
                <button
                  onClick={eliminar}
                  disabled={pending}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  Borrar zona
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-[minmax(0,1fr)_268px]">
              <div className="relative h-[480px] border-b border-neutral-100 md:border-b-0 md:border-r">
                {loading ? (
                  <div className="grid h-full place-items-center text-sm text-neutral-400">Cargando…</div>
                ) : (
                  <ZonaMap
                    pins={mapa.pins}
                    candidatos={mapa.candidatos}
                    picked={picked}
                    drawing={drawing && !ring}
                    hasDrawn={!!ring && view.t === "fix"}
                    editSeed={mapa.editSeed}
                    onToggle={view.t === "zona" && view.det.dibujada ? () => {} : toggle}
                    onDrawn={setRing}
                  />
                )}
                {view.t === "fix" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (drawing || ring) {
                        setDrawing(false);
                        setRing(null);
                      } else {
                        setDrawing(true);
                        setPicked([]);
                      }
                    }}
                    className={`absolute right-3 top-3 z-[500] rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 transition ${
                      drawing || ring
                        ? "bg-rose-600 text-white ring-rose-600 hover:bg-rose-700"
                        : "bg-white/95 text-neutral-700 ring-black/[0.06] backdrop-blur hover:bg-white"
                    }`}
                  >
                    {ring ? "Borrar dibujo" : drawing ? "Cancelar dibujo" : "✏️ Dibujar zona"}
                  </button>
                ) : null}
                <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] leading-relaxed text-neutral-600 shadow-sm ring-1 ring-black/[0.05] backdrop-blur">
                  {view.t === "fix" ? (
                    <>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-600 align-middle" />
                      propiedad sin zona
                      <span className="mx-1.5 text-neutral-300">|</span>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500 align-middle" />
                      contiene pins
                      <span className="mx-1.5 text-neutral-300">|</span>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand align-middle" />
                      elegido
                    </>
                  ) : view.det.dibujada ? (
                    <>arrastra los vértices para ajustar el límite</>
                  ) : (
                    <>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand align-middle" />
                      miembro
                      <span className="mx-1.5 text-neutral-300">|</span>
                      <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-neutral-400 align-middle" />
                      vecino — click para sumar
                    </>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <p className="border-b border-neutral-100 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  {view.t === "zona" ? "Miembros y vecinos" : "Polígonos candidatos"}
                </p>
                {view.t === "zona" && view.det.dibujada ? (
                  <p className="px-4 py-6 text-center text-xs leading-relaxed text-neutral-500">
                    Esta zona es un dibujo, no una unión de polígonos — su límite se edita
                    directamente en el mapa.
                  </p>
                ) : (
                  <ul className="max-h-[432px] overflow-auto">
                    {lista.map((c) => {
                      const on = picked.includes(c.key);
                      return (
                        <li key={c.key}>
                          <label
                            className={`flex cursor-pointer items-start gap-2.5 px-4 py-2 transition ${
                              on ? "bg-brand-light" : "hover:bg-neutral-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(c.key)}
                              className="mt-0.5 accent-[var(--color-brand)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-neutral-800">
                                {titleCase(c.nombre)}
                              </span>
                              <span className="block truncate text-[11px] text-neutral-500">
                                {c.municipio}
                              </span>
                            </span>
                            {c.pins_dentro > 0 ? (
                              <span className="mt-0.5 shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-600">
                                {c.pins_dentro}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-5 py-4">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre de la zona"
                className="w-56 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                onClick={save}
                disabled={pending || !puedeGuardar || nombre.trim().length < 3}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
              >
                {pending
                  ? "Guardando…"
                  : view.t === "zona"
                    ? "Guardar cambios"
                    : ring
                      ? "Crear zona · dibujada"
                      : `Crear zona${picked.length ? ` · ${picked.length} polígono${picked.length === 1 ? "" : "s"}` : ""}`}
              </button>
              {msg ? (
                <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>
              ) : view.t === "fix" && ring ? (
                <span className="text-xs text-neutral-500">
                  Dibujo listo — arrastra los vértices para afinarlo, o bórralo y vuelve a empezar.
                </span>
              ) : view.t === "fix" && drawing ? (
                <span className="text-xs text-neutral-500">
                  Haz click en el mapa para poner vértices; cierra en el primero para terminar.
                </span>
              ) : view.t === "fix" && picked.length ? (
                <span className="text-xs text-neutral-500">
                  Cubre {cubiertos} de {set?.pins.length ?? 0} propiedades con pin.
                </span>
              ) : view.t === "zona" ? (
                <span className="text-xs text-neutral-400">
                  Guardar reconstruye la zona y re-asigna propiedades automáticamente.
                </span>
              ) : (
                <span className="text-xs text-neutral-400">
                  Toca los polígonos en el mapa o márcalos en la lista.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
