// Point-in-zone for the big map, done in the browser against the pins it
// actually draws (listings placed at a colonia centroid included), so a
// zone's count always matches what you see inside it. Pure functions — no
// Google geometry library, no network.

import type { Geo } from "./mapaZonas";

type Ring = [number, number][]; // [lng, lat]
type Poly = Ring[]; // outer ring first, then holes

export type ZoneShape = {
  bbox: [number, number, number, number]; // w, s, e, n
  polys: Poly[];
};

export function shapeOf(geom: Geo): ZoneShape {
  const polys: Poly[] =
    geom.type === "Polygon"
      ? [geom.coordinates as Poly]
      : geom.type === "MultiPolygon"
        ? (geom.coordinates as Poly[])
        : [];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polys)
    for (const [lng, lat] of p[0] ?? []) {
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  return { bbox: [w, s, e, n], polys };
}

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function contains(shape: ZoneShape, lng: number, lat: number): boolean {
  const [w, s, e, n] = shape.bbox;
  if (lng < w || lng > e || lat < s || lat > n) return false;
  for (const [outer, ...holes] of shape.polys) {
    if (outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)))
      return true;
  }
  return false;
}
