"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FeedItem, Metric, Pulse } from "@/lib/pulse";

const POLL_MS = 20_000;

const KIND: Record<
  FeedItem["kind"],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  member: {
    label: "Nuevo miembro",
    color: "#2E5FB0",
    bg: "#eaf0fb",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
  },
  property: {
    label: "Nueva propiedad",
    color: "#059669",
    bg: "#e3f5ec",
    icon: (
      <>
        <path d="M3 9.5 12 3l9 6.5" />
        <path d="M5 10v10h14V10" />
      </>
    ),
  },
  request: {
    label: "Nuevo requerimiento",
    color: "#C2410C",
    bg: "#fdece4",
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
};

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const num = (n: number) => n.toLocaleString("es-MX");

// Tiny 14-day sparkline — shape only, no axes (the number above carries value).
function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 96;
  const H = 26;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, H - (v / max) * (H - 3) - 1.5]);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const [lx, ly] = pts[pts.length - 1] ?? [0, H];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[26px] w-24 overflow-visible" aria-hidden>
      <path d={area} fill={color} opacity="0.10" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

function Delta({ today, ref_ }: { today: number; ref_: number }) {
  const d = today - ref_;
  if (ref_ === 0 && today === 0) {
    return <span className="text-xs text-neutral-400">sin actividad aún</span>;
  }
  const up = d > 0;
  const flat = d === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        flat ? "text-neutral-400" : up ? "text-emerald-600" : "text-rose-500"
      }`}
      title="Comparado con la misma hora de ayer"
    >
      {!flat && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`h-3 w-3 ${up ? "" : "rotate-180"}`}>
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </svg>
      )}
      {flat ? "igual que ayer" : `${up ? "+" : ""}${num(d)} vs ayer`}
    </span>
  );
}

function HeroMetric({
  label,
  metric,
  color,
  href,
}: {
  label: string;
  metric: Metric;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-medium text-neutral-500">{label}</span>
        </span>
        <Spark values={metric.spark} color={color} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">
          {num(metric.today)}
        </span>
        <span className="text-xs text-neutral-400">hoy</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <Delta today={metric.today} ref_={metric.sameTimeYesterday} />
        <span className="text-[11px] tabular-nums text-neutral-400">
          {num(metric.total)} total
        </span>
      </div>
      {metric.lastHour > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-neutral-50 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {num(metric.lastHour)} en la última hora
        </div>
      )}
    </Link>
  );
}

// Today's rhythm — stacked hourly activity, current hour highlighted.
function HourlyPulse({ hourly }: { hourly: Pulse["hourly"] }) {
  const nowHour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }),
  ).getHours();
  const max = Math.max(1, ...hourly.map((h) => h.members + h.properties + h.requests));
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {hourly.map((h) => {
          const total = h.members + h.properties + h.requests;
          const future = h.hour > nowHour;
          const isNow = h.hour === nowHour;
          return (
            <div
              key={h.hour}
              className="group relative flex flex-1 flex-col justify-end"
              title={`${String(h.hour).padStart(2, "0")}:00 — ${total} eventos`}
            >
              {total === 0 ? (
                <div
                  className={`w-full rounded-[2px] ${future ? "bg-neutral-100/70" : "bg-neutral-100"}`}
                  style={{ height: 3 }}
                />
              ) : (
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-[3px]"
                  style={{ height: `${Math.max(6, (total / max) * 96)}px` }}
                >
                  {h.members > 0 && <div style={{ flex: h.members, background: "#2E5FB0" }} />}
                  {h.properties > 0 && <div style={{ flex: h.properties, background: "#059669" }} />}
                  {h.requests > 0 && <div style={{ flex: h.requests, background: "#C2410C" }} />}
                </div>
              )}
              {isNow && <span className="absolute -bottom-[7px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-neutral-900" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between text-[10px] tabular-nums text-neutral-400">
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

const LEVEL_STYLE = {
  ok: { dot: "bg-emerald-500", text: "text-neutral-800", ring: "" },
  warn: { dot: "bg-amber-500", text: "text-amber-700", ring: "ring-1 ring-amber-200 bg-amber-50/40" },
  down: { dot: "bg-rose-500", text: "text-rose-700", ring: "ring-1 ring-rose-200 bg-rose-50/50" },
} as const;

function HealthCard({ health }: { health: Pulse["health"] }) {
  const worst = health.worst;
  return (
    <section
      className={`rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft ${
        worst === "ok" ? "" : LEVEL_STYLE[worst].ring
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Salud del sistema</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${LEVEL_STYLE[worst].dot}`} />
          <span className={worst === "ok" ? "text-emerald-600" : LEVEL_STYLE[worst].text}>
            {worst === "ok" ? "Todo operando" : worst === "warn" ? "Revisar" : "Falla detectada"}
          </span>
        </span>
      </div>
      <ul className="divide-y divide-neutral-50">
        {health.items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 py-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_STYLE[i.level].dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-neutral-800">{i.label}</span>
              <span className="block truncate text-[11px] text-neutral-400">{i.detail}</span>
            </span>
            <span className={`shrink-0 text-xs font-medium tabular-nums ${LEVEL_STYLE[i.level].text}`}>
              {i.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LivePulse({ initial }: { initial: Pulse }) {
  const [pulse, setPulse] = useState<Pulse>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [beat, setBeat] = useState(false);
  const prevFeedTop = useRef<string | undefined>(initial.feed[0]?.at);

  // Poll — pause while the tab is hidden so a background dashboard doesn't
  // burn requests all night.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const next: Pulse = await res.json();
        if (!active) return;
        setPulse(next);
        if (next.feed[0]?.at !== prevFeedTop.current) {
          prevFeedTop.current = next.feed[0]?.at;
          setBeat(true);
          setTimeout(() => setBeat(false), 1200);
        }
      } catch {
        /* keep showing the last good data */
      }
    };
    const id = setInterval(tick, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Keep the "hace X min" labels honest between polls.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const attention = pulse.attention.pending + pulse.attention.openReports;
  const todayTotal =
    pulse.members.today + pulse.properties.today + pulse.requests.today;

  return (
    <div className="space-y-6">
      {/* live status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-soft ring-1 ring-black/[0.05]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          En vivo
        </span>
        <span className="text-sm text-neutral-500">
          <b className="font-semibold tabular-nums text-neutral-800">{num(todayTotal)}</b> eventos hoy
        </span>
        {pulse.activeNow > 0 && (
          <span className="text-sm text-neutral-500">
            <b className="font-semibold tabular-nums text-neutral-800">{num(pulse.activeNow)}</b> miembros activos ahora
          </span>
        )}
        <span className={`ml-auto text-xs tabular-nums transition-colors ${beat ? "text-emerald-600" : "text-neutral-400"}`}>
          actualizado {timeAgo(pulse.at, now)}
        </span>
      </div>

      {/* hero metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeroMetric label="Registros" metric={pulse.members} color="#2E5FB0" href="/brokers" />
        <HeroMetric label="Propiedades" metric={pulse.properties} color="#059669" href="/panorama" />
        <HeroMetric label="Requerimientos" metric={pulse.requests} color="#C2410C" href="/panorama" />
        <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-neutral-500">Coincidencias</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">
              {num(pulse.matches.today)}
            </span>
            <span className="text-xs text-neutral-400">hoy</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <Delta today={pulse.matches.today} ref_={pulse.matches.sameTimeYesterday} />
            <span className="text-[11px] tabular-nums text-neutral-400">
              {num(pulse.matches.total)} total
            </span>
          </div>
          {pulse.matches.lastHour > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-neutral-50 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              {num(pulse.matches.lastHour)} en la última hora
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* activity feed */}
        <section className="min-w-0 rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Actividad en vivo</h2>
            <Link href="/en-vivo" className="text-xs font-medium text-neutral-400 transition hover:text-neutral-700">
              Tablero completo →
            </Link>
          </div>
          {pulse.feed.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">Sin actividad reciente.</p>
          ) : (
            <ul className="scroll-slim -my-1 max-h-[340px] space-y-0 overflow-y-auto pr-2">
              {pulse.feed.map((f, i) => {
                const k = KIND[f.kind];
                const fresh = now - new Date(f.at).getTime() < 5 * 60000;
                return (
                  <li
                    key={`${f.at}-${i}`}
                    className="flex items-center gap-3 border-b border-neutral-50 py-2 last:border-0"
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      style={{ background: k.bg, color: k.color }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        {k.icon}
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-800">{f.label}</span>
                      <span className="text-[11px] text-neutral-400">{k.label}</span>
                    </span>
                    {fresh && (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                        nuevo
                      </span>
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {timeAgo(f.at, now)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* today's rhythm */}
          <section className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">Ritmo de hoy</h2>
              <span className="flex items-center gap-2 text-[10px] text-neutral-400">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2E5FB0" }} />Altas</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#059669" }} />Props</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#C2410C" }} />Reqs</span>
              </span>
            </div>
            <HourlyPulse hourly={pulse.hourly} />
          </section>

          <HealthCard health={pulse.health} />

          {/* attention */}
          <section className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
            <h2 className="mb-2 text-sm font-semibold text-neutral-900">Requiere atención</h2>
            {attention === 0 ? (
              <div className="flex items-center gap-3 py-1 text-sm text-neutral-500">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Todo al día — nada pendiente.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {pulse.attention.pending > 0 && (
                  <li>
                    <Link href="/aprobaciones" className="group flex items-center gap-3 py-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-50 text-amber-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                      </span>
                      <span className="flex-1 text-sm text-neutral-700">
                        {pulse.attention.pending === 1
                          ? "1 cuenta espera aprobación"
                          : `${pulse.attention.pending} cuentas esperan aprobación`}
                      </span>
                      <span className="text-sm font-medium text-neutral-400 transition group-hover:text-neutral-700">→</span>
                    </Link>
                  </li>
                )}
                {pulse.attention.openReports > 0 && (
                  <li>
                    <Link href="/reportes" className="group flex items-center gap-3 py-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-rose-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" x2="4" y1="22" y2="15" />
                        </svg>
                      </span>
                      <span className="flex-1 text-sm text-neutral-700">
                        {pulse.attention.openReports === 1
                          ? "1 reporte abierto"
                          : `${pulse.attention.openReports} reportes abiertos`}
                      </span>
                      <span className="text-sm font-medium text-neutral-400 transition group-hover:text-neutral-700">→</span>
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
