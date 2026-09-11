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

// Stored phones are bare digits: dial code + 10 national digits (users.phone,
// attendee rows, test-OTP pairs). Login accepts +52 and +1 (app 2026-09-11),
// so both shapes render; anything else falls back to "+<digits>".
const DIALS = ["52", "1"];
export function splitPhone(raw: string | null | undefined): { dial: string; national: string } | null {
  const p = String(raw ?? "").replace(/\D/g, "");
  for (const dial of DIALS) {
    if (p.length === dial.length + 10 && p.startsWith(dial)) return { dial, national: p.slice(dial.length) };
  }
  return null;
}
export function fmtPhone(raw: string | null | undefined): string {
  const split = splitPhone(raw);
  if (split) {
    const n = split.national;
    return `+${split.dial} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  const p = String(raw ?? "").replace(/\D/g, "");
  return p ? `+${p}` : "";
}
// wa.me target: Mexican numbers still need the legacy "1" after 52 for the
// desktop client; US numbers are plain E.164 digits.
export function waHref(raw: string): string {
  const split = splitPhone(raw);
  const digits = split ? (split.dial === "52" ? `521${split.national}` : `${split.dial}${split.national}`) : raw.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
