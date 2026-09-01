"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BrokerRow } from "@/lib/data";
import { BlockButton } from "@/components/BlockButton";
import { filterBrokers } from "@/lib/brokerFilter";
import { tierOf, profileTypeLabel, type Tier } from "@/lib/profileTypes";
import {
  STATUS_LABEL,
  avatarColors,
  fmtDate,
  initials,
  relative,
} from "@/lib/format";

type SortKey = "name" | "inventory" | "created_at" | "last_active";
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

export function BrokerTable({ brokers }: { brokers: BrokerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<"todos" | Tier>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const tierCounts = useMemo(() => {
    const c = { todos: brokers.length, asesor: 0, servicios: 0, cliente: 0, invitado: 0 };
    for (const b of brokers) c[tierOf(b.profile_type)]++;
    return c;
  }, [brokers]);

  const rows = useMemo(() => {
    const inTier =
      tier === "todos" ? brokers : brokers.filter((b) => tierOf(b.profile_type) === tier);
    const filtered = filterBrokers(inTier, query);

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
  }, [brokers, tier, query, sortKey, sortDir]);

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
      {/* Tier tabs: everyone / asesores / proveedores de servicios / clientes */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-100 px-4 py-2.5">
        {(
          [
            ["todos", "Todos"],
            ["asesor", "Asesores"],
            ["servicios", "Servicios"],
            ["cliente", "Clientes"],
            ["invitado", "Invitados"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTier(key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tier === key
                ? "bg-brand text-white shadow-sm"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            }`}
          >
            {label}
            <span
              className={`text-xs tabular-nums ${
                tier === key ? "text-white/60" : "text-neutral-400"
              }`}
            >
              {tierCounts[key]}
            </span>
          </button>
        ))}
      </div>

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
            placeholder="Buscar miembro, teléfono, estado…"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50/60 py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm tabular-nums text-neutral-400 sm:inline">
            {rows.length} {rows.length === 1 ? "miembro" : "miembros"}
          </span>
          <ExcelButton query={query} count={rows.length} />
        </div>
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
                  {tierOf(b.profile_type) !== "asesor" ? (
                    <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                      {profileTypeLabel(b.profile_type)}
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
                Miembro
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
                        <div className="flex items-center gap-1.5 truncate font-medium text-neutral-900 group-hover:text-brand">
                          <span className="truncate">{b.name ?? "—"}</span>
                          {tierOf(b.profile_type) !== "asesor" ? (
                            <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                              {profileTypeLabel(b.profile_type)}
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

// Downloads the list as .xlsx — Pablo's contact sheet for campaigns. Fetched
// rather than linked so the wait is visible: building the file takes a second,
// and a link that looks inert for that long reads as broken.
function ExcelButton({ query, count }: { query: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/export/brokers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
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
          q
            ? `Descargar los ${count} brokers de esta búsqueda`
            : "Descargar todos los brokers (nombre, teléfono, email)"
        }
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand ring-1 ring-inset ring-brand/20 transition hover:bg-brand-light disabled:opacity-40"
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
        {q && count > 0 ? (
          <span className="tabular-nums opacity-60">({count})</span>
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
