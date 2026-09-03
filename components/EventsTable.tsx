"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EVENT_TYPE_LABEL,
  MODALITY_LABEL,
  ONLINE_KEY,
  fmtWhen,
  isPast,
  stateKey,
  type EventRow,
} from "@/lib/eventos";

type When = "proximos" | "pasados";

// Every event the network has, filtered client-side: the whole table is a
// few hundred rows at most, so one fetch and instant filters beat round
// trips. Rows link to the event's participants.
export function EventsTable({ events }: { events: EventRow[] }) {
  const [state, setState] = useState<string>("todos");
  const [when, setWhen] = useState<When>("proximos");
  const [privateOnly, setPrivateOnly] = useState(false);
  const [query, setQuery] = useState("");

  const states = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of events) {
      const k = stateKey(e);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => (a[0] === ONLINE_KEY ? 1 : b[0] === ONLINE_KEY ? -1 : b[1] - a[1]))
      .map(([k, n]) => ({ key: k, label: k === ONLINE_KEY ? "En línea" : k, n }));
  }, [events]);

  // Snapshot at mount: the upcoming/past split must not move mid-render.
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = events.filter((e) => {
      if (state !== "todos" && stateKey(e) !== state) return false;
      if (privateOnly && e.visibility !== "private") return false;
      if ((when === "pasados") !== isPast(e, now)) return false;
      if (q) {
        const hay = `${e.title} ${e.organizer?.name ?? ""} ${e.organizer?.company ?? ""} ${e.location ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Upcoming: soonest first. Past: most recent first.
    out.sort((a, b) =>
      when === "proximos"
        ? new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        : new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
    );
    return out;
  }, [events, state, when, privateOnly, query, now]);

  const counts = useMemo(() => {
    let proximos = 0;
    let pasados = 0;
    for (const e of events) {
      if (state !== "todos" && stateKey(e) !== state) continue;
      if (privateOnly && e.visibility !== "private") continue;
      if (isPast(e, now)) pasados++;
      else proximos++;
    }
    return { proximos, pasados };
  }, [events, state, privateOnly, now]);

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-neutral-100 p-1">
            {(
              [
                ["proximos", `Próximos (${counts.proximos})`],
                ["pasados", `Pasados (${counts.pasados})`],
              ] as [When, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setWhen(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  when === k ? "bg-white text-brand shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm focus:border-brand focus:outline-none"
            aria-label="Estado"
          >
            <option value="todos">Todos los estados</option>
            {states.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.n})
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm">
            <input
              type="checkbox"
              checked={privateOnly}
              onChange={(e) => setPrivateOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand"
            />
            Solo privados
          </label>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar evento u organizador"
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand focus:outline-none sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-500">Sin eventos con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Evento</th>
                <th className="px-3 py-2.5 font-medium">Organizador</th>
                <th className="px-3 py-2.5 font-medium">Lugar</th>
                <th className="px-3 py-2.5 text-right font-medium">Inscritos</th>
                <th className="px-3 py-2.5 text-right font-medium">Asistieron</th>
                <th className="px-3 py-2.5 text-right font-medium">Pendientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((e) => {
                const c = e.counts;
                const rate = c.registered > 0 ? Math.round((c.attended / c.registered) * 100) : null;
                return (
                  <tr key={e.id} className="group transition hover:bg-neutral-50/80">
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-neutral-700">
                      {fmtWhen(e.start_at, e.end_at)}
                    </td>
                    <td className="max-w-sm px-3 py-3">
                      <Link href={`/eventos/${e.id}`} className="block">
                        <div className="truncate font-medium text-neutral-900 group-hover:text-brand">{e.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
                            {EVENT_TYPE_LABEL[e.type] ?? e.type}
                          </span>
                          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-500">
                            {MODALITY_LABEL[e.modality] ?? e.modality}
                          </span>
                          {e.visibility === "private" ? (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-600/10">
                              Privado
                            </span>
                          ) : null}
                          {e.is_paid ? (
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-600/10">
                              {e.price != null ? `$${e.price.toLocaleString("en-US")}` : "De pago"}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </td>
                    <td className="max-w-[11rem] px-3 py-3">
                      <div className="truncate text-neutral-800">{e.organizer?.name ?? "—"}</div>
                      {e.organizer?.company ? (
                        <div className="truncate text-xs text-neutral-400">{e.organizer.company}</div>
                      ) : null}
                    </td>
                    <td className="max-w-[12rem] px-3 py-3 text-neutral-600">
                      <div className="truncate">{e.modality === "online" ? "En línea" : (e.location ?? "—")}</div>
                      {e.state ? <div className="text-xs text-neutral-400">{e.state}</div> : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-neutral-800">
                      {c.registered}
                      {e.capacity ? <span className="text-neutral-400"> / {e.capacity}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className={c.attended > 0 ? "font-medium text-emerald-700" : "text-neutral-400"}>{c.attended}</span>
                      {rate != null ? <span className="ml-1 text-xs text-neutral-400">{rate}%</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {c.pending > 0 ? (
                        <span className="font-medium text-amber-700">{c.pending}</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
