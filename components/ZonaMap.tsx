"use client";

import { useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { Candidate } from "@/lib/zonas";

// Google's basemap, by decision (Franz 08-31): it is the map he already judges
// zones against, and in México it labels colonias inline — real context for a
// membership call. Compliance note: the Google-ToS work in the geo project was
// about STORING Places data in our matching engine; drawing our own INEGI
// polygons on top of a Google map is the permitted direction.
//
// Needs a browser key (Maps JavaScript API) in NEXT_PUBLIC_GOOGLE_MAPS_KEY —
// separate from the app's Places key, which lives server-side in the
// places-proxy Edge Function and must stay there. Lock this one by HTTP
// referrer to admin.propia.dev + localhost:3000.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

const LOW = new Set(["de", "del", "la", "las", "los", "y", "a", "en", "el"]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i && LOW.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const STYLE = {
  picked: { stroke: "#1c4588", fill: "#1c4588", w: 3, op: 0.34 },
  evid: { stroke: "#b45309", fill: "#f59e0b", w: 2.2, op: 0.2 },
  rest: { stroke: "#475569", fill: "#64748b", w: 1.4, op: 0.09 },
};

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
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [authFail, setAuthFail] = useState(false);

  // Callbacks/state the map handlers need, without re-wiring listeners.
  const toggle = useRef(onToggle);
  useEffect(() => {
    toggle.current = onToggle;
  }, [onToggle]);
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  // init once
  useEffect(() => {
    if (!KEY || !host.current || map.current) return;
    const el = host.current; // pin the node: the ref may be cleared before cleanup
    let cancelled = false;
    // Google calls this global on an invalid/over-restricted key.
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () =>
      setAuthFail(true);

    setOptions({ key: KEY, v: "weekly", language: "es", region: "MX" });
    importLibrary("maps")
      .then(({ Map: GMap, InfoWindow }) => {
        if (cancelled) return;
        const m = new GMap(el, {
          center: { lat: 19.03, lng: -98.24 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        info.current = new InfoWindow({ disableAutoPan: true, headerDisabled: true });

        m.data.setStyle((f) => {
          const key = f.getProperty("key") as string;
          const s = pickedRef.current.includes(key)
            ? STYLE.picked
            : (f.getProperty("evid") as boolean)
              ? STYLE.evid
              : STYLE.rest;
          return {
            strokeColor: s.stroke,
            strokeWeight: s.w,
            fillColor: s.fill,
            fillOpacity: s.op,
            cursor: "pointer",
          };
        });
        m.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
          toggle.current(e.feature.getProperty("key") as string);
        });
        m.data.addListener("mouseover", (e: google.maps.Data.MouseEvent) => {
          const nombre = titleCase(e.feature.getProperty("nombre") as string);
          const mun = e.feature.getProperty("municipio") as string;
          const n = e.feature.getProperty("pins_dentro") as number;
          info.current?.setContent(
            `<div style="font:12px/1.4 system-ui;padding:2px 4px"><b>${nombre}</b><br>` +
              `${mun}${n ? ` · <b style="color:#e11d48">${n} pins</b>` : ""}</div>`,
          );
          if (e.latLng) info.current?.setPosition(e.latLng);
          info.current?.open({ map: m });
        });
        m.data.addListener("mouseout", () => info.current?.close());

        map.current = m;
        setReady(true);
      })
      .catch(() => setAuthFail(true));

    return () => {
      cancelled = true;
      map.current = null;
      el.innerHTML = "";
    };
  }, []);

  // data: polygons + pins (rebuilt when the selection target changes)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    m.data.forEach((f) => m.data.remove(f));
    for (const c of candidatos) {
      m.data.addGeoJson({
        type: "Feature",
        geometry: c.geom,
        properties: {
          key: c.key,
          nombre: c.nombre,
          municipio: c.municipio,
          pins_dentro: c.pins_dentro,
          evid: c.pins_dentro > 0 || c.parecido > 0.35,
        },
      });
    }

    markers.current.forEach((mk) => mk.setMap(null));
    markers.current = pins.map(
      ([lng, lat]) =>
        new google.maps.Marker({
          map: m,
          position: { lat, lng },
          clickable: false,
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

    // Frame on the evidence: pins + polygons that contain one. Loose name
    // matches two municipios away stay clickable but must not set the view.
    const b = new google.maps.LatLngBounds();
    let any = false;
    for (const [lng, lat] of pins) {
      b.extend({ lat, lng });
      any = true;
    }
    m.data.forEach((f) => {
      if (!(f.getProperty("pins_dentro") as number)) return;
      f.getGeometry()?.forEachLatLng((ll) => {
        b.extend(ll);
        any = true;
      });
    });
    if (any) {
      // fitBounds has no zoom cap of its own — clamp, fit, then release.
      m.setOptions({ maxZoom: 15 });
      m.fitBounds(b, 48);
      google.maps.event.addListenerOnce(m, "idle", () =>
        m.setOptions({ maxZoom: undefined }),
      );
    }
  }, [candidatos, pins, ready]);

  // restyle on selection change (no feature rebuild, no re-frame)
  useEffect(() => {
    const m = map.current;
    if (m && ready) m.data.setStyle(m.data.getStyle() as google.maps.Data.StylingFunction);
  }, [picked, ready]);

  if (!KEY)
    return (
      <div className="grid h-full place-items-center bg-neutral-50 px-8 text-center">
        <div className="max-w-sm text-sm text-neutral-600">
          <p className="font-medium text-neutral-800">Falta la llave de Google Maps</p>
          <p className="mt-2 text-[13px] leading-relaxed">
            En la consola de GCP (el proyecto de Places): habilita{" "}
            <b>Maps JavaScript API</b>, crea una API key restringida por referrer a{" "}
            <code className="rounded bg-neutral-100 px-1">admin.propia.dev</code> y{" "}
            <code className="rounded bg-neutral-100 px-1">localhost:3000</code>, y ponla en{" "}
            <code className="rounded bg-neutral-100 px-1">.env.local</code> como{" "}
            <code className="rounded bg-neutral-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>.
          </p>
        </div>
      </div>
    );

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      {authFail ? (
        <div className="absolute inset-0 grid place-items-center bg-neutral-50/95 px-8 text-center">
          <p className="max-w-sm text-sm text-neutral-600">
            Google rechazó la llave (inválida, sin <b>Maps JavaScript API</b> habilitada, o el
            referrer no está permitido). Revisa la key en la consola de GCP.
          </p>
        </div>
      ) : null}
    </div>
  );
}
