// Panorama series palette — validated with the dataviz six-checks (light
// surface, all PASS). Plain module so BOTH the server page (legends) and the
// client charts can import real values ("use client" exports reach server
// components as proxies, not arrays).
export const SERIES = [
  { key: "signups", label: "Altas", color: "#2E5FB0" },
  { key: "listings", label: "Propiedades", color: "#059669" },
  { key: "requerimientos", label: "Requerimientos", color: "#C2410C" },
] as const;

// Same entities, cumulative framing — the hero "how big are we?" chart.
export const CUM_SERIES = [
  { key: "members", label: "Miembros", color: "#2E5FB0" },
  { key: "properties", label: "Propiedades", color: "#059669" },
  { key: "requerimientos", label: "Requerimientos", color: "#C2410C" },
] as const;
