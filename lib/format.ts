const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso));
}

// Relative "última actividad" + whether it's recent enough to show a live dot.
export function relative(iso: string | null): { label: string; fresh: boolean } {
  if (!iso) return { label: "Nunca", fresh: false };
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  const fresh = ms < 7 * 24 * 60 * 60 * 1000; // active within a week
  if (min < 1) return { label: "Ahora", fresh: true };
  if (min < 60) return { label: `Hace ${min} min`, fresh };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { label: `Hace ${hr} h`, fresh };
  const day = Math.floor(hr / 24);
  if (day < 30) return { label: `Hace ${day} d`, fresh };
  return { label: fmtDate(iso), fresh: false };
}

// users.status, in Spanish. Shared so the table and the Excel export can never
// drift apart on what a broker's state is called.
export const STATUS_LABEL: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
};

// A block is an auth-level ban and outranks whatever users.status says.
export function statusLabel(status: string | null, blocked = false): string {
  if (blocked) return "Bloqueado";
  return STATUS_LABEL[status ?? ""] ?? status ?? "—";
}

export function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Soft, distinct avatar tints — deterministic from the name so a broker always
// gets the same color.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#e0e7ff", fg: "#4338ca" }, // indigo
  { bg: "#dbeafe", fg: "#1d4ed8" }, // blue
  { bg: "#d1fae5", fg: "#047857" }, // emerald
  { bg: "#fef3c7", fg: "#b45309" }, // amber
  { bg: "#ffe4e6", fg: "#be123c" }, // rose
  { bg: "#cffafe", fg: "#0e7490" }, // cyan
  { bg: "#f3e8ff", fg: "#7e22ce" }, // violet
  { bg: "#ccfbf1", fg: "#0f766e" }, // teal
];

export function avatarColors(seed: string | null): { bg: string; fg: string } {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
