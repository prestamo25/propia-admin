"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Candidate } from "@/lib/zonas";

const TILES =
  process.env.NEXT_PUBLIC_MAP_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = process.env.NEXT_PUBLIC_MAP_TILES_ATTR ?? "&copy; OpenStreetMap";

// Real basemap, on purpose. Judging whether two polygons are one place is a
// question about streets, highways and where the city actually stops — that
// context is the difference between guessing and knowing. (The standalone
// viewer had to fall back to bare SVG because the artifact sandbox blocks
// external tiles; the panel has no such limit.)

const LOW = new Set(["de", "del", "la", "las", "los", "y", "a", "en", "el"]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i && LOW.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

export function ZonaMap({
  pins,
  candidatos,
  picked,
  onToggle,
}: {
  pins: [number, number][];
  candidatos: Candidate[];
  picked: string[];
  onToggle: (key: string) => void;
}) {
  const [failures, setFailures] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapes = useRef<L.LayerGroup | null>(null);
  const marks = useRef<L.LayerGroup | null>(null);
  // onToggle changes identity every render; keep it in a ref so redrawing
  // layers never depends on it.
  const toggle = useRef(onToggle);
  useEffect(() => {
    toggle.current = onToggle;
  }, [onToggle]);

  // init once
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { zoomControl: true, attributionControl: true });
    // Basemap provider is configurable. The default is OpenStreetMap's own
    // tile server, which is volunteer-run and rate-limits app traffic with
    // 503s — fine for the two of us, not something to rely on. Set
    // NEXT_PUBLIC_MAP_TILES (and _ATTR) to a keyed provider for production.
    L.tileLayer(TILES, {
      maxZoom: 19,
      opacity: 0.62, // let the polygons read on top without hiding the streets
      attribution: `${ATTR} · Polígonos: INEGI DCAH`,
      // keep a rejected tile from freezing the view as a stretched parent tile
      crossOrigin: true,
    })
      .on("tileerror", () => {
        setFailures((n) => n + 1);
      })
      .addTo(m);
    shapes.current = L.layerGroup().addTo(m);
    marks.current = L.layerGroup().addTo(m);
    map.current = m;
    m.setView([19.03, -98.24], 12);
    // the pane is measured before the flex parent settles; nudge it once
    setTimeout(() => m.invalidateSize(), 60);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // polygons + pins
  useEffect(() => {
    const m = map.current;
    if (!m || !shapes.current || !marks.current) return;
    shapes.current.clearLayers();
    marks.current.clearLayers();

    for (const c of candidatos) {
      const on = picked.includes(c.key);
      const evid = c.pins_dentro > 0 || c.parecido > 0.35;
      const layer = L.geoJSON(c.geom as never, {
        // Tuned against the street basemap, not a blank ground: on tiles,
        // a hairline at 4% fill simply disappears.
        style: {
          color: on ? "#1c4588" : evid ? "#b45309" : "#475569",
          weight: on ? 3 : evid ? 2.2 : 1.4,
          opacity: on ? 1 : evid ? 0.95 : 0.75,
          fillColor: on ? "#1c4588" : evid ? "#f59e0b" : "#64748b",
          fillOpacity: on ? 0.34 : evid ? 0.2 : 0.09,
        },
      });
      layer.bindTooltip(
        `<b>${titleCase(c.nombre)}</b><br>${c.municipio}` +
          (c.pins_dentro ? ` · <b>${c.pins_dentro} pins</b>` : ""),
        { sticky: true },
      );
      layer.on("click", () => toggle.current(c.key));
      layer.on("mouseover", () => layer.setStyle({ fillOpacity: on ? 0.44 : 0.3, weight: on ? 3.5 : 3 }));
      layer.on("mouseout", () => layer.setStyle({
        fillOpacity: on ? 0.34 : evid ? 0.2 : 0.09,
        weight: on ? 3 : evid ? 2.2 : 1.4,
      }));
      layer.addTo(shapes.current);
    }

    for (const [lng, lat] of pins) {
      L.circleMarker([lat, lng], {
        radius: 5,
        color: "#fff",
        weight: 1.5,
        fillColor: "#e11d48",
        fillOpacity: 1,
      }).addTo(marks.current);
    }
  }, [candidatos, pins, picked]);

  // frame on the evidence: pins + picked + polygons that contain a pin. A loose
  // name match two municipios away stays clickable but must not set the view.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const focus = candidatos.filter((c) => picked.includes(c.key) || c.pins_dentro > 0);
    const b = L.latLngBounds([]);
    for (const [lng, lat] of pins) b.extend([lat, lng]);
    for (const c of focus) {
      try {
        b.extend(L.geoJSON(c.geom as never).getBounds());
      } catch {
        /* skip unusable geometry */
      }
    }
    // Cap the zoom: a tight two-polygon cluster would otherwise fill the pane
    // at street level, which loses the surrounding context that makes the
    // "is this one place?" judgement possible.
    if (b.isValid()) m.fitBounds(b, { padding: [48, 48], maxZoom: 15 });
    // deliberately not reacting to `picked`: re-framing on every checkbox
    // would yank the map while you are still choosing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, pins]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      {failures > 3 ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-lg bg-amber-50/95 px-2.5 py-1.5 text-[11px] text-amber-800 shadow-sm ring-1 ring-amber-200">
          El mapa base viene incompleto (OpenStreetMap está limitando). Los polígonos
          y los pins son correctos.
        </div>
      ) : null}
    </div>
  );
}
