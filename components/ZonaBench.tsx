"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { crearZona } from "@/app/actions";
import type { CandidateSet, Failure } from "@/lib/zonas";

// Leaflet touches window on import, so the map is client-only.
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

export function ZonaBench({
  failures,
  initial,
}: {
  failures: Failure[];
  initial: { failure: Failure; set: CandidateSet } | null;
}) {
  const [sel, setSel] = useState<Failure | null>(initial?.failure ?? null);
  const [set, setSet] = useState<CandidateSet | null>(initial?.set ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [nombre, setNombre] = useState(initial?.failure.nombre ?? "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Clicking quickly through the queue fires overlapping fetches; only the
  // most recent request may write state, or a slow response for the previous
  // name lands on top of the current one.
  const reqSeq = useRef(0);

  async function choose(f: Failure) {
    const seq = ++reqSeq.current;
    setSel(f);
    setNombre(f.nombre);
    setPicked([]);
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch(
        `/api/zonas/candidatos?estado=${encodeURIComponent(f.estado)}&nombre=${encodeURIComponent(f.nombre)}`,
      );
      if (seq !== reqSeq.current) return; // superseded — drop it
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setSet(null);
        setMsg({
          ok: false,
          text: body?.error ?? `No se pudieron cargar los candidatos (HTTP ${r.status}).`,
        });
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

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  function save() {
    if (!sel || !picked.length) return;
    startTransition(async () => {
      const res = await crearZona(nombre, sel.estado, picked);
      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({
          ok: true,
          text: `Zona creada · ${res.movidas} propiedad${res.movidas === 1 ? "" : "es"} re-asignada${res.movidas === 1 ? "" : "s"}.`,
        });
        setPicked([]);
        // Re-render the server component: the resolved name leaves the queue
        // and the header tallies move, without a manual reload.
        router.refresh();
      }
    });
  }

  const cands = set?.candidatos ?? [];
  const conEvidencia = cands.filter((c) => c.pins_dentro > 0);
  const cubiertos = picked.length
    ? cands.filter((c) => picked.includes(c.key)).reduce((a, c) => a + c.pins_dentro, 0)
    : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[288px_minmax(0,1fr)]">
      {/* ── queue ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/[0.05]">
        <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Sin resolver · por impacto
        </p>
        {failures.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-500">
            Nada pendiente. Todo lo que escriben los brokers está resolviendo.
          </p>
        ) : (
          <ul className="max-h-[600px] overflow-auto">
            {failures.map((f) => {
              const on = sel?.nombre === f.nombre && sel?.estado === f.estado;
              return (
                <li key={`${f.estado}·${f.nombre}`}>
                  <button
                    onClick={() => choose(f)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                      on ? "bg-brand-light" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm font-medium ${on ? "text-brand" : "text-neutral-900"}`}
                      >
                        {f.nombre}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">{f.estado}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rose-600">
                      {f.props}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── bench ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
        {!sel ? (
          <p className="py-24 text-center text-sm text-neutral-500">
            Elige un nombre para ver dónde caen sus propiedades.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                  {sel.nombre}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-neutral-500">
                  <span className="font-medium text-rose-600 tabular-nums">
                    {sel.props} sin zona
                  </span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{set?.pins.length ?? 0} con coordenada</span>
                  {set && set.sin_coords > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{set.sin_coords} sin pin</span>
                    </>
                  ) : null}
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {conEvidencia.length} polígono{conEvidencia.length === 1 ? "" : "s"} con pins
                  </span>
                </p>
              </div>
              {sel.ejemplo ? (
                <p
                  className="max-w-xs truncate rounded-lg bg-neutral-50 px-2.5 py-1 text-xs text-neutral-500"
                  title={sel.ejemplo}
                >
                  {sel.ejemplo}
                </p>
              ) : null}
            </div>

            <div className="grid md:grid-cols-[minmax(0,1fr)_268px]">
              {/* map */}
              <div className="relative h-[480px] border-b border-neutral-100 md:border-b-0 md:border-r">
                {loading ? (
                  <div className="grid h-full place-items-center text-sm text-neutral-400">
                    Cargando…
                  </div>
                ) : (
                  <ZonaMap
                    pins={set?.pins ?? []}
                    candidatos={cands}
                    picked={picked}
                    onToggle={toggle}
                  />
                )}
                <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] leading-relaxed text-neutral-600 shadow-sm ring-1 ring-black/[0.05] backdrop-blur">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-600 align-middle" />
                  propiedad sin zona
                  <span className="mx-1.5 text-neutral-300">|</span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500 align-middle" />
                  contiene pins
                  <span className="mx-1.5 text-neutral-300">|</span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand align-middle" />
                  elegido
                </div>
              </div>

              {/* candidates */}
              <div className="min-w-0">
                <p className="border-b border-neutral-100 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Polígonos candidatos
                </p>
                <ul className="max-h-[432px] overflow-auto">
                  {cands.slice(0, 30).map((c) => {
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
              </div>
            </div>

            {/* save */}
            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-5 py-4">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre de la zona"
                className="w-56 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                onClick={save}
                disabled={pending || !picked.length || nombre.trim().length < 3}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
              >
                {pending
                  ? "Creando…"
                  : `Crear zona${picked.length ? ` · ${picked.length} polígono${picked.length === 1 ? "" : "s"}` : ""}`}
              </button>
              {msg ? (
                <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>
                  {msg.text}
                </span>
              ) : picked.length ? (
                <span className="text-xs text-neutral-500">
                  Cubre {cubiertos} de {set?.pins.length ?? 0} propiedades con pin.
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
