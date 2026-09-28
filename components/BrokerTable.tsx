"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilterChip, PillSearch, PillSegment, PillSelect, PillTray, Toolbar, ToolbarDivider } from "@/components/Pills";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { BrokerRow } from "@/lib/data";
import { BlockButton } from "@/components/BlockButton";
import { StatCard } from "@/components/StatCard";
import {
  INACTIVE_DAYS,
  filterBrokers,
  filterExceptTier,
  filtersFromParams,
  filtersToParams,
  type BrokerFilters,
} from "@/lib/brokerFilter";
import { tierOf, profileTypeLabel } from "@/lib/profileTypes";
import {
  STATUS_LABEL,
  avatarColors,
  fmtDate,
  fmtPhone,
  initials,
  relative,
} from "@/lib/format";

type SortKey = "name" | "inventory" | "requests" | "contacts" | "events" | "sends" | "created_at" | "last_active";
type SortDir = "asc" | "desc";

const STATUS: Record<string, { label: string; dot: string; cls: string }> = {
  approved: {
    label: STATUS_LABEL.approved,
    dot: "#10b981",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  pending: {
    label: STATUS_LABEL.pending,
    dot: "#f59e0b",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  rejected: {
    label: STATUS_LABEL.rejected,
    dot: "#ef4444",
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
  },
};

function statusMeta(status: string | null) {
  return (
    STATUS[status ?? ""] ?? {
      label: status ?? "—",
      dot: "#9ca3af",
      cls: "bg-neutral-100 text-neutral-600 ring-neutral-200",
    }
  );
}

export type MemberStats = {
  nuevos: number;
  activos: number;
  nunca: number;
  conInventario: number;
};

// Drawn here from plain numbers rather than passed in as server-built JSX:
// that element list crossed into this client component key-less and React
// warned on every load.
function MemberStatCards({ stats }: { stats: MemberStats }) {
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label="Nuevos esta semana"
        value={n(stats.nuevos)}
        tint={{ bg: "#e8edff", fg: "#1c4588" }}
        icon={
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
          </>
        }
      />
      <StatCard
        label="Activos · 7 días"
        value={n(stats.activos)}
        tint={{ bg: "#d8f5e6", fg: "#047857" }}
        icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />}
      />
      <StatCard
        label="Nunca han entrado"
        value={n(stats.nunca)}
        tint={{ bg: "#fdf0d5", fg: "#b45309" }}
        icon={
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="m4.9 4.9 14.2 14.2" />
          </>
        }
      />
      <StatCard
        label="Con inventario"
        value={n(stats.conInventario)}
        tint={{ bg: "#ede9fe", fg: "#7c3aed" }}
        icon={
          <>
            <path d="M3 9.5 12 3l9 6.5" />
            <path d="M5 10v10h14V10" />
            <path d="M9 21v-6h6v6" />
          </>
        }
      />
    </section>
  );
}

const SORT_KEYS: SortKey[] = ["name", "inventory", "requests", "contacts", "events", "sends", "created_at", "last_active"];
const SORT_LABEL: Record<SortKey, string> = {
  name: "nombre",
  inventory: "inventario",
  requests: "requerimientos",
  contacts: "contactos",
  events: "eventos",
  sends: "envíos",
  created_at: "alta",
  last_active: "actividad",
};
const DEFAULT_SORT: SortKey = "created_at";
const defaultDir = (k: SortKey): SortDir => (k === "name" ? "asc" : "desc");

// Filters + sort live in the URL (?q=&estado=&tipo=&premium=1&inactivos=1
// &orden=&dir=), so a refresh or «back» from a profile keeps them and a
// filtered list can be sent as a link. The Aprobaciones duplicate chip links
// here with ?q=.
export function BrokerTable({
  brokers,
  stats,
}: {
  brokers: BrokerRow[];
  /** Numbers for the four cards above the table (computed on the server). */
  stats: MemberStats;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [filters, setFilters] = useState<BrokerFilters>(() => filtersFromParams(params));
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const k = params.get("orden") as SortKey;
    return SORT_KEYS.includes(k) ? k : DEFAULT_SORT;
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const d = params.get("dir");
    return d === "asc" || d === "desc" ? d : defaultDir(sortKey);
  });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuFor(null), []);
  const set = <K extends keyof BrokerFilters>(k: K, v: BrokerFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  // Mirror state → URL without a navigation (no server round-trip per key).
  useEffect(() => {
    const p = filtersToParams(filters, new URLSearchParams(window.location.search));
    if (sortKey !== DEFAULT_SORT) p.set("orden", sortKey);
    else p.delete("orden");
    if (sortDir !== defaultDir(sortKey)) p.set("dir", sortDir);
    else p.delete("dir");
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [filters, sortKey, sortDir]);

  // Counts follow the other filters, so each pill/chip says how many you'd
  // get by clicking it right now.
  const tierCounts = useMemo(() => {
    const base = filterExceptTier(brokers, filters);
    const c = { todos: base.length, asesor: 0, servicios: 0, cliente: 0, invitado: 0 };
    for (const b of base) c[tierOf(b.profile_type)]++;
    return c;
  }, [brokers, filters]);
  const premiumCount = useMemo(
    () => filterBrokers(brokers, { ...filters, premium: true }).length,
    [brokers, filters],
  );
  const inactiveCount = useMemo(
    () => filterBrokers(brokers, { ...filters, inactivos: true }).length,
    [brokers, filters],
  );

  // «Estado» dropdown, biggest first (Puebla dwarfs the rest). Counted over
  // everyone so the list stays put; multi-state members count in each.
  const stateCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const b of brokers) for (const s of b.states) c.set(s, (c.get(s) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [brokers]);

  const rows = useMemo(() => {
    const filtered = filterBrokers(brokers, filters);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * (a.name ?? "").localeCompare(b.name ?? "", "es");
        case "inventory":
          return dir * (a.inventory - b.inventory);
        case "requests":
          return dir * (a.requests - b.requests);
        case "contacts":
          return dir * (a.contacts - b.contacts);
        case "events":
          return dir * (a.events_attended - b.events_attended);
        case "sends":
          return dir * (a.sends - b.sends || a.opens - b.opens);
        case "created_at":
          return dir * ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1);
        case "last_active":
          return (
            dir *
            ((a.last_active ?? "") < (b.last_active ?? "") ? -1 : 1)
          );
      }
    });
  }, [brokers, filters, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultDir(key));
    }
  }

  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="flex flex-1 flex-col">
      {/* Same toolbar as Mapa and Eventos: who to look at (left) · search + export (right). */}
      <Toolbar>
        <PillTray>
          <PillSegment
            value={filters.tipo}
            onChange={(v) => set("tipo", v)}
            options={[
              ["todos", `Todos · ${n(tierCounts.todos)}`],
              ["asesor", `Asesores · ${n(tierCounts.asesor)}`],
              ["servicios", `Servicios · ${n(tierCounts.servicios)}`],
              ["cliente", `Clientes · ${n(tierCounts.cliente)}`],
              ["invitado", `Invitados · ${n(tierCounts.invitado)}`],
            ]}
          />
          <FilterChip
            on={filters.premium}
            onClick={() => set("premium", !filters.premium)}
            label="★ Premium"
            title="Solo miembros que PAGAN Premium (excluye cortesías y ventas a mano)"
            count={premiumCount}
            tone="amber"
          />
          <FilterChip
            on={filters.inactivos}
            onClick={() => set("inactivos", !filters.inactivos)}
            label="Inactivos"
            title={`Nunca han abierto la app, o no en los últimos ${INACTIVE_DAYS} días — la lista para darles seguimiento`}
            count={inactiveCount}
          />
          <PillSelect
            value={filters.estado}
            onChange={(v) => set("estado", v)}
            ariaLabel="Estado"
            options={[
              ["todos", "Todos los estados"],
              ...stateCounts.map(([s, c]) => [s, `${s} (${n(c)})`] as [string, string]),
            ]}
          />
        </PillTray>

        <div className="flex flex-wrap items-center gap-2">
          <PillSearch
            value={filters.q}
            onChange={(v) => set("q", v)}
            placeholder="Nombre, empresa o teléfono"
          />
          <ExcelButton filters={filters} count={rows.length} total={brokers.length} />
          <ToolbarDivider />
          <span className="hidden items-baseline gap-1.5 text-sm text-neutral-500 sm:inline-flex">
            <span>
              <span className="font-semibold tabular-nums text-neutral-900">{n(rows.length)}</span>{" "}
              {rows.length === 1 ? "miembro" : "miembros"}
            </span>
            {/* What the list is sorted by — at laptop widths the default
                column (Alta) isn't on screen. Click flips the direction. */}
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title="Cambiar el orden"
              className="rounded-md px-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              · por {SORT_LABEL[sortKey]} {sortDir === "asc" ? "▲" : "▼"}
            </button>
          </span>
        </div>
      </Toolbar>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        <MemberStatCards stats={stats} />
        {/* overflow-clip, not -hidden: clips the rounded corners WITHOUT becoming
            a scroll container, which is what kept the column header from
            pinning under the nav while scrolling. */}
        <div className="overflow-clip rounded-2xl border border-black/[0.05] bg-white/90 shadow-soft backdrop-blur-sm">
      {/* Phones and narrow windows: stacked cards. The table needs ~880px, so it
          starts at 940px — it never scrolls sideways inside its card. */}
      <ul className="divide-y divide-neutral-50 min-[940px]:hidden">
        {rows.map((b) => {
          const c = avatarColors(b.name);
          const s = statusMeta(b.status);
          const act = relative(b.last_active);
          return (
            <li
              key={b.id}
              onClick={() => router.push(`/broker/${b.id}`)}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors active:bg-neutral-50"
            >
              {b.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.avatar_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]"
                />
              ) : (
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {initials(b.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-neutral-900">
                    {b.name ?? "—"}
                  </span>
                  {tierOf(b.profile_type) !== "asesor" ? (
                    <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                      {profileTypeLabel(b.profile_type)}
                    </span>
                  ) : null}
                  {b.premium ? (
                    <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-600/10" title="Premium pagado">
                      ★ Premium
                    </span>
                  ) : b.comped ? (
                    <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 ring-1 ring-neutral-600/10" title="Premium regalado — no cuenta como ingreso">
                      Cortesía
                    </span>
                  ) : null}
                  {b.blocked ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  ) : (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.dot }}
                    />
                  )}
                </div>
                {/* Two lines so nothing runs off a 390px screen: who/where,
                    then the numbers. */}
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-neutral-400">
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{b.phone ? fmtPhone(b.phone) : "—"}</span>
                  {b.states.length ? (
                    <>
                      <span className="shrink-0">·</span>
                      <span className="truncate">
                        {filters.estado !== "todos" && b.states.includes(filters.estado) ? filters.estado : b.states[0]}
                        {b.states.length > 1 ? ` +${b.states.length - 1}` : ""}
                      </span>
                    </>
                  ) : null}
                  <span className="shrink-0">·</span>
                  <span className="shrink-0 whitespace-nowrap" suppressHydrationWarning>{act.label}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] tabular-nums text-neutral-400">
                  {b.requests} req · {b.contacts} contactos · {b.events_attended} eventos · {b.sends} envíos
                </div>
              </div>
              <span
                className={`inline-block min-w-7 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                  b.inventory > 0 ? "bg-brand-light text-brand" : "text-neutral-300"
                }`}
              >
                {b.inventory}
              </span>
              <svg
                className="shrink-0 text-neutral-300"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-4 py-16 text-center text-sm text-neutral-400">
            Sin resultados.
          </li>
        ) : null}
      </ul>

      <div className="hidden min-[940px]:block">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          {/* Pinned just under the TopNav (65px tall incl. its border) so the
              column names stay in view while scrolling 1,500 rows. */}
          <thead className="sticky top-[64px] z-10 bg-neutral-50/95 backdrop-blur">
            <tr className="text-[11px] uppercase tracking-[0.02em] text-neutral-400">
              {/* Every other column carries a width, so the name column is the
                  one that flexes — otherwise it swallows the slack and pushes
                  the numbers off a laptop screen. Estado, App and Alta join from
                  xl (1280px); below that the row would overflow its card. */}
              <Th sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} className="min-w-[14rem]">
                Miembro
              </Th>
              <Th className="w-36">Teléfono</Th>
              <Th className="hidden w-32 xl:table-cell">Estado</Th>
              <Th sortKey="inventory" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" className="w-20">
                Inventario
              </Th>
              <Th sortKey="requests" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" className="w-14">
                Req.
              </Th>
              <Th sortKey="contacts" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" className="w-20">
                Contactos
              </Th>
              <Th sortKey="events" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" className="w-16">
                Eventos
              </Th>
              <Th sortKey="sends" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" className="w-20">
                Envíos
              </Th>
              <Th align="center" className="hidden w-14 xl:table-cell">App</Th>
              <Th sortKey="created_at" active={sortKey} dir={sortDir} onSort={toggleSort} className="hidden w-24 xl:table-cell">
                Alta
              </Th>
              <Th sortKey="last_active" active={sortKey} dir={sortDir} onSort={toggleSort} className="w-24">
                Actividad
              </Th>
              <th className="w-12 border-b border-neutral-100" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const c = avatarColors(b.name);
              const act = relative(b.last_active);
              const flag = exceptionBadge(b.status, b.blocked);
              return (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/broker/${b.id}`)}
                  className="group cursor-pointer transition-colors hover:bg-brand-light/50"
                >
                  {/* min-w floors the name column so the fixed-width stat
                      columns can never squeeze it to a letter; max-w-0 keeps
                      the truncation working above that floor. */}
                  <Td className="min-w-[14rem] max-w-0">
                    <div className="flex items-center gap-3">
                      {b.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.avatar_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]"
                        />
                      ) : (
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {initials(b.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate font-medium text-neutral-900 group-hover:text-brand">
                          <span className="truncate">{b.name ?? "—"}</span>
                          {/* Status only when it's the exception — 1,536 of
                              1,537 are «Aprobado», so a column of it said
                              nothing (2026-09-28). */}
                          {flag ? (
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${flag.cls}`}>
                              {flag.label}
                            </span>
                          ) : null}
                          {tierOf(b.profile_type) !== "asesor" ? (
                            <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                              {profileTypeLabel(b.profile_type)}
                            </span>
                          ) : null}
                          {b.premium ? (
                            <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-600/10" title="Premium pagado">
                              ★ Premium
                            </span>
                          ) : b.comped ? (
                            <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 ring-1 ring-neutral-600/10" title="Premium regalado — no cuenta como ingreso">
                              Cortesía
                            </span>
                          ) : null}
                        </div>
                        {b.company ? (
                          <div className="truncate text-xs text-neutral-400">
                            {b.company}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {b.phone ? <CopyPhone phone={b.phone} /> : <span className="text-xs text-neutral-300">—</span>}
                  </Td>
                  <Td className="hidden xl:table-cell">
                    <Estados states={b.states} prefer={filters.estado} />
                  </Td>
                  <Td align="right">
                    <Num value={b.inventory} tone="brand" />
                  </Td>
                  <Td align="right">
                    <Num value={b.requests} />
                  </Td>
                  <Td align="right">
                    <Num value={b.contacts} />
                  </Td>
                  <Td align="right">
                    <Num value={b.events_attended} tone="emerald" />
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {b.opens > 0 ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-neutral-400"
                          title={`${b.opens} ${b.opens === 1 ? "vista verificada" : "vistas verificadas"} de sus fichas`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          {b.opens}
                        </span>
                      ) : null}
                      <Num value={b.sends} />
                    </span>
                  </Td>
                  <Td align="center" className="hidden xl:table-cell">
                    <Platforms list={b.platforms} />
                  </Td>
                  <Td className="hidden whitespace-nowrap xl:table-cell">
                    <span className="text-xs text-neutral-500">
                      {fmtDate(b.created_at)}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${act.fresh ? "bg-emerald-500" : "bg-neutral-200"}`}
                      />
                      {/* Relative time: the server and the browser can land on
                          different minutes — expected, not a bug. */}
                      <span suppressHydrationWarning>{act.label}</span>
                    </span>
                  </Td>
                  <td className="border-b border-neutral-100/80 px-2 py-2.5 text-right [tr:last-child>&]:border-0" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      open={menuFor === b.id}
                      onToggle={() => setMenuFor((v) => (v === b.id ? null : b.id))}
                      onClose={closeMenu}
                      id={b.id}
                      name={b.name}
                      blocked={b.blocked}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-sm text-neutral-400">
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
        </div>
        <p className="mt-4 text-xs text-neutral-400">MB = almacenamiento en R2 (pendiente de conectar).</p>
      </main>
    </div>
  );
}

// A count that fades to nothing when it's zero — the eye should land on the
// members who DO things, not on a wall of zeros.
// Zeros are the norm (most members haven't posted yet), so a zero is a faint
// dot and only real numbers get ink — the active rows stand out at a glance.
function Num({ value, tone }: { value: number; tone?: "emerald" | "brand" }) {
  if (value === 0) return <span className="px-2 text-sm text-neutral-300">·</span>;
  return (
    <span
      className={`inline-block min-w-7 rounded-md px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
        tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : tone === "brand"
            ? "bg-brand-light text-brand"
            : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {value}
    </span>
  );
}

// Status as a badge beside the name, only when it isn't the usual «Aprobado».
function exceptionBadge(status: string | null, blocked: boolean) {
  if (blocked) return { label: "Bloqueado", cls: "bg-rose-50 text-rose-700 ring-rose-600/15" };
  if (status === "approved") return null;
  const m = statusMeta(status);
  return { label: m.label, cls: m.cls };
}

// Which app(s) the member's push registrations come from. No registration at
// all usually means web-only, or notifications never granted.
function Platforms({ list }: { list: string[] }) {
  if (list.length === 0) return <span className="text-sm text-neutral-300">·</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-500">
      {list.map((p) =>
        p === "ios" ? (
          <svg key={p} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-label="iOS">
            <title>iOS</title>
            <path d="M16.37 12.63c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.9 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.4-3.67ZM14.1 5.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.78 1.02.08 2.05-.52 2.68-1.27Z" />
          </svg>
        ) : p === "android" ? (
          <svg key={p} width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-label="Android">
            <title>Android</title>
            <path d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.87 3.23a11.43 11.43 0 0 0-9.82 0L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52ZM7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25Zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25Z" />
          </svg>
        ) : (
          <span key={p} className="text-[10px] font-semibold uppercase">
            {p}
          </span>
        ),
      )}
    </span>
  );
}

// «⋯» at the end of the row: Ver perfil + Bloquear. Replaces the red
// «Bloquear» button that sat on all 1,537 rows (2026-09-28) — a rare,
// destructive action one click deeper. Faint until the row is hovered.
// The menu is portaled to <body> with fixed coords: the table card clips
// (overflow-hidden) and its backdrop-blur would trap a fixed overlay.
function RowMenu({
  open,
  onToggle,
  onClose,
  id,
  name,
  blocked,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  id: string;
  name: string | null;
  blocked: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 120;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
          open
            ? "bg-white text-neutral-800 shadow-sm ring-1 ring-black/[0.06]"
            : "text-neutral-300 hover:bg-white hover:text-neutral-700 group-hover:text-neutral-500"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              style={{
                top: pos.top,
                right: pos.right,
                transform: pos.up ? "translateY(-100%)" : undefined,
              }}
              className="fixed z-50 min-w-40 rounded-xl bg-white p-1 text-left shadow-lg ring-1 ring-black/[0.06]"
            >
              <Link
                href={`/broker/${id}`}
                role="menuitem"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Ver perfil
              </Link>
              <div className="mx-2 my-1 h-px bg-neutral-100" />
              <BlockButton id={id} name={name} blocked={blocked} variant="menu" onDone={onClose} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Click the phone to copy it (+52… in E.164, pastes cleanly into WhatsApp,
// the dialer or a sheet). Doesn't open the member — the row click still does.
function CopyPhone({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  const e164 = `+${phone.replace(/\D/g, "")}`;
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(e164);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (no permission / insecure context) — nothing to do.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copiar teléfono"
      className={`-mx-1.5 rounded-md px-1.5 py-0.5 text-xs tabular-nums transition ${
        copied ? "bg-emerald-50 text-emerald-700" : "text-neutral-600 hover:bg-white hover:text-neutral-900 hover:shadow-sm"
      }`}
    >
      {copied ? "✓ Copiado" : fmtPhone(phone)}
    </button>
  );
}

// Downloads the list as .xlsx — Pablo's contact sheet for campaigns. Fetched
// rather than linked so the wait is visible: building the file takes a second,
// and a link that looks inert for that long reads as broken.
function ExcelButton({
  filters,
  count,
  total,
}: {
  filters: BrokerFilters;
  count: number;
  total: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = count !== total;

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const qs = filtersToParams(filters).toString();
      const res = await fetch(`/api/export/brokers${qs ? `?${qs}` : ""}`);
      // An expired session doesn't 401 — the proxy redirects to /login and we
      // get a 200 full of HTML, so trust the content type, not res.ok.
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
      if (!type.includes("spreadsheetml")) {
        throw new Error("Tu sesión expiró. Vuelve a entrar.");
      }

      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("content-disposition") ?? "",
        )?.[1] ?? "brokers-propia.xlsx";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      // Safari needs the blob to outlive the click.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo generar el archivo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <span
          title={error}
          className="max-w-40 truncate text-xs font-medium text-rose-600"
        >
          {error}
        </span>
      ) : null}
      <button
        onClick={download}
        disabled={busy || count === 0}
        title={
          filtered
            ? `Descargar los ${count} miembros de esta vista (con los mismos filtros)`
            : "Descargar todos los miembros (nombre, teléfono, email)"
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand/25 bg-white px-3 text-sm font-medium text-brand shadow-sm transition hover:bg-brand-light disabled:opacity-40"
      >
        {busy ? (
          <svg
            className="animate-spin"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.6" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        )}
        {busy ? "Generando…" : "Excel"}
        {filtered && count > 0 ? (
          <span className="tabular-nums opacity-60">({count.toLocaleString("en-US")})</span>
        ) : null}
      </button>
    </>
  );
}

function Th({
  children,
  align = "left",
  sortKey,
  active,
  dir,
  onSort,
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  sortKey?: SortKey;
  active?: SortKey;
  dir?: SortDir;
  onSort?: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = sortKey && active === sortKey;
  const sortable = sortKey && onSort;
  return (
    <th
      className={`border-b border-neutral-100 px-2.5 py-2.5 font-semibold ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {sortable ? (
        // Buttons don't inherit text-transform — without `uppercase` here the
        // sortable headers came out mixed-case next to the plain ones.
        <button
          onClick={() => onSort!(sortKey!)}
          className={`inline-flex items-center gap-1 uppercase tracking-[0.02em] transition-colors hover:text-neutral-700 ${
            align === "right" ? "flex-row-reverse" : ""
          } ${isActive ? "text-neutral-800" : ""}`}
        >
          {children}
          {/* Only the active column carries the arrow — a hidden one still
              took ~12px on every sortable header. */}
          {isActive ? <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-neutral-100/80 px-2.5 py-2.5 align-middle [tr:last-child>&]:border-0 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

// One line, always: the main state + «+N» (hover lists them all). Stacked
// chips made multi-state rows three times taller (2026-09-28). With the
// «Estado» filter on, that state leads.
function Estados({ states, prefer }: { states: string[]; prefer?: string }) {
  if (!states.length) return <span className="text-sm text-neutral-300">·</span>;
  const first = prefer && states.includes(prefer) ? prefer : states[0];
  const extra = states.length - 1;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5" title={states.join(", ")}>
      <span className="truncate text-xs text-neutral-600">{first}</span>
      {extra > 0 ? (
        <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-500">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
