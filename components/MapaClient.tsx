"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Cluster } from "@googlemaps/markerclusterer";
import type { MapData, MapListing, MapRequest, MapWaDemand } from "@/lib/mapa";
import { FilterChip, PillSegment, PillSelect, PillTray, Toolbar, ToolbarDivider } from "@/components/Pills";

// Same browser key and loader as the zonas bench (ZonaMap.tsx). The map is
// created ONCE; filters only swap markers in and out of the clusterer, so a
// visit costs one map load however much Pablo plays with the filters.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

const COLOR = { venta: "#1c4588", renta: "#0f766e", req: "#b45309", wa: "#6d28d9" };
const TYPE_LABEL: Record<string, string> = {
  casa: "Casa", departamento: "Depto", terreno: "Terreno", oficina: "Oficina",
  local: "Local", bodega: "Bodega", nave: "Nave",
};
const money = (n: number | null, c: string | null) =>
  n == null ? "Precio a consultar" : `$${Math.round(n).toLocaleString("en-US")} ${c ?? "MXN"}`;
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

// Pin SVGs: filled = exact point, hollow = placed at the colonia's centroid.
function pinIcon(color: string, precise: boolean, shape: "circle" | "diamond"): google.maps.Icon {
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

  // Apply filters: listings live in the clusterer, requerimientos stay
  // un-clustered (their circles are the point).
  useEffect(() => {
    const m = map.current;
    const cl = clusterer.current;
    if (!ready || !m || !cl) return;
    const wanted = new Set(layers.listings ? shownListings.map((l) => l.id) : []);
    const markers: google.maps.Marker[] = [];
    for (const [id, marker] of listingMarkers.current) if (wanted.has(id)) markers.push(marker);
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
  }, [ready, layers, shownListings, shownRequests, shownWa, zoom]);

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
          <PillSelect value={estado} onChange={setEstado} options={[["", "Todos los estados"], ...data.states.map((s) => [s, s] as [string, string])]} />
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
      <div className="relative flex-1" style={{ minHeight: "calc(100vh - 140px)" }}>
        <div ref={mapEl} className="absolute inset-0" />
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

