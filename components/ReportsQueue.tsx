"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { setReportStatus } from "@/app/actions";
import { relative } from "@/lib/format";
import type { ReportRow, ReportsData, ReportStatus, TargetType } from "@/lib/reports";

const TARGET: Record<TargetType, { label: string; cls: string }> = {
  property: { label: "Propiedad", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  profile: { label: "Perfil", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  request: { label: "Requerimiento", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
};

const STATUS_META: Record<ReportStatus, { label: string; dot: string; accent: string }> = {
  open: { label: "Abierto", dot: "#f59e0b", accent: "bg-amber-400" },
  actioned: { label: "Revisado", dot: "#10b981", accent: "bg-emerald-500" },
  dismissed: { label: "Descartado", dot: "#9ca3af", accent: "bg-neutral-300" },
};

const FILTERS: { key: ReportStatus | "all"; label: string }[] = [
  { key: "open", label: "Abiertos" },
  { key: "actioned", label: "Revisados" },
  { key: "dismissed", label: "Descartados" },
  { key: "all", label: "Todos" },
];

export function ReportsQueue({ data }: { data: ReportsData }) {
  const [filter, setFilter] = useState<ReportStatus | "all">("open");

  const rows = useMemo(
    () => (filter === "all" ? data.reports : data.reports.filter((r) => r.status === filter)),
    [data.reports, filter],
  );

  const countFor = (key: ReportStatus | "all") =>
    key === "all" ? data.counts.total : data.counts[key];

  return (
    <div>
      {/* filter segmented */}
      {/* max-w + scroll: the three tabs overflowed 390px phones by ~90px. */}
      <div className="mb-5 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-neutral-200/40 p-1 sm:inline-flex sm:w-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.04]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 text-xs tabular-nums ${
                f.key === "open" && countFor(f.key) > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {countFor(f.key)}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/50 py-20 text-center">
          <div className="text-3xl">✓</div>
          <p className="mt-2 text-sm text-neutral-500">
            {filter === "open" ? "Sin reportes pendientes. Todo limpio." : "Nada por aquí."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonButton({
  href,
  role,
  name,
  icon,
}: {
  href: string;
  role: string;
  name: string | null;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-white px-2.5 py-1.5 text-sm shadow-sm transition hover:-translate-y-px hover:border-brand/50 hover:bg-brand-light hover:shadow"
    >
      {icon}
      <span className="text-xs text-neutral-400">{role}:</span>
      <span className="font-medium text-brand">{name ?? "Ver perfil"}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-brand opacity-60">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

function ReportCard({ report: r }: { report: ReportRow }) {
  const [pending, startTransition] = useTransition();
  const t = TARGET[r.target_type];
  const s = STATUS_META[r.status];
  const when = relative(r.created_at);

  const set = (status: ReportStatus) =>
    startTransition(async () => {
      const res = await setReportStatus(r.id, status);
      if (res?.error) alert(res.error);
    });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-soft">
      <span className={`absolute inset-y-0 left-0 w-1 ${s.accent}`} />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-900">{r.reason}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.cls}`}>
              {t.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
              {s.label}
            </span>
          </div>

          <p className="mt-1 truncate text-sm text-neutral-600">
            {r.target_label ?? "—"}
          </p>

          {r.note ? (
            <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              “{r.note}”
            </p>
          ) : null}

          {/* Both parties as buttons — the accused and the reporter each
              drill into their broker profile (Franz 2026-08-20). */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {r.owner_id ? (
              <PersonButton
                href={`/broker/${r.owner_id}`}
                role="Reportado"
                name={r.owner_name}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-rose-500">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" x2="4" y1="22" y2="15" />
                  </svg>
                }
              />
            ) : null}
            <PersonButton
              href={`/broker/${r.reporter_id}`}
              role="Reportó"
              name={r.reporter_name}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-neutral-400">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              }
            />
            <span className="text-xs text-neutral-400">{when.label}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {r.status === "open" ? (
            <>
              <button
                onClick={() => set("actioned")}
                disabled={pending}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-50 disabled:opacity-50"
              >
                Revisado
              </button>
              <button
                onClick={() => set("dismissed")}
                disabled={pending}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Descartar
              </button>
            </>
          ) : (
            <button
              onClick={() => set("open")}
              disabled={pending}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
