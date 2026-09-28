import type { BrokerRow } from "@/lib/data";
import { tierOf, type Tier } from "@/lib/profileTypes";

// The Miembros filters, in one place: the table renders them and the Excel
// route re-runs them server-side, so the file you download is exactly the list
// you were looking at — search, tier, Premium, Inactivos and Estado alike
// (until 2026-09-28 the export only honored the search box). Kept out of
// lib/data.ts because that module reaches for the service key and must never
// reach the browser. The same keys are the page's URL params (?q=&tipo=…).

type Filterable = Pick<
  BrokerRow,
  "name" | "company" | "phone" | "email" | "states" | "profile_type" | "premium" | "last_active"
>;

export type BrokerFilters = {
  q: string;
  estado: string; // "todos" = every state
  tipo: "todos" | Tier;
  premium: boolean;
  inactivos: boolean;
};

export const NO_FILTERS: BrokerFilters = {
  q: "",
  estado: "todos",
  tipo: "todos",
  premium: false,
  inactivos: false,
};

const TIERS: Tier[] = ["asesor", "servicios", "cliente", "invitado"];

// «Inactivos» = never opened the app, or not in the last 30 days.
export const INACTIVE_DAYS = 30;
export function isInactive(lastActive: string | null, now = Date.now()): boolean {
  return !lastActive || now - new Date(lastActive).getTime() > INACTIVE_DAYS * 86_400_000;
}

export function filtersFromParams(p: URLSearchParams): BrokerFilters {
  const tipo = p.get("tipo");
  return {
    q: p.get("q") ?? "",
    estado: p.get("estado") || "todos",
    tipo: TIERS.includes(tipo as Tier) ? (tipo as Tier) : "todos",
    premium: p.get("premium") === "1",
    inactivos: p.get("inactivos") === "1",
  };
}

// Only the non-default filters, so a clean list has a clean URL.
export function filtersToParams(f: BrokerFilters, p = new URLSearchParams()): URLSearchParams {
  const set = (k: string, v: string | null) => (v ? p.set(k, v) : p.delete(k));
  set("q", f.q.trim() || null);
  set("estado", f.estado !== "todos" ? f.estado : null);
  set("tipo", f.tipo !== "todos" ? f.tipo : null);
  set("premium", f.premium ? "1" : null);
  set("inactivos", f.inactivos ? "1" : null);
  return p;
}

function matchesQuery(b: Filterable, q: string): boolean {
  return [b.name, b.company, b.phone, b.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

// Everything except the tier — the tier pills show counts for each tier
// under the other filters, so they need the list before it's applied.
export function filterExceptTier<T extends Filterable>(
  brokers: T[],
  f: BrokerFilters,
  now = Date.now(),
): T[] {
  const q = f.q.trim().toLowerCase();
  return brokers.filter(
    (b) =>
      (f.estado === "todos" || b.states.includes(f.estado)) &&
      (!f.premium || b.premium) &&
      (!f.inactivos || isInactive(b.last_active, now)) &&
      (!q || matchesQuery(b, q)),
  );
}

export function filterBrokers<T extends Filterable>(
  brokers: T[],
  f: BrokerFilters,
  now = Date.now(),
): T[] {
  const rest = filterExceptTier(brokers, f, now);
  return f.tipo === "todos" ? rest : rest.filter((b) => tierOf(b.profile_type) === f.tipo);
}
