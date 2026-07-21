"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BrokerRow } from "@/lib/data";
import { BlockButton } from "@/components/BlockButton";
import { avatarColors, fmtDate, initials, relative } from "@/lib/format";

type SortKey = "name" | "inventory" | "created_at" | "last_active";
type SortDir = "asc" | "desc";

const STATUS: Record<string, { label: string; dot: string; cls: string }> = {
  approved: {
    label: "Aprobado",
    dot: "#10b981",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  pending: {
    label: "Pendiente",
    dot: "#f59e0b",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  rejected: {
    label: "Rechazado",
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

export function BrokerTable({ brokers }: { brokers: BrokerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? brokers.filter((b) =>
          [b.name, b.company, b.phone, b.states.join(" ")]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : brokers;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * (a.name ?? "").localeCompare(b.name ?? "", "es");
        case "inventory":
          return dir * (a.inventory - b.inventory);
        case "created_at":
          return dir * ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1);
        case "last_active":
          return (
            dir *
            ((a.last_active ?? "") < (b.last_active ?? "") ? -1 : 1)
          );
      }
    });
  }, [brokers, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white/90 shadow-soft backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar broker, teléfono, estado…"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
          />
        </div>
        <span className="shrink-0 text-sm tabular-nums text-neutral-400">
          {rows.length} {rows.length === 1 ? "broker" : "brokers"}
        </span>
      </div>

      {/* Phones: stacked cards (the 10-column table can't breathe at 390px). */}
      <ul className="divide-y divide-neutral-50 md:hidden">
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
                  {b.blocked ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  ) : (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: s.dot }}
                    />
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                  <span className="font-mono">{b.phone ?? "—"}</span>
                  <span>·</span>
                  <span className="truncate">{act.label}</span>
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

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur">
            <tr className="text-xs uppercase tracking-wide text-neutral-500">
              <Th sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort}>
                Broker
              </Th>
              <Th>Teléfono</Th>
              <Th>Estados</Th>
              <Th>Estatus</Th>
              <Th sortKey="inventory" active={sortKey} dir={sortDir} onSort={toggleSort} align="right">
                Inventario
              </Th>
              <Th align="right">MB</Th>
              <Th sortKey="created_at" active={sortKey} dir={sortDir} onSort={toggleSort}>
                Alta
              </Th>
              <Th sortKey="last_active" active={sortKey} dir={sortDir} onSort={toggleSort}>
                Actividad
              </Th>
              <Th align="right">Acciones</Th>
              <th className="w-8 border-b border-neutral-100" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const c = avatarColors(b.name);
              const s = statusMeta(b.status);
              const act = relative(b.last_active);
              return (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/broker/${b.id}`)}
                  className="group cursor-pointer border-b border-neutral-50 transition-colors last:border-0 hover:bg-neutral-50/70"
                >
                  <Td>
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
                        <div className="truncate font-medium text-neutral-900 group-hover:text-brand">
                          {b.name ?? "—"}
                        </div>
                        {b.company ? (
                          <div className="truncate text-xs text-neutral-400">
                            {b.company}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-neutral-600">
                      {b.phone ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <Estados states={b.states} />
                  </Td>
                  <Td>
                    {b.blocked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Bloqueado
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.cls}`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: s.dot }}
                        />
                        {s.label}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <span
                      className={`inline-block min-w-7 rounded-md px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                        b.inventory > 0
                          ? "bg-brand-light text-brand"
                          : "text-neutral-300"
                      }`}
                    >
                      {b.inventory}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="text-xs tabular-nums text-neutral-300">
                      {b.mb_used == null ? "—" : b.mb_used.toFixed(1)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-neutral-500">
                      {fmtDate(b.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                      {act.fresh ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
                      )}
                      {act.label}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className="inline-block"
                    >
                      <BlockButton id={b.id} name={b.name} blocked={b.blocked} />
                    </span>
                  </Td>
                  <td className="px-2 py-3 text-right">
                    <Link
                      href={`/broker/${b.id}`}
                      aria-label="Ver broker"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex text-neutral-300 transition group-hover:text-neutral-600"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-sm text-neutral-400">
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sortKey?: SortKey;
  active?: SortKey;
  dir?: SortDir;
  onSort?: (k: SortKey) => void;
}) {
  const isActive = sortKey && active === sortKey;
  const sortable = sortKey && onSort;
  return (
    <th
      className={`border-b border-neutral-100 px-4 py-3 font-medium ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {sortable ? (
        <button
          onClick={() => onSort!(sortKey!)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-neutral-800 ${
            align === "right" ? "flex-row-reverse" : ""
          } ${isActive ? "text-neutral-800" : ""}`}
        >
          {children}
          <span className={`text-[10px] ${isActive ? "opacity-100" : "opacity-0"}`}>
            {dir === "asc" ? "▲" : "▼"}
          </span>
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
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-4 py-3 align-middle ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}

function Estados({ states }: { states: string[] }) {
  if (!states.length) return <span className="text-neutral-300">—</span>;
  const shown = states.slice(0, 3);
  const extra = states.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((s) => (
        <span
          key={s}
          className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600"
        >
          {s}
        </span>
      ))}
      {extra > 0 ? (
        <span className="text-[11px] font-medium text-neutral-400">+{extra}</span>
      ) : null}
    </div>
  );
}
