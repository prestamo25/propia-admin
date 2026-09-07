"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Cluster } from "@googlemaps/markerclusterer";
import type { MapData, MapListing, MapRequest } from "@/lib/mapa";

// Same browser key and loader as the zonas bench (ZonaMap.tsx). The map is
// created ONCE; filters only swap markers in and out of the clusterer, so a
// visit costs one map load however much Pablo plays with the filters.
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

const COLOR = { venta: "#1c4588", renta: "#0f766e", req: "#b45309" };
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
const clusterRenderer = {
  render({ count, position }: Cluster): google.maps.Marker {
    const size = count < 10 ? 34 : count < 100 ? 40 : 48;
    const r = size / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 2}" fill="#1c4588" fill-opacity="0.88" stroke="#ffffff" stroke-width="2"/></svg>`;
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

type Op = "todas" | "venta" | "renta";
type Layer = "listings" | "requests";

export function MapaClient({ data }: { data: MapData }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const clusterer = useRef<MarkerClusterer | null>(null);
  const listingMarkers = useRef<Map<string, google.maps.Marker>>(new Map());
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
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ listings: true, requests: true });
  const [onlyPrecise, setOnlyPrecise] = useState(false);

  const tipos = useMemo(
    () => Array.from(new Set(data.listings.map((l) => l.type))).sort(),
    [data.listings],
  );

  const shownListings = useMemo(
    () =>
      data.listings.filter(
        (l) =>
          (!estado || l.state === estado) &&
          (op === "todas" || l.transaction === op) &&
          (tipo === "todos" || l.type === tipo) &&
          (!onlyPrecise || l.precise),
      ),
    [data.listings, estado, op, tipo, onlyPrecise],
  );
  const shownRequests = useMemo(
    () =>
      data.requests.filter(
        (r) =>
          (!estado || (r.states ?? []).includes(estado)) &&
          (op === "todas" || r.transaction === op) &&
          (tipo === "todos" || (r.types ?? []).length === 0 || (r.types ?? []).includes(tipo)) &&
          (!onlyPrecise || r.precise),
      ),
    [data.requests, estado, op, tipo, onlyPrecise],
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
    info.current?.close();
  }, [ready, layers, shownListings, shownRequests, zoom]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on estado (and first ready)
  }, [ready, estado]);

  const preciseL = shownListings.filter((l) => l.precise).length;
  const preciseR = shownRequests.filter((r) => r.precise).length;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2 text-sm">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1">
          <option value="">Todos los estados</option>
          {data.states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-300">
          {(["todas", "venta", "renta"] as Op[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOp(o)}
              className={`px-3 py-1 ${op === o ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
            >
              {o === "todas" ? "Venta y renta" : o === "venta" ? "Venta" : "Renta"}
            </button>
          ))}
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1">
          <option value="todos">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <label className="ml-2 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={layers.listings} onChange={(e) => setLayers((l) => ({ ...l, listings: e.target.checked }))} />
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR.venta }} />
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR.renta }} />
          Propiedades <span className="text-neutral-500">({shownListings.length.toLocaleString("en-US")})</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={layers.requests} onChange={(e) => setLayers((l) => ({ ...l, requests: e.target.checked }))} />
          <span className="inline-block h-3 w-3 rotate-45" style={{ background: COLOR.req }} />
          Requerimientos <span className="text-neutral-500">({shownRequests.length.toLocaleString("en-US")})</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={onlyPrecise} onChange={(e) => setOnlyPrecise(e.target.checked)} />
          Sólo con punto exacto
        </label>
        {gError ? (
          <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            Google: {gError}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-neutral-500">
          Relleno = punto exacto · hueco = centro de la colonia ({(shownListings.length - preciseL).toLocaleString("en-US")} propiedades, {shownRequests.length - preciseR} requerimientos) ·
          sin ubicación: {data.missing.listings} propiedades, {data.missing.requests} requerimientos
        </span>
      </div>
      <div className="relative flex-1" style={{ minHeight: "calc(100vh - 140px)" }}>
        <div ref={mapEl} className="absolute inset-0" />
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
