// Acceso regional (2026-10-13) — the pieces both the server (lib/access.ts,
// app/accesos/actions.ts) and the grant form in the browser need. No server
// imports here.

export type Seccion = "mapa" | "zonas" | "miembros";

export const SECCION_OPTIONS: { key: Seccion; label: string; hint: string }[] = [
  { key: "mapa", label: "Mapa", hint: "Propiedades y requerimientos, sin nombres" },
  { key: "zonas", label: "Zonas", hint: "Zonas y colonias, sólo para ver" },
  { key: "miembros", label: "Miembros", hint: "Asesores y proveedores de sus estados" },
];

export const VIGENCIAS = [30, 90, 180] as const;
export const DEFAULT_VIGENCIA = 90;

// The 32 estados exactly as users.states spells them.
export const ESTADOS = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];
