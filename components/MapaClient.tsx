"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Cluster } from "@googlemaps/markerclusterer";
import type { MapData, MapListing, MapRequest, MapWaDemand } from "@/lib/mapa";
import type { MapColonia, MapZona, ZonaKind } from "@/lib/mapaZonas";
import { contains, shapeOf, type ZoneShape } from "@/lib/geoContains";
import { FilterChip, PillSegment, PillSelect, PillTray, Toolbar, ToolbarDivider } from "@/components/Pills";
import { ZonasPanel, zonaLabel, KIND_LABEL, type ZoneCounts } from "@/components/ZonasPanel";
import { ZonaEditor, type EditState } from "@/components/ZonaEditor";
import { useZonaEditor, type Evidence, type Ring } from "@/components/useZonaEditor";
import { borrarZona, crearZona, crearZonaDibujada, guardarZona, ignorarNombre } from "@/app/actions";
import type { CandidateSet, Failure, ZonaDetail } from "@/lib/zonas";
import type { Geo } from "@/lib/mapaZonas";

// Browser Maps key (NEXT_PUBLIC_GOOGLE_MAPS_KEY, referrer-locked). The map is
// created ONCE; filters only swap markers in and out of the clusterer, so a
// visit costs one map load however much Pablo plays with the filters.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

const COLOR = { venta: "#1c4588", renta: "#0f766e", req: "#b45309", wa: "#6d28d9" };
// «Mapa de zonas» (fase 1, Franz 2026-09-23): every zone of the estado painted
// under the pins. Neighbouring zones need to read apart, so each named zone
// gets its own hue (stable per key); Google-derived ones stay one quiet grey
// until someone reviews them. Kind is carried by weight: hand-made zones are
// bold, automatic families lighter.
const ZONE_PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488"];
const GOOGLE_GREY = "#737373";
const OUTSIDE = "#e11d48";
const ZONE_WEIGHT: Record<ZonaKind, { w: number; op: number }> = {
  curada: { w: 2.6, op: 0.22 },
  familia: { w: 1.6, op: 0.12 },
  google: { w: 1, op: 0.05 },
};
// Labels appear as you zoom in, most important first.
const LABEL_ZOOM: Record<ZonaKind, number> = { curada: 11, familia: 12, google: 14 };
// INEGI outlines only from street-ish zoom: at city level 3,000 of them are ink.
const COLONIAS_ZOOM = 13;
// outer ring of the first polygon — what the boundary editor works on
function ringOfGeom(g: Geo): Ring {
  if (g.type === "Polygon") return (g.coordinates as Ring[])[0] ?? [];
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][])[0]?.[0] ?? [];
  return [];
}
function hueOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ZONE_PALETTE[h % ZONE_PALETTE.length];
}
const zoneColor = (z: MapZona) => (z.kind === "google" ? GOOGLE_GREY : hueOf(z.key));
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
const TYPE_LABEL: Record<string, string> = {
  casa: "Casa", departamento: "Depto", terreno: "Terreno", oficina: "Oficina",
  local: "Local", bodega: "Bodega", nave: "Nave",
};
const money = (n: number | null, c: string | null) =>
  n == null ? "Precio a consultar" : `$${Math.round(n).toLocaleString("en-US")} ${c ?? "MXN"}`;
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

// Pin SVGs: filled = exact point, hollow = placed at the colonia's centroid.
// Cached: «Fuera de zona» re-colours up to ~2,000 pins per toggle.
const pinCache = new Map<string, google.maps.Icon>();
function pinIcon(color: string, precise: boolean, shape: "circle" | "diamond"): google.maps.Icon {
  const k = `${color}|${precise}|${shape}`;
  let icon = pinCache.get(k);
  if (!icon) pinCache.set(k, (icon = buildPin(color, precise, shape)));
  return icon;
}
function buildPin(color: string, precise: boolean, shape: "circle" | "diamond"): google.maps.Icon {
  const fill = precise ? color : "#ffffff";
  const body =
    shape === "circle"
      ? `<circle cx="9" cy="9" r="6.5" fill="${fill}" stroke="${color}" stroke-width="2.5"/>`
      : `<path d="M9 1.5 L16.5 9 L9 16.5 L1.5 9 Z" fill="${fill}" stroke="${color}" stroke-width="2.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">${body}</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(18, 18),
    anchor: new google.maps.Point(9, 9),
  };
}

// Cluster bubbles as CLASSIC markers. The clusterer's default renderer picks
// Advanced Markers whenever google.maps.marker is loaded, and those need a
// Map ID — without one Google logs «inicializado sin un ID de mapa válido» per
// bubble and throws up the «no puede cargar Google Maps» dialog (seen when
// arriving from Zonas, where the marker library was already in memory).
const clusterRenderer = clusterRendererFor("#1c4588");
// WhatsApp demands cluster on their own, in their own colour, so a violet
// bubble always means «asks from the groups», never a mix with properties.
const waClusterRenderer = clusterRendererFor(COLOR.wa);
function clusterRendererFor(color: string) {
  return {
  render({ count, position }: Cluster): google.maps.Marker {
    const size = count < 10 ? 34 : count < 100 ? 40 : 48;
    const r = size / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 2}" fill="${color}" fill-opacity="0.88" stroke="#ffffff" stroke-width="2"/></svg>`;
    return new google.maps.Marker({
      position,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(size, size),
        anchor: new google.maps.Point(r, r),
      },
      label: { text: String(count), color: "#ffffff", fontSize: "12px", fontWeight: "600" },
      zIndex: 1000 + count,
    });
  },
  };
}

// WhatsApp glyph (simple-icons), drawn in the layer's colour: the label and the
// popup say «from the groups» with the logo, not the word.
const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";
function WaGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={COLOR.wa} aria-label="WhatsApp" role="img">
      <path d={WA_PATH} />
    </svg>
  );
}
const waGlyphHtml = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${COLOR.wa}" style="vertical-align:-2px" aria-label="WhatsApp" role="img"><path d="${WA_PATH}"/></svg>`;

type Op = "todas" | "venta" | "renta";
type Layer = "listings" | "requests" | "wa";

export function MapaClient({ data }: { data: MapData }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const clusterer = useRef<MarkerClusterer | null>(null);
  const waClusterer = useRef<MarkerClusterer | null>(null);
  const listingMarkers = useRef<Map<string, google.maps.Marker>>(new Map());
  const waMarkers = useRef<Map<string, google.maps.Marker>>(new Map());
  const requestMarkers = useRef<Map<string, { marker: google.maps.Marker; circle: google.maps.Circle | null }>>(new Map());
  // zones: the map's own Data layer; INEGI outlines: a second Data layer on top
  const coloniaLayer = useRef<google.maps.Data | null>(null);
  const zoneTip = useRef<google.maps.InfoWindow | null>(null);
  const zoneLabels = useRef<Map<string, { marker: google.maps.Marker; kind: ZonaKind }>>(new Map());
  const coloniaReset = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [authFail, setAuthFail] = useState(false);
  // Google reports the reason only in the console («… error: XxxMapError»).
  // Mirror it into the page so a screenshot of the failure names the cause.
  const [gError, setGError] = useState<string | null>(null);
  // Radius circles only from zoom 12 up: at city level 276 overlapping
  // circles were one orange blob; the diamonds already say where demand is.
  const [zoom, setZoom] = useState(11);

  const [estado, setEstado] = useState<string>(data.states.includes("Puebla") ? "Puebla" : (data.states[0] ?? ""));
  const [op, setOp] = useState<Op>("todas");
  const [tipo, setTipo] = useState<string>("todos");
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ listings: true, requests: true, wa: true });
  const [onlyPrecise, setOnlyPrecise] = useState(false);
  // «Sólo Pablo y yo»: the two test accounts, every estado (their pins are
  // the ones they just uploaded, wherever they put them).
  const [testOnly, setTestOnly] = useState(false);
  const testOwners = useMemo(() => new Set(data.testOwnerIds), [data.testOwnerIds]);

  const tipos = useMemo(
    () => Array.from(new Set(data.listings.map((l) => l.type))).sort(),
    [data.listings],
  );

  const shownListings = useMemo(
    () =>
      data.listings.filter(
        (l) =>
          (!testOnly || testOwners.has(l.user_id)) &&
          (!estado || testOnly || l.state === estado) &&
          (op === "todas" || l.transaction === op) &&
          (tipo === "todos" || l.type === tipo) &&
          (!onlyPrecise || l.precise),
      ),
    [data.listings, estado, op, tipo, onlyPrecise, testOnly, testOwners],
  );
  const shownRequests = useMemo(
    () =>
      data.requests.filter(
        (r) =>
          (!testOnly || testOwners.has(r.created_by)) &&
          (!estado || testOnly || (r.states ?? []).includes(estado)) &&
          (op === "todas" || r.transaction === op) &&
          (tipo === "todos" || (r.types ?? []).length === 0 || (r.types ?? []).includes(tipo)) &&
          (!onlyPrecise || r.precise),
      ),
    [data.requests, estado, op, tipo, onlyPrecise, testOnly, testOwners],
  );

  // WhatsApp demands have no app owner: in «Sólo Pablo y yo» the ones we
  // posted from our own phones stand in for ownership.
  const testPhones = useMemo(() => new Set(data.testPhones), [data.testPhones]);
  const shownWa = useMemo(
    () =>
      data.waDemands.filter(
        (w) =>
          (!testOnly || (!!w.sender_phone10 && testPhones.has(w.sender_phone10))) &&
          (!estado || testOnly || w.state === estado) &&
          (op === "todas" || w.operation === op) &&
          (tipo === "todos" || !w.property_type || w.property_type === tipo) &&
          (!onlyPrecise || w.precise),
      ),
    [data.waDemands, estado, op, tipo, onlyPrecise, testOnly, testPhones],
  );

  // ── Zonas ────────────────────────────────────────────────────────────────
  const [zonas, setZonas] = useState<MapZona[] | null>(null);
  const [zLoading, setZLoading] = useState(!!estado);
  const [zError, setZError] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Record<ZonaKind, boolean>>({ curada: true, familia: true, google: false });
  const [showColonias, setShowColonias] = useState(false);
  const [coloniasNote, setColoniasNote] = useState<string | null>(null);
  const [fuera, setFuera] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // below lg only

  // ── Edición (fase 2): the Zonas bench, on this map ───────────────────────
  const [edit, setEdit] = useState<EditState | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reloadTick, setReloadTick] = useState(0);
  const [pendientes, setPendientes] = useState<Failure[] | null>(null);
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
    setFlash(null);
  };
  useEffect(() => {
    if (!estado) return;
    const ac = new AbortController();
    fetch(`/api/mapa/zonas?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
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
    fetch(`/api/mapa/pendientes?estado=${encodeURIComponent(estado)}&t=${reloadTick}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Failure[]) => setPendientes(rows))
      .catch(() => {
        if (!ac.signal.aborted) setPendientes([]);
      });
    return () => ac.abort();
  }, [estado, reloadTick]);

  const shapes = useMemo(() => new Map((zonas ?? []).map((z) => [z.key, shapeOf(z.geom)])), [zonas]);
  const byKey = useMemo(() => new Map((zonas ?? []).map((z) => [z.key, z])), [zonas]);

  // What each zone holds, and which listings sit in no visible zone. Counted
  // against the pins the filters leave on the map, so the panel never
  // disagrees with what you can see.
  const { counts, outside } = useMemo(() => {
    const counts = new Map<string, ZoneCounts>();
    const outside = new Set<string>();
    if (!zonas) return { counts, outside };
    const list = zonas.map((z) => ({ z, sh: shapes.get(z.key)! }));
    for (const { z } of list) counts.set(z.key, { props: 0, reqs: 0 });
    for (const l of shownListings) {
      let covered = false;
      for (const { z, sh } of list)
        if (contains(sh, l.lng, l.lat)) {
          counts.get(z.key)!.props++;
          if (kinds[z.kind]) covered = true;
        }
      if (!covered) outside.add(l.id);
    }
    for (const p of [...shownRequests, ...shownWa])
      for (const { z, sh } of list) if (contains(sh, p.lng, p.lat)) counts.get(z.key)!.reqs++;
    return { counts, outside };
  }, [zonas, shapes, shownListings, shownRequests, shownWa, kinds]);

  const listingById = useMemo(() => new Map(data.listings.map((l) => [l.id, l])), [data.listings]);

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
    drawing: false, seed: null, failure: null, props: 0, ...over,
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
      if (res.error) setMsg({ ok: false, text: res.error });
      else
        afterWrite(
          `${e.key === null ? "Zona creada" : "Zona actualizada"} · ${plural(res.movidas ?? 0)}.`,
          e.key ?? res.key ?? null,
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

  // listings on the map the zone would hold, as edited right now
  const cubre = useMemo(() => {
    if (!edit) return 0;
    const shps: ZoneShape[] =
      edit.modo === "dibujo"
        ? edit.ring
          ? [shapeOf({ type: "Polygon", coordinates: [edit.ring] })]
          : []
        : edit.picked.flatMap((k) => (edit.geoms[k] ? [shapeOf(edit.geoms[k].geom)] : []));
    if (!shps.length) return 0;
    return shownListings.filter((l) => shps.some((sh) => contains(sh, l.lng, l.lat))).length;
  }, [edit, shownListings]);

  // One map per visit.
  useEffect(() => {
    const el = mapEl.current;
    if (!el || !KEY) return;
    let cancelled = false;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => setAuthFail(true);
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map(String).join(" ");
      const m = /Google Maps JavaScript API error:\s*(\w+)/.exec(text);
      if (m) setGError(m[1]);
      origError.apply(console, args);
    };
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
        info.current = new InfoWindow({ maxWidth: 300 });
        clusterer.current = new MarkerClusterer({ map: m, markers: [], renderer: clusterRenderer });
        waClusterer.current = new MarkerClusterer({ map: m, markers: [], renderer: waClusterRenderer });

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
          const { kinds: k, byKey: bk } = zoneRef.current;
          const hits: MapZona[] = [];
          m.data.forEach((f) => {
            const z = bk.get(f.getProperty("key") as string);
            const sh = z && zoneRef.current.shapes.get(z.key);
            if (z && sh && k[z.kind] && contains(sh, ll.lng(), ll.lat())) hits.push(z);
          });
          return hits.sort((a, b) => a.km2 - b.km2);
        };
        m.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
          info.current?.close();
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
        // Clicks fall through to the smallest zone under the point.
        const col = new google.maps.Data({ map: m });
        col.setStyle(() => {
          const ed = zoneRef.current.edit;
          return {
            strokeColor: "#404040",
            strokeOpacity: ed ? 0.8 : 0.55,
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
          const inZ = ll ? zonesAt(ll).map((z) => esc(zonaLabel(z.nombre))) : [];
          const ed = zoneRef.current.edit;
          col.overrideStyle(e.feature, { strokeWeight: 2, strokeOpacity: 0.9, fillOpacity: ed ? 0.12 : 0 });
          if (ed) {
            const on = ed.picked.includes(e.feature.getProperty("key") as string);
            tip(
              `<b>${esc(zonaLabel(e.feature.getProperty("nombre") as string))}</b><br>` +
                `<span style="color:#737373">${esc(e.feature.getProperty("municipio") as string)} · click para ${on ? "quitar" : "sumar"}</span>`,
              ll,
            );
            return;
          }
          tip(
            `<b>${esc(zonaLabel(e.feature.getProperty("nombre") as string))}</b> <span style="color:#737373">· colonia INEGI</span><br>` +
              `<span style="color:#737373">${esc(e.feature.getProperty("municipio") as string)}</span>` +
              (inZ.length ? `<br>En zona: <b>${inZ.join(" › ")}</b>` : `<br><span style="color:${OUTSIDE}">Sin zona</span>`),
            ll,
          );
        });
        col.addListener("mouseout", (e: google.maps.Data.MouseEvent) => {
          col.revertStyle(e.feature);
          zoneTip.current?.close();
        });
        col.addListener("click", (e: google.maps.Data.MouseEvent) => {
          info.current?.close();
          if (zoneRef.current.edit?.modo === "miembros") {
            zoneRef.current.toggle(e.feature.getProperty("key") as string);
            return;
          }
          const hit = e.latLng ? zonesAt(e.latLng)[0] : undefined;
          setSelected(hit ? hit.key : null);
        });
        coloniaLayer.current = col;
        let loadedBox: google.maps.LatLngBounds | null = null;
        let loadedEstado = "";
        let seq = 0;
        m.addListener("idle", () => {
          const { showColonias: on, estado: est } = zoneRef.current;
          const z = m.getZoom() ?? 0;
          if (!on || !est) return;
          if (z < COLONIAS_ZOOM) {
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
          fetch(`/api/mapa/colonias?estado=${encodeURIComponent(est)}&bbox=${bbox}`)
            .then(async (r) => {
              const body = await r.json();
              if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
              return body as MapColonia[];
            })
            .then((rows) => {
              if (mine !== seq) return;
              col.forEach((f) => col.remove(f));
              for (const c of rows) {
                col.addGeoJson({ type: "Feature", geometry: c.geom, properties: { key: c.key, nombre: c.nombre, municipio: c.municipio } });
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

        // Build every marker once; filters attach/detach them.
        for (const l of data.listings) {
          const marker = new google.maps.Marker({
            position: { lat: l.lat, lng: l.lng },
            icon: pinIcon(COLOR[l.transaction], l.precise, "circle"),
            title: l.name ?? "",
          });
          marker.addListener("click", () => {
            info.current?.setContent(listingCard(l));
            info.current?.open({ map: m, anchor: marker });
          });
          listingMarkers.current.set(l.id, marker);
        }
        for (const r of data.requests) {
          const marker = new google.maps.Marker({
            position: { lat: r.lat, lng: r.lng },
            icon: pinIcon(COLOR.req, r.precise, "diamond"),
            title: r.title ?? "",
            zIndex: 10,
          });
          // The circle is the requerimiento's real search radius; zona-only
          // rows get none (the zona polygon is the truth, phase 2).
          const circle = r.precise
            ? new google.maps.Circle({
                center: { lat: r.lat, lng: r.lng },
                radius: (r.radius_km ?? 0.5) * 1000,
                strokeColor: COLOR.req,
                strokeOpacity: 0.7,
                strokeWeight: 1.2,
                fillColor: COLOR.req,
                fillOpacity: 0.08,
                clickable: false,
              })
            : null;
          marker.addListener("click", () => {
            info.current?.setContent(requestCard(r));
            info.current?.open({ map: m, anchor: marker });
          });
          requestMarkers.current.set(r.id, { marker, circle });
        }
        for (const w of data.waDemands) {
          const marker = new google.maps.Marker({
            position: { lat: w.lat, lng: w.lng },
            icon: pinIcon(COLOR.wa, w.precise, "diamond"),
            title: w.title ?? "",
          });
          marker.addListener("click", () => {
            info.current?.setContent(waCard(w));
            info.current?.open({ map: m, anchor: marker });
          });
          waMarkers.current.set(w.id, marker);
        }
        setReady(true);
      })
      .catch(() => setAuthFail(true));
    return () => {
      cancelled = true;
      console.error = origError;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data is a one-shot server payload
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

  // Apply filters: listings live in the clusterer, requerimientos stay
  // un-clustered (their circles are the point).
  useEffect(() => {
    const m = map.current;
    const cl = clusterer.current;
    if (!ready || !m || !cl) return;
    // «Fuera de zona»: only what no visible zone holds, painted red.
    const onlyOutside = fuera && !!zonas;
    const wanted = new Set(
      layers.listings ? shownListings.filter((l) => !onlyOutside || outside.has(l.id)).map((l) => l.id) : [],
    );
    const markers: google.maps.Marker[] = [];
    for (const [id, marker] of listingMarkers.current) {
      if (!wanted.has(id)) continue;
      const l = listingById.get(id);
      const icon = l && pinIcon(onlyOutside ? OUTSIDE : COLOR[l.transaction], l.precise, "circle");
      if (icon && marker.getIcon() !== icon) marker.setIcon(icon);
      markers.push(marker);
    }
    cl.clearMarkers(true);
    cl.addMarkers(markers);

    const wantedReq = new Set(layers.requests ? shownRequests.map((r) => r.id) : []);
    for (const [id, { marker, circle }] of requestMarkers.current) {
      const on = wantedReq.has(id);
      marker.setMap(on ? m : null);
      circle?.setMap(on && zoom >= 12 ? m : null);
    }
    const wcl = waClusterer.current;
    if (wcl) {
      const wantedWa = new Set(layers.wa ? shownWa.map((w) => w.id) : []);
      const waMs: google.maps.Marker[] = [];
      for (const [id, marker] of waMarkers.current) if (wantedWa.has(id)) waMs.push(marker);
      wcl.clearMarkers(true);
      wcl.addMarkers(waMs);
    }
    info.current?.close();
  }, [ready, layers, shownListings, shownRequests, shownWa, zoom, fuera, outside, zonas, listingById]);

  // Recenter when the estado changes (Puebla opens on Puebla, Chihuahua on Chihuahua…).
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const all = [
      ...shownListings.map((l) => ({ lat: l.lat, lng: l.lng })),
      ...shownRequests.map((r) => ({ lat: r.lat, lng: r.lng })),
    ];
    if (!all.length) return;
    // A handful of listings carry coordinates far from their stated estado
    // (a Puebla casa pinned in Guadalajara). Fit the view to the dense core:
    // points within ~120 km of the median, so one bad pin can't zoom the
    // whole state out to the country.
    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const c = { lat: median(all.map((p) => p.lat)), lng: median(all.map((p) => p.lng)) };
    const kmPerDeg = 111;
    const core = all.filter((p) => {
      const dLat = (p.lat - c.lat) * kmPerDeg;
      const dLng = (p.lng - c.lng) * kmPerDeg * Math.cos((c.lat * Math.PI) / 180);
      return Math.hypot(dLat, dLng) <= 120;
    });
    const pts = core.length ? core : all;
    const b = new google.maps.LatLngBounds();
    for (const p of pts) b.extend(p);
    m.fitBounds(b, 40);
    // A handful of pins on one block would zoom past the imagery (grey map);
    // street level is as close as the overview needs to start.
    google.maps.event.addListenerOnce(m, "idle", () => {
      if ((m.getZoom() ?? 0) > 16) m.setZoom(16);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on estado / test toggle (and first ready)
  }, [ready, estado, testOnly]);

  const preciseL = shownListings.filter((l) => l.precise).length;
  const preciseR = shownRequests.filter((r) => r.precise).length;
  const preciseW = shownWa.filter((w) => w.precise).length;

  const missingShown = data.missing;

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar: what to look at (left) · which layers (right). The legend and
          the fine print live on the map itself, bottom-left, out of the way. */}
      <Toolbar>
        {/* Filters share one tray: pill dropdowns and a light segmented
            control, all the same height and radius as the layer pills. */}
        <PillTray>
          <PillSelect value={estado} onChange={changeEstado} options={[["", "Todos los estados"], ...data.states.map((s) => [s, s] as [string, string])]} />
          <PillSegment value={op} onChange={setOp} options={[["todas", "Todas"], ["venta", "Venta"], ["renta", "Renta"]]} />
          <PillSelect value={tipo} onChange={setTipo} options={[["todos", "Todos los tipos"], ...tipos.map((t) => [t, TYPE_LABEL[t] ?? t] as [string, string])]} />
        </PillTray>

        <div className="flex flex-wrap items-center gap-2">
          <LayerChip
            on={layers.listings}
            onClick={() => setLayers((l) => ({ ...l, listings: !l.listings }))}
            label="Propiedades"
            count={shownListings.length}
            swatch={
              <span className="inline-flex -space-x-1">
                <span className="inline-block h-3 w-3 rounded-full ring-2 ring-white" style={{ background: COLOR.venta }} />
                <span className="inline-block h-3 w-3 rounded-full ring-2 ring-white" style={{ background: COLOR.renta }} />
              </span>
            }
          />
          <LayerChip
            on={layers.requests}
            onClick={() => setLayers((l) => ({ ...l, requests: !l.requests }))}
            label="Requerimientos"
            count={shownRequests.length}
            swatch={<span className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: COLOR.req }} />}
          />
          <LayerChip
            on={layers.wa}
            onClick={() => setLayers((l) => ({ ...l, wa: !l.wa }))}
            label="Solicitudes"
            count={shownWa.length}
            title="Requerimientos capturados de los grupos de WhatsApp"
            swatch={<WaGlyph size={15} />}
          />
          <ToolbarDivider />
          <FilterChip on={onlyPrecise} onClick={() => setOnlyPrecise((v) => !v)} label="Punto exacto" title="Sólo lo que tiene un punto exacto, sin centros de colonia" />
          <FilterChip on={testOnly} onClick={() => setTestOnly((v) => !v)} label="Pruebas" tone="amber" title="Sólo lo que subimos Pablo y yo para probar" />
        </div>
        {gError ? (
          <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            Google: {gError}
          </span>
        ) : null}
      </Toolbar>
      <div className="relative flex flex-1" style={{ minHeight: "calc(100vh - 140px)" }}>
      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />
        {/* below lg the panel is an overlay behind this button */}
        {ready ? (
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="absolute right-3 top-3 z-10 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-800 shadow-sm lg:hidden"
          >
            {panelOpen ? "Cerrar zonas" : `Zonas${zonas ? ` · ${zonas.length}` : ""}`}
          </button>
        ) : null}
        {ready ? (
          <div className="pointer-events-none absolute bottom-6 left-3 z-10 rounded-xl border border-black/[0.06] bg-white/95 px-3 py-2 text-[11px] leading-4 text-neutral-600 shadow-soft backdrop-blur">
            <div className="mb-1 flex items-center gap-3 text-neutral-700">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.venta }} /> punto exacto</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: COLOR.venta }} /> centro de colonia o zona</span>
            </div>
            <table className="tabular-nums">
              <tbody>
                <tr className="text-neutral-400"><td className="pr-3" /><td className="pr-3 text-right">en mapa</td><td className="pr-3 text-right">por centro</td><td className="text-right">sin ubicación</td></tr>
                <LegendRow label="Propiedades" shown={shownListings.length} hollow={shownListings.length - preciseL} missing={missingShown.listings} />
                <LegendRow label="Requerimientos" shown={shownRequests.length} hollow={shownRequests.length - preciseR} missing={missingShown.requests} />
                <LegendRow label="Solicitudes (30 días)" shown={shownWa.length} hollow={shownWa.length - preciseW} missing={missingShown.wa} />
              </tbody>
            </table>
          </div>
        ) : null}
        {!KEY || authFail ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 p-8 text-center text-sm text-neutral-600">
            El mapa necesita la llave de Google Maps del navegador (<code className="rounded bg-neutral-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>) — la misma de Zonas.
          </div>
        ) : !ready ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">Cargando mapa…</div>
        ) : null}
      </div>
      <div
        className={`${panelOpen ? "absolute inset-y-0 right-0 z-20 flex w-[min(360px,100%)] shadow-xl" : "hidden"} lg:static lg:flex lg:w-[360px] lg:shadow-none`}
      >
        <ZonasPanel
          estado={estado}
          zonas={zonas}
          loading={zLoading}
          error={zError}
          kinds={kinds}
          onKind={(k) => setKinds((v) => ({ ...v, [k]: !v[k] }))}
          colorOf={zoneColor}
          counts={counts}
          coverage={{ total: shownListings.length, dentro: shownListings.length - outside.size }}
          colonias={showColonias}
          onColonias={() => setShowColonias((v) => !v)}
          coloniasNote={coloniasNote}
          fuera={fuera}
          onFuera={() => setFuera((v) => !v)}
          selected={selected}
          onSelect={setSelected}
          onHover={setHovered}
          pendientes={pendientes}
          onNew={startNew}
          onEdit={startEdit}
          onFailure={startFailure}
          flash={flash}
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
                onModo={(m) =>
                  setEdit((e) => (e ? { ...e, modo: m, drawing: m === "dibujo" && !e.ring } : e))
                }
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
              />
            ) : null
          }
        />
      </div>
      </div>
    </div>
  );
}

// A layer is a pill you press, not a checkbox: its swatch is the legend, its
// count says what the current filters left on the map.
function LayerChip({ on, onClick, label, count, swatch, title }: { on: boolean; onClick: () => void; label: string; count: number; swatch: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition ${
        on ? "border-neutral-300 bg-white text-neutral-900 shadow-sm" : "border-transparent bg-neutral-100 text-neutral-400"
      }`}
    >
      <span className={on ? "" : "opacity-40 grayscale"}>{swatch}</span>
      {label}
      <span className={`tabular-nums ${on ? "text-neutral-500" : "text-neutral-400"}`}>{count.toLocaleString("en-US")}</span>
    </button>
  );
}

function LegendRow({ label, shown, hollow, missing }: { label: string; shown: number; hollow: number; missing: number }) {
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <tr>
      <td className="pr-3 text-neutral-700">{label}</td>
      <td className="pr-3 text-right">{n(shown)}</td>
      <td className="pr-3 text-right">{n(hollow)}</td>
      <td className="text-right">{n(missing)}</td>
    </tr>
  );
}

function listingCard(l: MapListing): string {
  const t = TYPE_LABEL[l.type] ?? l.type;
  const place = l.precise ? "" : `<div style="color:#b45309;font-size:12px">Ubicada por colonia: ${esc(l.place)}</div>`;
  return `<div style="font:13px/1.35 system-ui;max-width:280px">
    <div style="font-weight:600">${esc(l.name) || `${t} en ${l.transaction}`}</div>
    <div>${t} · ${l.transaction} · <b>${money(l.price, l.currency)}</b></div>
    ${place}
    <div style="color:#525252;margin-top:4px">${esc(l.owner)}</div>
    <a href="/broker/${l.user_id}" style="color:#1c4588;font-size:12px">Ver asesor →</a>
  </div>`;
}

function requestCard(r: MapRequest): string {
  const types = (r.types ?? []).map((t) => TYPE_LABEL[t] ?? t).join("/") || "cualquier tipo";
  const budget =
    r.price_min || r.price_max
      ? `${r.price_min ? money(r.price_min, "MXN") : "sin piso"} – ${r.price_max ? money(r.price_max, "MXN") : "sin tope"}`
      : "sin presupuesto";
  const where = r.precise
    ? `radio ${r.radius_km ?? 0.5} km`
    : `zona: ${esc(r.place)}`;
  return `<div style="font:13px/1.35 system-ui;max-width:280px">
    <div style="font-weight:600">Requerimiento${r.title ? ` · ${esc(r.title)}` : ""}</div>
    <div>${types} en ${esc(r.transaction)} · ${budget}</div>
    <div style="color:#b45309;font-size:12px">${where}</div>
    <div style="color:#525252;margin-top:4px">${esc(r.owner)}</div>
    <a href="/broker/${r.created_by}" style="color:#1c4588;font-size:12px">Ver asesor →</a>
  </div>`;
}

function waCard(w: MapWaDemand): string {
  const t = w.property_type ? (TYPE_LABEL[w.property_type] ?? w.property_type) : "cualquier tipo";
  const budget =
    w.price || w.price_min
      ? `${w.price_min ? money(w.price_min, "MXN") : "sin piso"} – ${w.price ? money(w.price, "MXN") : "sin tope"}`
      : "sin presupuesto";
  const where = w.precise ? esc(w.location) : `zona: ${esc(w.place)}`;
  const when = new Date(w.captured_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });
  return `<div style="font:13px/1.35 system-ui;max-width:280px">
    <div style="font-weight:600">${waGlyphHtml(14)} ${w.title ? esc(w.title) : "Requerimiento del grupo"}</div>
    <div>${t} en ${esc(w.operation ?? "—")} · ${budget}</div>
    <div style="color:#6d28d9;font-size:12px">${where}</div>
    <div style="color:#525252;margin-top:4px">${esc(w.group_name)} · ${esc(w.sender_name) || "sin nombre"} · ${when}</div>
    <a href="/whatsapp" style="color:#1c4588;font-size:12px">Ver capturas →</a>
  </div>`;
}

