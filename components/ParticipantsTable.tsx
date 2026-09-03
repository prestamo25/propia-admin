"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { avatarColors, initials } from "@/lib/format";
import { ATTENDEE_STATUS_LABEL, STATUS_ORDER, fmtPhone, fmtStamp, type Participant } from "@/lib/eventos";

const STATUS_CLS: Record<string, string> = {
  attended: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  confirmed: "bg-sky-50 text-sky-700 ring-sky-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  waitlist: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  invited: "bg-neutral-100 text-neutral-500 ring-neutral-200",
  declined: "bg-rose-50 text-rose-700 ring-rose-200",
};

// Who is in the room, and the trail behind each seat: when they registered,
// when they were scanned and by whom, and for paid events the receipt and
// who approved it. Read-only by design (Franz 2026-09-02).
export function ParticipantsTable({ participants, isPaid }: { participants: Participant[]; isPaid: boolean }) {
  const [status, setStatus] = useState<string>("todos");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of participants) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [participants]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = new Map(STATUS_ORDER.map((s, i) => [s, i]));
    return participants
      .filter((p) => status === "todos" || p.status === status)
      .filter((p) => !q || `${p.name ?? ""} ${p.company ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (order.get(a.status as never) ?? 99) - (order.get(b.status as never) ?? 99) ||
          (a.name ?? "").localeCompare(b.name ?? "", "es"),
      );
  }, [participants, status, query]);

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
      <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatus("todos")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition ${
              status === "todos" ? "bg-brand text-white ring-brand" : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"
            }`}
          >
            Todos ({participants.length})
          </button>
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition ${
                status === s ? "bg-brand text-white ring-brand" : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {ATTENDEE_STATUS_LABEL[s]} ({counts[s]})
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar participante"
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-brand focus:outline-none sm:w-64"
        />
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-500">Nadie con este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2.5 font-medium">Participante</th>
                <th className="px-4 py-2.5 font-medium">Teléfono</th>
                <th className="px-4 py-2.5 font-medium">Estatus</th>
                <th className="px-4 py-2.5 font-medium">Registro</th>
                <th className="px-4 py-2.5 font-medium">Check-in</th>
                <th className="px-4 py-2.5 font-medium">Escaneó</th>
                {isPaid ? <th className="px-4 py-2.5 font-medium">Comprobante</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((p) => {
                const c = avatarColors(p.user_id);
                return (
                  <tr key={p.id} className="transition hover:bg-neutral-50/80">
                    <td className="px-4 py-2.5">
                      <Link href={`/broker/${p.user_id}`} className="group flex items-center gap-2.5">
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]" />
                        ) : (
                          <span
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                            style={{ backgroundColor: c.bg, color: c.fg }}
                          >
                            {initials(p.name)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-900 group-hover:text-brand">{p.name ?? "—"}</span>
                          {p.company ? <span className="block truncate text-xs text-neutral-400">{p.company}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-neutral-700">{fmtPhone(p.phone)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CLS[p.status] ?? STATUS_CLS.invited}`}>
                        {p.status === "attended" ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : null}
                        {ATTENDEE_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">
                      {fmtStamp(p.created_at)}
                      {p.invited_by ? <span className="block text-neutral-400">invitó {p.invited_by}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-neutral-700">
                      {p.checked_in_at ? fmtStamp(p.checked_in_at) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-700">
                      {p.checked_in_at ? (p.checked_in_by ?? <span className="text-neutral-400">sin registro</span>) : <span className="text-neutral-300">—</span>}
                    </td>
                    {isPaid ? (
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                        {p.receipt_url ? (
                          <a href={p.receipt_url} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                            Ver comprobante
                          </a>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                        {p.approved_by ? <span className="block text-neutral-400">aprobó {p.approved_by}</span> : null}
                      </td>
                    ) : null}
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
