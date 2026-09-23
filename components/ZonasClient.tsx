"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Cluster } from "@googlemaps/markerclusterer";
import type { Geo, MapColonia, MapZona, PorUbicar, Propuesta, Verificacion, ZonaKind } from "@/lib/mapaZonas";
import { contains, shapeOf, type ZoneShape } from "@/lib/geoContains";
import { LayerPill, PillSelect, PillTray, Toolbar } from "@/components/Pills";
import { KindSwatch, ZonasPanel, zonaLabel, KIND_LABEL, type PanelTab, type ZoneCounts } from "@/components/ZonasPanel";
import { ZonaEditor, type EditState } from "@/components/ZonaEditor";
import { useZonaEditor, type Evidence, type Ring } from "@/components/useZonaEditor";
import { borrarZona, crearZona, crearZonaDibujada, guardarZona, ignorarNombre } from "@/app/actions";
import { marcarPropuesta, marcarVerificacion, reemplazarZonaEnRequerimientos } from "@/app/zonas/actions";
import type { CandidateSet, Failure, ZonaDetail } from "@/lib/zonas";

// «Zonas» (Franz 2026-09-23): its own page, deliberately apart from «Mapa» —
// with every property AND every zone on one map it read as a wall of ink. Here
// the zones are the subject: every zone of the estado painted at once, INEGI
// colonias on demand, and the editor (new / edit / «Sin resolver» queue) in the
// side panel. Listings are used for counting only; their pins appear just for
// the ones no zone covers, and only when asked for.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

// Neighbouring zones need to read apart, so each named zone gets its own hue
// (stable per key); Google-derived ones stay one quiet grey until reviewed.
// Kind is carried by weight: hand-made zones bold, automatic families lighter.
const ZONE_PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488"];
const GOOGLE_GREY = "#737373";
const OUTSIDE = "#e11d48";
const PROPUESTA = "#7c3aed";
const ZONE_WEIGHT: Record<ZonaKind, { w: number; op: number }> = {
  curada: { w: 2.6, op: 0.22 },
  familia: { w: 1.6, op: 0.12 },
  google: { w: 1, op: 0.05 },
};
// Labels appear as you zoom in, most important first.
const LABEL_ZOOM: Record<ZonaKind, number> = { curada: 11, familia: 12, google: 14 };
// INEGI outlines only from neighbourhood zoom: at city level 3,000 of them are ink.
const COLONIAS_ZOOM = 13;

export type ZonaPoint = { id: string; lat: number; lng: number; state: string | null };
export type DemandPoint = { lat: number; lng: number; states: string[] };

function hueOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ZONE_PALETTE[h % ZONE_PALETTE.length];
}
const zoneColor = (z: MapZona) => (z.kind === "google" ? GOOGLE_GREY : hueOf(z.key));
// outer ring of the first polygon — what the boundary editor works on
function ringOfGeom(g: Geo): Ring {
  if (g.type === "Polygon") return (g.coordinates as Ring[])[0] ?? [];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][])[0]?.[0] ?? [];
  return [];
}
// A point to hang the name on: middle of the largest piece's box when it falls
// inside, otherwise the average of that piece's outline.
function labelPoint(shape: ZoneShape): { lat: number; lng: number } | null {
  let best: [number, number][] | null = null;
  let bestArea = -1;
  for (const p of shape.polys) {
    const r = p[0] ?? [];
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = r;
    }
  }
  if (!best?.length) return null;
  const xs = best.map((p) => p[0]);
  const ys = best.map((p) => p[1]);
  const c = { lng: (Math.min(...xs) + Math.max(...xs)) / 2, lat: (Math.min(...ys) + Math.max(...ys)) / 2 };
  if (contains(shape, c.lng, c.lat)) return c;
  return { lng: xs.reduce((a, b) => a + b, 0) / xs.length, lat: ys.reduce((a, b) => a + b, 0) / ys.length };
}
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

// Classic markers only: Advanced Markers need a Map ID (see MapaClient).
const OUTSIDE_PIN = () => ({
  path: google.maps.SymbolPath.CIRCLE,
  scale: 5.5,
  fillColor: OUTSIDE,
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
});
const outsideClusters = {
  render({ count, position }: Cluster): google.maps.Marker {
    const size = count < 10 ? 30 : count < 100 ? 36 : 44;
    const r = size / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 2}" fill="${OUTSIDE}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2"/></svg>`;
    return new google.maps.Marker({
      position,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(r, r),
      },
      label: { text: String(count), color: "#ffffff", fontSize: "12px", fontWeight: "600" },
      zIndex: 25000 + count,
    });
  },
};

export function ZonasClient({
  states,
  listings,
  demand,
}: {
  states: string[];
  listings: ZonaPoint[];
  demand: DemandPoint[];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const coloniaLayer = useRef<google.maps.Data | null>(null);
  const zoneTip = useRef<google.maps.InfoWindow | null>(null);
  const zoneLabels = useRef<Map<string, { marker: google.maps.Marker; kind: ZonaKind }>>(new Map());
  const coloniaReset = useRef<(() => void) | null>(null);
  const outsideCl = useRef<MarkerClusterer | null>(null);
  // draft zones, painted only while the «Propuestas» tab is open
  const propLayer = useRef<google.maps.Data | null>(null);
  const propById = useRef(new Map<number, Propuesta>());
  const startPropRef = useRef<(p: Propuesta) => void>(() => {});
  const framedEstado = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authFail, setAuthFail] = useState(false);
  const [zoom, setZoom] = useState(11);

  const [estado, setEstado] = useState<string>(states.includes("Puebla") ? "Puebla" : (states[0] ?? ""));
  const [zonas, setZonas] = useState<MapZona[] | null>(null);
  const [zLoading, setZLoading] = useState(!!estado);
  const [zError, setZError] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Record<ZonaKind, boolean>>({ curada: true, familia: true, google: false });
  // on by default (Franz 09-23): the INEGI lines are the base the zones sit on
  const [showColonias, setShowColonias] = useState(true);
  const [coloniasNote, setColoniasNote] = useState<string | null>(null);
  const [fuera, setFuera] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // below lg only

  const [edit, setEdit] = useState<EditState | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reloadTick, setReloadTick] = useState(0);
  const [pendientes, setPendientes] = useState<Failure[] | null>(null);
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [porUbicar, setPorUbicar] = useState<PorUbicar[] | null>(null);
  const [verifList, setVerifList] = useState<Verificacion[]>([]);
  const [tab, setTab] = useState<PanelTab>("zonas");
  // every colonia geometry seen (viewport, members, candidates) — a pick
  // must be drawable after the viewport that showed it has moved on
  const geomCache = useRef(new Map<string, { nombre: string; municipio: string; geom: Geo }>());
  const editSeq = useRef(0);
  const coloniasOn = showColonias || edit?.modo === "miembros";

  // Handlers wired once into the map read these, never stale closures.
  const zoneRef = useRef({
    kinds, selected, hovered, estado, showColonias: coloniasOn,
    edit: null as EditState | null,
    toggle: (() => {}) as (key: string) => void,
    byKey: new Map<string, MapZona>(),
    shapes: new Map<string, ZoneShape>(),
  });

  // A new estado drops the old one's zones at once (not after the fetch).
  const changeEstado = (v: string) => {
    setEstado(v);
    setSelected(null);
    setZonas(null);
    setZError(null);
    setZLoading(!!v);
    setEdit(null);
    setEvidence(null);
    setPendientes(null);
    setPropuestas(null);
    setPorUbicar(null);
    setVerifList([]);
    setFlash(null);
  };
  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/zonas/mapa?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        setZonas(body as MapZona[]);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setZError(e instanceof Error ? e.message : "No se pudieron cargar las zonas");
      })
      .finally(() => {
        if (!ac.signal.aborted) setZLoading(false);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);

  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/zonas/pendientes?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Failure[]) => setPendientes(rows))
      .catch(() => {
        if (!ac.signal.aborted) setPendientes([]);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);

  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/zonas/propuestas?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Propuesta[]) => setPropuestas(rows))
      .catch(() => {
        if (!ac.signal.aborted) setPropuestas([]);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);

  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/zonas/por-ubicar?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PorUbicar[]) => setPorUbicar(rows))
      .catch(() => {
        if (!ac.signal.aborted) setPorUbicar([]);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);

  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/zonas/verificaciones?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Verificacion[]) => setVerifList(rows))
      .catch(() => {
        if (!ac.signal.aborted) setVerifList([]);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);
  const verifs = useMemo(() => new Map(verifList.map((v) => [v.zid, v])), [verifList]);

  const shapes = useMemo(() => new Map((zonas ?? []).map((z) => [z.key, shapeOf(z.geom)])), [zonas]);
  const byKey = useMemo(() => new Map((zonas ?? []).map((z) => [z.key, z])), [zonas]);
  const estadoListings = useMemo(() => listings.filter((l) => l.state === estado), [listings, estado]);
  const estadoDemand = useMemo(() => demand.filter((d) => d.states.includes(estado)), [demand, estado]);

  // What each zone holds, and which listings sit in no visible zone.
  const { counts, outside } = useMemo(() => {
    const counts = new Map<string, ZoneCounts>();
    const outside: ZonaPoint[] = [];
    if (!zonas) return { counts, outside };
    const list = zonas.map((z) => ({ z, sh: shapes.get(z.key)! }));
    for (const { z } of list) counts.set(z.key, { props: 0, reqs: 0 });
    for (const l of estadoListings) {
      let covered = false;
      for (const { z, sh } of list)
        if (contains(sh, l.lng, l.lat)) {
          counts.get(z.key)!.props++;
          if (kinds[z.kind]) covered = true;
        }
      if (!covered) outside.push(l);
    }
    for (const p of estadoDemand)
      for (const { z, sh } of list) if (contains(sh, p.lng, p.lat)) counts.get(z.key)!.reqs++;
    return { counts, outside };
  }, [zonas, shapes, estadoListings, estadoDemand, kinds]);

  // ── Editor ───────────────────────────────────────────────────────────────
  // event-time only: the pick carries its own name + shape into the edit
  const toggleMember = (key: string) => {
    const g = geomCache.current.get(key);
    setEdit((e) => {
      if (!e || e.modo !== "miembros") return e;
      if (e.picked.includes(key)) {
        const geoms = { ...e.geoms };
        delete geoms[key];
        return { ...e, picked: e.picked.filter((k) => k !== key), geoms };
      }
      if (!g) return e;
      return { ...e, picked: [...e.picked, key], geoms: { ...e.geoms, [key]: g } };
    });
  };
  useEffect(() => {
    zoneRef.current.toggle = toggleMember;
  });
  const editor = useZonaEditor({
    map,
    ready,
    edit,
    evidence,
    onToggle: toggleMember,
    onRing: (ring) => setEdit((e) => (e ? { ...e, ring, drawing: ring ? false : e.drawing } : e)),
  });

  const blankEdit = (over: Partial<EditState>): EditState => ({
    key: null, kind: null, nombre: "", modo: "miembros", picked: [], geoms: {}, ring: null,
    drawing: false, seed: null, failure: null, props: 0, propuesta: null, verifId: null, ...over,
  });
  const cache = (rows: { key: string; nombre: string; municipio: string; geom: Geo }[]) => {
    for (const r of rows) geomCache.current.set(r.key, { nombre: r.nombre, municipio: r.municipio, geom: r.geom });
  };
  const frame = (pts: [number, number][]) => {
    const m = map.current;
    if (!m || !pts.length) return;
    const b = new google.maps.LatLngBounds();
    for (const [lng, lat] of pts) b.extend({ lat, lng });
    m.fitBounds(b, 60);
    google.maps.event.addListenerOnce(m, "idle", () => {
      if ((m.getZoom() ?? 0) > 16) m.setZoom(16);
    });
  };

  function startNew() {
    editSeq.current++;
    setMsg(null);
    setFlash(null);
    setEvidence(null);
    setSelected(null);
    setEdit(blankEdit({}));
    setPanelOpen(true);
  }

  async function startEdit(key: string) {
    const seq = ++editSeq.current;
    const z = byKey.get(key);
    setMsg(null);
    setFlash(null);
    setEvidence(null);
    setEditLoading(true);
    setEdit(blankEdit({ key, kind: z?.kind ?? null, nombre: z ? zonaLabel(z.nombre) : "" }));
    try {
      const r = await fetch(`/api/zonas/detalle?key=${encodeURIComponent(key)}`);
      const body = await r.json();
      if (seq !== editSeq.current) return;
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      const det = body as ZonaDetail;
      cache(det.miembros);
      cache(det.vecinos);
      const ring = det.dibujada ? ringOfGeom(det.geom) : null;
      setEdit(
        blankEdit({
          key,
          kind: z?.kind ?? null,
          nombre: zonaLabel(det.nombre),
          modo: det.dibujada ? "dibujo" : "miembros",
          picked: det.miembros.map((mm) => mm.key),
          geoms: Object.fromEntries(det.miembros.map((mm) => [mm.key, mm])),
          ring,
          seed: ring ? { id: key, ring } : null,
          props: det.props,
        }),
      );
      setEvidence({ pins: [], polys: det.vecinos.map((v) => ({ ...v, pins: 0 })) });
    } catch (e) {
      if (seq === editSeq.current) setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo cargar la zona." });
    } finally {
      if (seq === editSeq.current) setEditLoading(false);
    }
  }

  async function startFailure(f: Failure) {
    const seq = ++editSeq.current;
    setMsg(null);
    setFlash(null);
    setEvidence(null);
    setSelected(null);
    setEdit(blankEdit({ nombre: zonaLabel(f.nombre), failure: f }));
    if (!f.catalogo) {
      setMsg({ ok: false, text: `${f.estado} no tiene catálogo INEGI cargado: sólo se puede dibujar o ignorar.` });
      return;
    }
    setEditLoading(true);
    try {
      const r = await fetch(`/api/zonas/candidatos?estado=${encodeURIComponent(f.estado)}&nombre=${encodeURIComponent(f.nombre)}`);
      const body = await r.json();
      if (seq !== editSeq.current) return;
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      const set = body as CandidateSet;
      const cands = [...(set.candidatos ?? [])]
        .sort((a, b) => b.pins_dentro - a.pins_dentro || b.parecido - a.parecido)
        .slice(0, 40);
      cache(cands);
      setEvidence({
        pins: set.pins ?? [],
        polys: cands.map((c) => ({ key: c.key, nombre: c.nombre, municipio: c.municipio, pins: c.pins_dentro, geom: c.geom })),
      });
      // frame on the evidence: the pins, plus polygons that hold one
      const pts: [number, number][] = [...(set.pins ?? [])];
      for (const c of cands)
        if (c.pins_dentro > 0) {
          const [w, so, e, n] = shapeOf(c.geom).bbox;
          pts.push([w, so], [e, n]);
        }
      frame(pts);
    } catch (e) {
      if (seq === editSeq.current) setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudieron cargar los candidatos." });
    } finally {
      if (seq === editSeq.current) setEditLoading(false);
    }
  }

  // A draft opens as a pre-filled edit: its colonias picked (or draw mode with
  // its pins as guide). If a zone with that name already exists, the draft's
  // colonias are ADDED to it so saving updates the zone instead of forking it.
  async function startPropuesta(p: Propuesta) {
    const seq = ++editSeq.current;
    setMsg(null);
    setFlash(null);
    setSelected(null);
    setPanelOpen(true);
    const pinsEv: Evidence = { pins: p.pins, polys: [] };
    if (p.tipo === "dibujar" || !p.n_miembros) {
      setEdit(blankEdit({ nombre: p.nombre, modo: "dibujo", drawing: true, propuesta: p }));
      setEvidence(pinsEv);
      frame(p.pins);
      return;
    }
    setEvidence(null);
    setEditLoading(true);
    setEdit(blankEdit({ nombre: p.nombre, propuesta: p }));
    try {
      const r = await fetch(`/api/zonas/propuestas/miembros?id=${p.id}`);
      const rows = await r.json();
      if (seq !== editSeq.current) return;
      if (!r.ok) throw new Error(rows?.error ?? `HTTP ${r.status}`);
      const members = rows as MapColonia[];
      cache(members);
      let next = blankEdit({
        nombre: p.nombre,
        picked: members.map((m) => m.key),
        geoms: Object.fromEntries(members.map((m) => [m.key, m])),
        propuesta: p,
      });
      if (p.existe && !p.existe.igual) {
        const r2 = await fetch(`/api/zonas/detalle?key=${encodeURIComponent(p.existe.key)}`);
        const det = (await r2.json()) as ZonaDetail;
        if (seq !== editSeq.current) return;
        if (r2.ok && !det.dibujada) {
          cache(det.miembros);
          const picked = Array.from(new Set([...det.miembros.map((m) => m.key), ...next.picked]));
          next = {
            ...next,
            key: det.key,
            kind: byKey.get(det.key)?.kind ?? null,
            nombre: zonaLabel(det.nombre),
            props: det.props,
            picked,
            geoms: { ...next.geoms, ...Object.fromEntries(det.miembros.map((m) => [m.key, m])) },
          };
        }
      }
      setEdit(next);
      setEvidence(pinsEv);
      const pts: [number, number][] = [...p.pins];
      for (const m of members) {
        const [w, so, e, n] = shapeOf(m.geom).bbox;
        pts.push([w, so], [e, n]);
      }
      frame(pts);
    } catch (e) {
      if (seq === editSeq.current) setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo cargar la propuesta." });
    } finally {
      if (seq === editSeq.current) setEditLoading(false);
    }
  }
  useEffect(() => {
    startPropRef.current = startPropuesta;
  });

  // The verdict of whatever is open in the editor (proposal or live zone).
  const editVerif = edit
    ? (edit.propuesta ? verifs.get(`p${edit.propuesta.id}`) : edit.key ? verifs.get(`z:${edit.key}`) : undefined) ?? null
    : null;

  // «Aplicar sugerencia»: load the verdict's sumar/quitar into the pick list.
  // Nothing is saved — the person reviews the list on the map and saves.
  async function applyVerif() {
    const v = editVerif;
    if (!v || !edit || edit.modo !== "miembros") return;
    const missing = v.sumar.map((c) => c.key).filter((k) => !geomCache.current.has(k));
    if (missing.length) {
      const r = await fetch(`/api/zonas/colonias-por-key?keys=${missing.join(",")}`);
      if (r.ok) cache((await r.json()) as MapColonia[]);
    }
    const quitar = new Set(v.quitar.map((c) => c.key));
    setEdit((e) => {
      if (!e || e.modo !== "miembros") return e;
      const geoms = { ...e.geoms };
      const picked = e.picked.filter((k) => !quitar.has(k));
      for (const k of quitar) delete geoms[k];
      for (const c of v.sumar) {
        const g = geomCache.current.get(c.key);
        if (g && !picked.includes(c.key)) {
          picked.push(c.key);
          geoms[c.key] = g;
        }
      }
      return { ...e, picked, geoms, verifId: v.id };
    });
  }

  // Google boxes: move their open requerimientos to what the verdict says they
  // meant (backed up per requerimiento, reversible from SQL).
  function replaceInRequests(oldKey: string, newKey: string, verifId: number) {
    startTransition(async () => {
      const res = await reemplazarZonaEnRequerimientos(oldKey, newKey);
      if (res.error) {
        setFlash(`No se pudo mover: ${res.error}`);
        return;
      }
      await marcarVerificacion(verifId, true);
      setFlash(`${res.movidos} requerimiento${res.movidos === 1 ? "" : "s"} movido${res.movidos === 1 ? "" : "s"} a la zona sugerida.`);
      setReloadTick((t) => t + 1);
    });
  }

  function discardPropuesta() {
    const p = edit?.propuesta;
    if (!p) return;
    startTransition(async () => {
      const res = await marcarPropuesta(p.id, "descartada", null);
      if (res.error) setMsg({ ok: false, text: res.error });
      else afterWrite(`Propuesta «${p.nombre}» descartada.`, null);
    });
  }

  function cancelEdit() {
    editSeq.current++;
    setEdit(null);
    setEvidence(null);
    setMsg(null);
    setEditLoading(false);
  }

  const plural = (n: number) => `${n} propiedad${n === 1 ? "" : "es"} re-asignada${n === 1 ? "" : "s"}`;
  function afterWrite(text: string, select: string | null) {
    setEdit(null);
    setEvidence(null);
    setMsg(null);
    setFlash(text);
    setSelected(select);
    setReloadTick((t) => t + 1);
  }

  function saveEdit() {
    const e = edit;
    if (!e || !estado) return;
    startTransition(async () => {
      let res: { error?: string; movidas?: number; key?: string };
      if (e.key === null) {
        res =
          e.modo === "dibujo" && e.ring
            ? await crearZonaDibujada(e.nombre, estado, e.ring)
            : await crearZona(e.nombre, estado, e.picked);
      } else {
        res =
          e.modo === "dibujo"
            ? e.ring
              ? await guardarZona(e.key, e.nombre, estado, { ring: e.ring })
              : { error: "El dibujo quedó vacío." }
            : e.picked.length
              ? await guardarZona(e.key, e.nombre, estado, { miembros: e.picked })
              : { error: "Una zona necesita al menos una colonia." };
      }
      if (res.error) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      const key = e.key ?? res.key ?? null;
      if (e.verifId) await marcarVerificacion(e.verifId, true);
      if (e.propuesta) {
        const m = await marcarPropuesta(e.propuesta.id, "aprobada", key);
        if (m.error) {
          setMsg({ ok: false, text: `La zona se guardó, pero la propuesta no se pudo cerrar: ${m.error}` });
          return;
        }
      }
      afterWrite(
        `${e.propuesta ? "Propuesta aprobada · " : ""}${e.key === null ? "Zona creada" : "Zona actualizada"} · ${plural(res.movidas ?? 0)}.`,
        key,
      );
    });
  }

  function deleteEdit() {
    const e = edit;
    if (!e?.key) return;
    const key = e.key;
    startTransition(async () => {
      const res = await borrarZona(key);
      if (res.error) setMsg({ ok: false, text: res.error });
      else afterWrite(`Zona borrada · ${plural(res.movidas ?? 0)}.`, null);
    });
  }

  function ignoreFailure() {
    const f = edit?.failure;
    if (!f) return;
    startTransition(async () => {
      const res = await ignorarNombre(f.estado, f.nombre);
      if (res.error) setMsg({ ok: false, text: res.error });
      else afterWrite(`«${f.nombre}» salió de la cola.`, null);
    });
  }

  // listings of the estado the zone would hold, as edited right now
  const cubre = useMemo(() => {
    if (!edit) return 0;
    const shps: ZoneShape[] =
      edit.modo === "dibujo"
        ? edit.ring
          ? [shapeOf({ type: "Polygon", coordinates: [edit.ring] })]
          : []
        : edit.picked.flatMap((k) => (edit.geoms[k] ? [shapeOf(edit.geoms[k].geom)] : []));
    if (!shps.length) return 0;
    return estadoListings.filter((l) => shps.some((sh) => contains(sh, l.lng, l.lat))).length;
  }, [edit, estadoListings]);

  // One map per visit.
  useEffect(() => {
    const el = mapEl.current;
    if (!el || !KEY) return;
    let cancelled = false;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => setAuthFail(true);
    setOptions({ key: KEY, v: "weekly", language: "es", region: "MX" });
    importLibrary("maps")
      .then(({ Map: GMap, InfoWindow }) => {
        if (cancelled) return;
        const m = new GMap(el, {
          center: { lat: 19.03, lng: -98.24 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        map.current = m;
        m.addListener("zoom_changed", () => setZoom(m.getZoom() ?? 11));
        outsideCl.current = new MarkerClusterer({ map: m, markers: [], renderer: outsideClusters });

        // Zones live in the map's own Data layer, styled from refs so a
        // selection or a layer toggle only restyles — never rebuilds.
        zoneTip.current = new InfoWindow({ disableAutoPan: true, headerDisabled: true });
        m.data.setStyle((f) => {
          const { kinds: k, selected: sel, hovered: hov, edit: ed } = zoneRef.current;
          const kind = f.getProperty("kind") as ZonaKind;
          const key = f.getProperty("key") as string;
          if (!k[kind]) return { visible: false };
          const base = ZONE_WEIGHT[kind];
          const color = f.getProperty("color") as string;
          // while editing, the other zones stay as faint context and let
          // clicks through; the one being edited is redrawn by the editor
          if (ed) {
            if (key === ed.key) return { visible: false };
            return {
              strokeColor: color, strokeWeight: 1, strokeOpacity: 0.6,
              fillColor: color, fillOpacity: 0.05,
              zIndex: f.getProperty("rank") as number, clickable: false,
            };
          }
          const isSel = key === sel;
          const isHov = key === hov;
          return {
            strokeColor: isSel ? "#111827" : color,
            strokeWeight: isSel ? base.w + 1.6 : isHov ? base.w + 1 : base.w,
            fillColor: color,
            fillOpacity: isSel ? Math.max(base.op, 0.3) : isHov ? base.op + 0.1 : base.op,
            zIndex: (f.getProperty("rank") as number) + (isSel ? 10000 : 0),
            clickable: true,
          };
        });
        const tip = (html: string, at: google.maps.LatLng | null) => {
          zoneTip.current?.setContent(`<div style="font:12px/1.4 system-ui;padding:2px 4px">${html}</div>`);
          if (at) zoneTip.current?.setPosition(at);
          zoneTip.current?.open({ map: m });
        };
        // Everything visible that contains a point, smallest first: a click
        // on «Lomas» inside «Angelópolis» means Lomas.
        const zonesAt = (ll: google.maps.LatLng) => {
          const { kinds: k, byKey: bk, shapes: shs } = zoneRef.current;
          const hits: MapZona[] = [];
          m.data.forEach((f) => {
            const z = bk.get(f.getProperty("key") as string);
            const sh = z && shs.get(z.key);
            if (z && sh && k[z.kind] && contains(sh, ll.lng(), ll.lat())) hits.push(z);
          });
          return hits.sort((a, b) => a.km2 - b.km2);
        };
        m.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
          const key = e.feature.getProperty("key") as string;
          setSelected((s) => (s === key ? null : key));
        });
        m.data.addListener("mouseover", (e: google.maps.Data.MouseEvent) => {
          if (zoneRef.current.edit) return;
          const key = e.feature.getProperty("key") as string;
          const z = zoneRef.current.byKey.get(key);
          if (!z) return;
          setHovered(key);
          tip(`<b>${esc(zonaLabel(z.nombre))}</b><br><span style="color:#737373">${esc(KIND_LABEL[z.kind].title)} · ${esc(z.municipio)}</span>`, e.latLng);
        });
        m.data.addListener("mouseout", () => {
          setHovered(null);
          zoneTip.current?.close();
        });

        // INEGI outlines: a second Data layer on top, fetched per viewport.
        // Outside the editor, clicks fall through to the smallest zone there.
        const col = new google.maps.Data({ map: m });
        col.setStyle((f) => {
          const ed = zoneRef.current.edit;
          // amber = the name repeats in the estado (needs the municipio)
          const repeats = ((f.getProperty("homonimos") as number | undefined) ?? 1) > 1;
          return {
            strokeColor: repeats && !ed ? "#d97706" : "#404040",
            strokeOpacity: ed ? 0.8 : repeats ? 0.85 : 0.55,
            strokeWeight: ed ? 1 : 0.8,
            fillColor: "#1c4588",
            fillOpacity: 0,
            zIndex: 20000,
            // drawing: clicks must reach the map to become vertices
            clickable: !ed || ed.modo === "miembros",
          };
        });
        col.addListener("mouseover", (e: google.maps.Data.MouseEvent) => {
          const ll = e.latLng;
          const ed = zoneRef.current.edit;
          col.overrideStyle(e.feature, { strokeWeight: 2, strokeOpacity: 0.9, fillOpacity: ed ? 0.12 : 0 });
          const nombre = esc(zonaLabel(e.feature.getProperty("nombre") as string));
          const mun = esc(e.feature.getProperty("municipio") as string);
          if (ed) {
            const on = ed.picked.includes(e.feature.getProperty("key") as string);
            tip(`<b>${nombre}</b><br><span style="color:#737373">${mun} · click para ${on ? "quitar" : "sumar"}</span>`, ll);
            return;
          }
          // A colonia is a valid place on its own: what matters is whether its
          // name alone gets there, or repeats elsewhere in the estado and needs
          // the municipio (that is where a zone can help). «Sin zona» made
          // correct colonias like La Vista Country look broken.
          const inZ = ll ? zonesAt(ll).map((z) => esc(zonaLabel(z.nombre))) : [];
          const h = (e.feature.getProperty("homonimos") as number | undefined) ?? 1;
          const estadoTxt =
            h > 1
              ? `<span style="color:#b45309">⚠ Hay ${h} colonias con este nombre en el estado: sólo se reconoce con el municipio</span>`
              : `<span style="color:#15803d">✓ Se reconoce por su nombre</span>`;
          tip(
            `<b>${nombre}</b> <span style="color:#737373">· colonia INEGI</span><br><span style="color:#737373">${mun}</span>` +
              `<br>${estadoTxt}` +
              (inZ.length ? `<br>Dentro de: <b>${inZ.join(" › ")}</b>` : ""),
            ll,
          );
        });
        col.addListener("mouseout", (e: google.maps.Data.MouseEvent) => {
          col.revertStyle(e.feature);
          zoneTip.current?.close();
        });
        col.addListener("click", (e: google.maps.Data.MouseEvent) => {
          if (zoneRef.current.edit?.modo === "miembros") {
            zoneRef.current.toggle(e.feature.getProperty("key") as string);
            return;
          }
          const hit = e.latLng ? zonesAt(e.latLng)[0] : undefined;
          setSelected(hit ? hit.key : null);
        });
        coloniaLayer.current = col;

        // Draft zones: violet outlines under the INEGI lines, only while the
        // «Propuestas» tab is open. A click opens the draft in the editor.
        const prop = new google.maps.Data();
        prop.setStyle({ strokeColor: PROPUESTA, strokeWeight: 2, strokeOpacity: 0.9, fillColor: PROPUESTA, fillOpacity: 0.1, zIndex: 15000 });
        prop.addListener("mouseover", (e: google.maps.Data.MouseEvent) => {
          prop.overrideStyle(e.feature, { fillOpacity: 0.25, strokeWeight: 3 });
          const p = propById.current.get(e.feature.getProperty("id") as number);
          if (p) tip(`<b>${esc(p.nombre)}</b> <span style="color:${PROPUESTA}">· propuesta</span><br><span style="color:#737373">${p.total} menciones · click para revisarla</span>`, e.latLng);
        });
        prop.addListener("mouseout", (e: google.maps.Data.MouseEvent) => {
          prop.revertStyle(e.feature);
          zoneTip.current?.close();
        });
        prop.addListener("click", (e: google.maps.Data.MouseEvent) => {
          const p = propById.current.get(e.feature.getProperty("id") as number);
          if (p) startPropRef.current(p);
        });
        propLayer.current = prop;
        let loadedBox: google.maps.LatLngBounds | null = null;
        let loadedEstado = "";
        let seq = 0;
        m.addListener("idle", () => {
          const { showColonias: on, estado: est } = zoneRef.current;
          if (!on || !est) return;
          if ((m.getZoom() ?? 0) < COLONIAS_ZOOM) {
            setColoniasNote("Acerca el mapa para verlas");
            return;
          }
          const b = m.getBounds();
          if (!b) return;
          if (loadedBox && loadedEstado === est && loadedBox.contains(b.getNorthEast()) && loadedBox.contains(b.getSouthWest())) return;
          // fetch a margin around the view so small pans don't refetch
          const ne = b.getNorthEast(), sw = b.getSouthWest();
          const dLat = (ne.lat() - sw.lat()) * 0.5, dLng = (ne.lng() - sw.lng()) * 0.5;
          const box = new google.maps.LatLngBounds(
            { lat: sw.lat() - dLat, lng: sw.lng() - dLng },
            { lat: ne.lat() + dLat, lng: ne.lng() + dLng },
          );
          const mine = ++seq;
          setColoniasNote("Cargando…");
          const bbox = [box.getSouthWest().lng(), box.getSouthWest().lat(), box.getNorthEast().lng(), box.getNorthEast().lat()].map((v) => v.toFixed(5)).join(",");
          fetch(`/api/zonas/colonias?estado=${encodeURIComponent(est)}&bbox=${bbox}`)
            .then(async (r) => {
              const body = await r.json();
              if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
              return body as MapColonia[];
            })
            .then((rows) => {
              if (mine !== seq) return;
              col.forEach((f) => col.remove(f));
              for (const c of rows) {
                col.addGeoJson({
                  type: "Feature",
                  geometry: c.geom,
                  properties: { key: c.key, nombre: c.nombre, municipio: c.municipio, homonimos: c.homonimos ?? 1 },
                });
                geomCache.current.set(c.key, { nombre: c.nombre, municipio: c.municipio, geom: c.geom });
              }
              loadedBox = box;
              loadedEstado = est;
              setColoniasNote(`${rows.length.toLocaleString("en-US")} a la vista${rows.length >= 1500 ? " (tope; acerca más)" : ""}`);
            })
            .catch((e) => {
              if (mine === seq) setColoniasNote(e instanceof Error ? e.message : "Error");
            });
        });
        // forget the cache when the layer is switched off or the estado changes
        coloniaReset.current = () => {
          seq++;
          loadedBox = null;
          col.forEach((f) => col.remove(f));
        };
        setReady(true);
      })
      .catch(() => setAuthFail(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    zoneRef.current = { ...zoneRef.current, kinds, selected, hovered, estado, showColonias: coloniasOn, byKey, shapes, edit };
  }, [kinds, selected, hovered, estado, coloniasOn, byKey, shapes, edit]);

  // Paint the estado's zones: biggest first so nested ones sit on top.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.data.forEach((f) => m.data.remove(f));
    zoneLabels.current.forEach(({ marker }) => marker.setMap(null));
    zoneLabels.current.clear();
    zoneTip.current?.close();
    const ordered = [...(zonas ?? [])].sort((a, b) => b.km2 - a.km2);
    ordered.forEach((z, rank) => {
      m.data.addGeoJson({
        type: "Feature",
        geometry: z.geom,
        properties: { key: z.key, kind: z.kind, color: zoneColor(z), rank },
      });
      const at = labelPoint(shapes.get(z.key)!);
      if (!at) return;
      const marker = new google.maps.Marker({
        position: at,
        clickable: false,
        zIndex: z.kind === "curada" ? 3 : z.kind === "familia" ? 2 : 1,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        label: {
          text: zonaLabel(z.nombre),
          className: "zone-label",
          color: z.kind === "google" ? "#525252" : "#111827",
          fontSize: z.kind === "curada" ? "13px" : "11px",
          fontWeight: z.kind === "curada" ? "700" : "600",
        },
      });
      zoneLabels.current.set(z.key, { marker, kind: z.kind });
    });
    // First load of an estado frames its named zones — not Google's (they can
    // span 1,000+ km²) and not the municipio-wide ones (San Martín Texmelucan,
    // Atlixco…): those pulled the view out until Puebla was a speck.
    if (zonas && framedEstado.current !== estado) {
      framedEstado.current = estado;
      const pts: [number, number][] = [];
      for (const z of zonas)
        if (z.kind !== "google" && z.km2 <= 30) {
          const [w, so, e, n] = shapes.get(z.key)!.bbox;
          pts.push([w, so], [e, n]);
        }
      frame(pts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shapes derives from zonas
  }, [ready, zonas]);

  // Restyle (no rebuild) on toggles / selection / hover; names by zoom.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.data.setStyle(m.data.getStyle() as google.maps.Data.StylingFunction);
    const col = coloniaLayer.current;
    col?.setStyle(col.getStyle() as google.maps.Data.StylingFunction);
    for (const [key, { marker, kind }] of zoneLabels.current) {
      const on = kinds[kind] && key !== edit?.key && (zoom >= LABEL_ZOOM[kind] || key === selected);
      if (on !== (marker.getMap() != null)) marker.setMap(on ? m : null);
    }
  }, [ready, kinds, selected, hovered, zoom, zonas, edit]);

  // Selecting a zone (map, list, or a link in its card) frames it.
  useEffect(() => {
    const m = map.current;
    const sh = selected ? shapes.get(selected) : null;
    if (!ready || !m || !sh) return;
    const [w, so, e, n] = sh.bbox;
    m.fitBounds({ west: w, south: so, east: e, north: n }, 60);
    google.maps.event.addListenerOnce(m, "idle", () => {
      if ((m.getZoom() ?? 0) > 16) m.setZoom(16);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selected, ready]);

  // INEGI outlines: switching on (or a new estado) loads the current view.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    coloniaReset.current?.();
    if (coloniasOn) google.maps.event.trigger(m, "idle");
  }, [ready, coloniasOn, estado]);

  // Pending drafts on the map while their tab is open (hidden during an edit).
  useEffect(() => {
    const m = map.current;
    const prop = propLayer.current;
    if (!ready || !m || !prop) return;
    prop.forEach((f) => prop.remove(f));
    propById.current = new Map((propuestas ?? []).map((p) => [p.id, p]));
    const show = tab === "propuestas" && !edit;
    prop.setMap(show ? m : null);
    if (!show) return;
    // biggest first so the small ones stay clickable on top
    const pend = (propuestas ?? []).filter((p) => p.revision === "pendiente" && p.geom);
    for (const p of pend.sort((a, b) => b.n_miembros - a.n_miembros))
      prop.addGeoJson({ type: "Feature", geometry: p.geom!, properties: { id: p.id } });
  }, [ready, propuestas, tab, edit]);

  // «Propiedades por ubicar»: the only listing pins this page ever shows.
  useEffect(() => {
    const cl = outsideCl.current;
    const m = map.current;
    if (!ready || !cl || !m) return;
    cl.clearMarkers(true);
    if (!fuera || !porUbicar) return;
    cl.addMarkers(
      porUbicar
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => {
          const mk = new google.maps.Marker({ position: { lat: p.lat!, lng: p.lng! }, icon: OUTSIDE_PIN(), title: p.name ?? "" });
          mk.addListener("click", () => {
            zoneTip.current?.setContent(
              `<div style="font:12px/1.4 system-ui;padding:2px 4px;max-width:240px"><b>${esc(p.name) || "Sin título"}</b><br>` +
                `<span style="color:#737373">${esc(p.address) || "sin dirección"}</span><br>` +
                `<a href="/broker/${p.user_id}" style="color:#1c4588">${esc(p.owner) || "Ver asesor"} →</a></div>`,
            );
            zoneTip.current?.setPosition({ lat: p.lat!, lng: p.lng! });
            zoneTip.current?.open({ map: m });
          });
          return mk;
        }),
    );
  }, [ready, fuera, porUbicar]);

  // «Ver en el mapa» from the list: street level, pins on.
  const focusPoint = (lat: number, lng: number) => {
    const m = map.current;
    if (!m) return;
    setFuera(true);
    setPanelOpen(false);
    m.panTo({ lat, lng });
    m.setZoom(17);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <PillTray>
            <PillSelect
              value={estado}
              onChange={changeEstado}
              ariaLabel="Estado"
              options={[["", "Elige un estado"], ...states.map((s) => [s, s] as [string, string])]}
            />
          </PillTray>
          {zonas ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {(["curada", "familia", "google"] as ZonaKind[]).map((k) => (
                <LayerPill
                  key={k}
                  on={kinds[k]}
                  onClick={() => setKinds((v) => ({ ...v, [k]: !v[k] }))}
                  label={k === "curada" ? "A mano" : k === "familia" ? "Automáticas" : "Google"}
                  count={zonas.filter((z) => z.kind === k).length}
                  title={`${KIND_LABEL[k].title}: ${KIND_LABEL[k].hint}`}
                  swatch={<KindSwatch kind={k} />}
                />
              ))}
              <LayerPill
                on={showColonias}
                onClick={() => setShowColonias((v) => !v)}
                label="Colonias INEGI"
                note={coloniasNote}
                title="Los polígonos oficiales de lo que está a la vista. Gris = se reconoce por su nombre; ámbar = el nombre se repite en el estado."
                swatch={<span className="inline-block h-3 w-3 rounded-sm border border-dashed border-neutral-500" />}
              />
              <LayerPill
                on={fuera}
                onClick={() => setFuera((v) => !v)}
                label="Por ubicar"
                count={porUbicar?.filter((p) => p.lat != null).length ?? 0}
                title="Propiedades con pin cuya ubicación necesita revisión, en rojo. La lista completa está en la pestaña «Por ubicar»."
                swatch={<span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-600" />}
              />
            </div>
          ) : null}
        </div>
        {zonas ? (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-brand px-3.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90"
          >
            <span aria-hidden>＋</span> Nueva zona
          </button>
        ) : null}
      </Toolbar>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex-1">
          <div ref={mapEl} className="absolute inset-0" />
          {ready ? (
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="absolute right-3 top-3 z-10 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-800 shadow-sm lg:hidden"
            >
              {panelOpen ? "Cerrar panel" : `Zonas${zonas ? ` · ${zonas.length}` : ""}`}
            </button>
          ) : null}
          {ready && zonas ? (
            <div className="pointer-events-none absolute bottom-6 left-3 z-10 rounded-xl border border-black/[0.06] bg-white/95 px-3 py-2 text-[11px] leading-5 text-neutral-600 shadow-sm backdrop-blur">
              {kinds.curada ? (
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm border-2 border-blue-600 bg-blue-600/25" /> Zona hecha a mano</div>
              ) : null}
              {kinds.familia ? (
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm border border-cyan-600 bg-cyan-600/10" /> Zona automática</div>
              ) : null}
              {kinds.google ? (
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm border border-neutral-400 bg-neutral-400/10" /> De Google · sin revisar</div>
              ) : null}
              {tab === "propuestas" && !edit ? (
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm border-2 border-violet-600 bg-violet-600/10" /> Propuesta</div>
              ) : null}
              {coloniasOn ? (
                <>
                  <div className="flex items-center gap-2"><span className="inline-block h-0 w-4 border-t border-neutral-600" /> Colonia INEGI</div>
                  <div className="flex items-center gap-2"><span className="inline-block h-0 w-4 border-t-2 border-amber-600" /> Nombre repetido en el estado</div>
                </>
              ) : null}
              {fuera ? (
                <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-600" /> Propiedad por ubicar</div>
              ) : null}
            </div>
          ) : null}
          {!KEY || authFail ? (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 p-8 text-center text-sm text-neutral-600">
              El mapa necesita la llave de Google Maps del navegador (
              <code className="rounded bg-neutral-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>), restringida por
              referrer a admin.propia.dev y localhost:3000.
            </div>
          ) : !ready ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">Cargando mapa…</div>
          ) : null}
        </div>
        <div
          className={`${panelOpen ? "absolute inset-y-0 right-0 z-20 flex w-[min(400px,100%)] shadow-xl" : "hidden"} lg:static lg:flex lg:w-[400px] lg:shadow-none`}
        >
          <ZonasPanel
            estado={estado}
            zonas={zonas}
            loading={zLoading}
            error={zError}
            kinds={kinds}
            colorOf={zoneColor}
            counts={counts}
            coverage={{ total: estadoListings.length, dentro: estadoListings.length - outside.length }}
            selected={selected}
            onSelect={setSelected}
            onHover={setHovered}
            pendientes={pendientes}
            onEdit={startEdit}
            onFailure={startFailure}
            flash={flash}
            tab={tab}
            onTab={setTab}
            propuestas={propuestas}
            onPropuesta={startPropuesta}
            porUbicar={porUbicar}
            onFocusPoint={focusPoint}
            verifs={verifs}
            onReplace={replaceInRequests}
            pending={pending}
            editor={
              edit ? (
                <ZonaEditor
                  edit={edit}
                  cubre={cubre}
                  evidence={evidence}
                  loading={editLoading}
                  pending={pending}
                  msg={msg}
                  onNombre={(v) => setEdit((e) => (e ? { ...e, nombre: v } : e))}
                  onModo={(m) => setEdit((e) => (e ? { ...e, modo: m, drawing: m === "dibujo" && !e.ring } : e))}
                  onDraw={() => setEdit((e) => (e ? { ...e, drawing: true, ring: null } : e))}
                  onDiscardDrawing={() => {
                    editor.discardDrawing();
                    setEdit((e) => (e ? { ...e, drawing: false, ring: null } : e));
                  }}
                  onToggle={toggleMember}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  onDelete={deleteEdit}
                  onIgnore={ignoreFailure}
                  onDiscardPropuesta={discardPropuesta}
                  verif={editVerif}
                  onApplyVerif={applyVerif}
                />
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
