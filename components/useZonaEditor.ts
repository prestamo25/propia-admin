"use client";

import { useEffect, useRef } from "react";
import type { Geo } from "@/lib/mapaZonas";

// The editing half of the big map (fase 2, 2026-09-23): what used to be the
// Zonas bench's own little map, now layered onto Mapa. Three things:
//   · members — the INEGI colonias a zone is made of, filled in brand blue;
//     clicking one (here, or its outline in the colonias layer) toggles it
//   · evidence — the queue's red pins plus the candidate polygons around
//     them (amber = has pins inside), and a zone's neighbours when editing
//   · drawing — click = vertex, first vertex or double-click = close, then
//     the vertices drag. Hand-made on purpose: Google removed DrawingManager
//     from the JS API in v3.65.

export type Ring = [number, number][]; // [lng, lat], first point repeated last

export type Evidence = {
  pins: [number, number][];
  polys: { key: string; nombre: string; municipio: string; pins: number; geom: Geo }[];
};

export type MemberGeo = { nombre: string; municipio: string; geom: Geo };

export type EditMapState = {
  modo: "miembros" | "dibujo";
  picked: string[];
  /** name + shape of every picked colonia */
  geoms: Record<string, MemberGeo>;
  /** true = click-to-place-vertices is armed */
  drawing: boolean;
  /** a drawn zone's boundary to load as the editable polygon */
  seed: { id: string; ring: Ring } | null;
};

const BRAND = "#1c4588";
const DRAW_STYLE = { strokeColor: BRAND, strokeWeight: 2.5, fillColor: BRAND, fillOpacity: 0.18 };

export function useZonaEditor({
  map,
  ready,
  edit,
  evidence,
  onToggle,
  onRing,
}: {
  map: React.RefObject<google.maps.Map | null>;
  ready: boolean;
  edit: EditMapState | null;
  evidence: Evidence | null;
  onToggle: (key: string) => void;
  onRing: (ring: Ring | null) => void;
}) {
  const members = useRef<google.maps.Data | null>(null);
  const evid = useRef<google.maps.Data | null>(null);
  const pinMarkers = useRef<google.maps.Marker[]>([]);
  const draft = useRef<google.maps.LatLng[]>([]);
  const draftLine = useRef<google.maps.Polyline | null>(null);
  const draftDot = useRef<google.maps.Marker | null>(null);
  const drawn = useRef<google.maps.Polygon | null>(null);
  const editRef = useRef(edit);
  const toggleRef = useRef(onToggle);
  const ringRef = useRef(onRing);
  useEffect(() => {
    editRef.current = edit;
    toggleRef.current = onToggle;
    ringRef.current = onRing;
  });

  function clearDraft() {
    draft.current = [];
    draftLine.current?.setMap(null);
    draftLine.current = null;
    draftDot.current?.setMap(null);
    draftDot.current = null;
  }
  function clearDrawn() {
    drawn.current?.setMap(null);
    drawn.current = null;
  }
  function mountEditable(m: google.maps.Map, path: google.maps.LatLngLiteral[] | google.maps.LatLng[]) {
    const poly = new google.maps.Polygon({ map: m, paths: path, editable: true, zIndex: 30000, ...DRAW_STYLE });
    drawn.current = poly;
    const report = () => {
      const r = poly.getPath().getArray().map((ll) => [ll.lng(), ll.lat()] as [number, number]);
      if (r.length) r.push(r[0]);
      ringRef.current(r.length >= 4 ? r : null);
    };
    const p = poly.getPath();
    for (const ev of ["set_at", "insert_at", "remove_at"] as const) p.addListener(ev, report);
    report();
  }
  function finishDraft(m: google.maps.Map) {
    if (draft.current.length < 3) return;
    const path = [...draft.current];
    clearDraft();
    mountEditable(m, path);
  }
  function addVertex(m: google.maps.Map, ll: google.maps.LatLng) {
    draft.current.push(ll);
    if (!draftLine.current)
      draftLine.current = new google.maps.Polyline({ map: m, path: [], strokeColor: BRAND, strokeWeight: 2, zIndex: 30000 });
    draftLine.current.setPath(draft.current);
    if (!draftDot.current) {
      // the first vertex is the close button
      draftDot.current = new google.maps.Marker({
        map: m,
        position: ll,
        title: "Cerrar el polígono",
        zIndex: 30001,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: BRAND,
          strokeWeight: 2.5,
        },
      });
      draftDot.current.addListener("click", () => finishDraft(m));
    }
  }

  // layers + listeners, once per map
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const ev = new google.maps.Data({ map: m });
    ev.setStyle((f) => {
      const pins = f.getProperty("pins") as number;
      const e = editRef.current;
      return {
        strokeColor: pins ? "#b45309" : "#64748b",
        strokeWeight: pins ? 2 : 1.2,
        fillColor: pins ? "#f59e0b" : "#94a3b8",
        fillOpacity: pins ? 0.2 : 0.08,
        zIndex: 21000,
        clickable: e?.modo === "miembros",
      };
    });
    const mem = new google.maps.Data({ map: m });
    mem.setStyle(() => ({
      strokeColor: BRAND,
      strokeWeight: 2.4,
      fillColor: BRAND,
      fillOpacity: 0.34,
      zIndex: 22000,
      clickable: editRef.current?.modo === "miembros",
    }));
    const tog = (e: google.maps.Data.MouseEvent) => {
      if (editRef.current?.modo === "miembros") toggleRef.current(e.feature.getProperty("key") as string);
    };
    ev.addListener("click", tog);
    mem.addListener("click", tog);
    evid.current = ev;
    members.current = mem;
    const l1 = m.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (editRef.current?.drawing && e.latLng) addVertex(m, e.latLng);
    });
    const l2 = m.addListener("dblclick", () => {
      if (editRef.current?.drawing) finishDraft(m);
    });
    return () => {
      l1.remove();
      l2.remove();
      ev.setMap(null);
      mem.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per map
  }, [ready]);

  // members follow the pick list
  useEffect(() => {
    const mem = members.current;
    if (!mem) return;
    mem.forEach((f) => mem.remove(f));
    if (edit?.modo !== "miembros") return;
    for (const key of edit.picked) {
      const g = edit.geoms[key];
      if (g) mem.addGeoJson({ type: "Feature", geometry: g.geom, properties: { key } });
    }
    mem.setStyle(mem.getStyle() as google.maps.Data.StylingFunction);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geoms change together with picked
  }, [edit?.modo, edit?.picked, ready]);

  // evidence: candidate polygons + the queue's red pins
  useEffect(() => {
    const ev = evid.current;
    const m = map.current;
    if (!ev || !m) return;
    ev.forEach((f) => ev.remove(f));
    pinMarkers.current.forEach((mk) => mk.setMap(null));
    pinMarkers.current = [];
    if (!evidence || !edit) return;
    for (const p of evidence.polys)
      ev.addGeoJson({ type: "Feature", geometry: p.geom, properties: { key: p.key, pins: p.pins } });
    pinMarkers.current = evidence.pins.map(
      ([lng, lat]) =>
        new google.maps.Marker({
          map: m,
          position: { lat, lng },
          clickable: false,
          zIndex: 30000,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5.5,
            fillColor: "#e11d48",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5,
          },
        }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the evidence set changes
  }, [evidence, !!edit, ready]);

  // restyle clickability when the mode flips
  useEffect(() => {
    for (const d of [evid.current, members.current]) d?.setStyle(d.getStyle() as google.maps.Data.StylingFunction);
    const m = map.current;
    if (!m) return;
    m.setOptions({
      draggableCursor: edit?.drawing ? "crosshair" : null,
      disableDoubleClickZoom: !!edit?.drawing,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.modo, edit?.drawing, ready]);

  // drawing lifecycle: arming clears, a seed loads, leaving edit clears all
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (!edit || edit.modo !== "dibujo") {
      clearDraft();
      clearDrawn();
      return;
    }
    if (edit.drawing) {
      clearDraft();
      clearDrawn();
      return;
    }
    if (edit.seed && !drawn.current) {
      const path = edit.seed.ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
      if (path.length >= 3) mountEditable(m, path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, edit?.modo, edit?.drawing, edit?.seed?.id]);

  // «Borrar dibujo» from the panel
  return {
    discardDrawing() {
      clearDraft();
      clearDrawn();
      ringRef.current(null);
    },
  };
}
