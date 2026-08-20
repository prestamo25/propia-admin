"use client";

import { useMemo, useRef, useState } from "react";
import type { CumPoint, Panorama, WeekPoint } from "@/lib/analytics";
import type { ShareDay } from "@/lib/shares";

// Color follows the ENTITY across every chart on the page; text always wears
// ink, never series color. Palette lives in lib/panoramaPalette (shared with
// the server page's legends).
import { CUM_SERIES, SERIES } from "@/lib/panoramaPalette";

const INK = "#374151";
const INK_MUTED = "#9ca3af";
const GRID = "#eef0f3";

// Bars: 4px rounded DATA end, square at the baseline (anchored, not floating).
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// Round tick steps (1/2/2.5/5 × 10^k) so the axis reads 100·200·300,
// never computed fractions like 88·175·263.
function niceTicks(rawMax: number, count = 4): { top: number; ticks: number[] } {
  const step0 = Math.max(1, rawMax) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(Math.max(1, rawMax) / step) * step;
  const ticks: number[] = [];
  for (let t = step; t <= top + 1e-9; t += step) ticks.push(t);
  return { top, ticks };
}

type Tip = { x: number; y: number; node: React.ReactNode } | null;

function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-neutral-900/95 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tip.x, top: Math.max(0, tip.y - 8), transform: "translate(-50%,-100%)" }}
    >
      {tip.node}
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-neutral-300">{label}</span>
      <span className="ml-auto pl-3 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ── Crecimiento de la red: cumulative LEVELS — always the true size ────────
export function CumulativeChart({ data }: { data: CumPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);

  const W = 760;
  const H = 260;
  const padL = 42;
  const padR = 150; // room for "Propiedades · 1,289" end labels
  const padT = 14;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const { top: max, ticks } = niceTicks(
    Math.max(1, ...data.flatMap((d) => [d.members, d.properties, d.requerimientos])),
  );
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const fmt = (n: number) => n.toLocaleString("es-MX");

  const endLabels = useMemo(() => {
    const last = data[data.length - 1];
    const items = CUM_SERIES.map((s) => ({
      ...s,
      value: last?.[s.key] ?? 0,
      ty: y(last?.[s.key] ?? 0),
    })).sort((a, b) => a.ty - b.ty);
    for (let i = 1; i < items.length; i++) {
      if (items[i].ty - items[i - 1].ty < 16) items[i].ty = items[i - 1].ty + 16;
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, max]);

  function onMove(e: React.MouseEvent) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const relX = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(
      0,
      Math.min(data.length - 1, Math.round(((relX - padL) / plotW) * (data.length - 1))),
    );
    setHover(i);
    const d = data[i];
    setTip({
      x: (x(i) / W) * box.width,
      y: (padT / H) * box.height,
      node: (
        <div className="space-y-0.5">
          <div className="mb-1 font-medium">Semana del {d.label}</div>
          {CUM_SERIES.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} value={d[s.key]} />
          ))}
        </div>
      ),
    });
  }

  // Sparse x labels — every nth week so ~7 labels fit.
  const every = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => { setHover(null); setTip(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseMove={onMove}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={INK_MUTED}>
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#e2e5ea" strokeWidth="1" />
        {hover != null && (
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="#c7cdd6" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {CUM_SERIES.map((s) => {
          const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[s.key])}`).join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {hover != null && (
                <circle cx={x(hover)} cy={y(data[hover][s.key])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
              )}
            </g>
          );
        })}
        {endLabels.map((s) => (
          <g key={s.key}>
            <circle cx={W - padR + 8} cy={s.ty} r="3.5" fill={s.color} />
            <text x={W - padR + 16} y={s.ty + 3.5} fontSize="11" fill={INK}>
              {s.label} · {fmt(s.value)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill={INK_MUTED}>
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      <TipBox tip={tip} />
      <div className="sr-only">
      <table>
        <thead>
          <tr><th>Semana</th>{CUM_SERIES.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}><td>{d.label}</td>{CUM_SERIES.map((s) => <td key={s.key}>{d[s.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Actividad nueva: three small multiples, each on its OWN scale ───────────
export function WeeklyMultiples({ data }: { data: WeekPoint[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {SERIES.map((s) => (
        <MiniBars key={s.key} data={data} serieKey={s.key} label={s.label} color={s.color} />
      ))}
    </div>
  );
}

function MiniBars({
  data,
  serieKey,
  label,
  color,
}: {
  data: WeekPoint[];
  serieKey: (typeof SERIES)[number]["key"];
  label: string;
  color: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);

  const W = 240;
  const H = 120;
  const padL = 28;
  const padR = 6;
  const padT = 10;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const groupW = plotW / data.length;
  const barW = Math.max(8, groupW - 8);

  const { top: max, ticks } = niceTicks(Math.max(1, ...data.map((d) => d[serieKey])), 2);
  const y = (v: number) => baseY - (v / max) * plotH;
  const lastWeek = data[data.length - 1]?.[serieKey] ?? 0;

  function onMove(e: React.MouseEvent) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const relX = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((relX - padL) / groupW)));
    setHover(i);
    setTip({
      x: ((padL + i * groupW + groupW / 2) / W) * box.width,
      y: (padT / H) * box.height,
      node: (
        <div className="space-y-0.5">
          <div className="font-medium">{data[i].label}</div>
          <TipRow color={color} label={label} value={data[i][serieKey]} />
        </div>
      ),
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <span className="ml-auto text-xs tabular-nums text-neutral-400">
          {lastWeek} esta semana
        </span>
      </div>
      <div ref={wrapRef} className="relative" onMouseLeave={() => { setHover(null); setTip(null); }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseMove={onMove}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth="1" />
              <text x={padL - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill={INK_MUTED}>
                {t}
              </text>
            </g>
          ))}
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e2e5ea" strokeWidth="1" />
          {data.map((d, i) => {
            const v = d[serieKey];
            const cx = padL + i * groupW + groupW / 2;
            const dim = hover != null && hover !== i;
            return (
              <g key={i} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                {v > 0 && (
                  <path d={topRoundedRect(cx - barW / 2, y(v), barW, baseY - y(v), 3)} fill={color} />
                )}
                {(i === 0 || i === data.length - 1) && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize="9" fill={INK_MUTED}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <TipBox tip={tip} />
      </div>
    </div>
  );
}

// ── Compartidas: grouped bars, per-group hover ──────────────────────────────
const SHARE_SERIES = [
  { key: "sends", label: "Envíos", color: "#2E5FB0" },
  { key: "opens", label: "Aperturas", color: "#059669" },
] as const;

export function SharesChart({ data }: { data: ShareDay[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);

  const W = 760;
  const H = 200;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const groupW = plotW / data.length;
  const barW = Math.min(16, groupW / 3);
  const gap = 2; // 2px surface gap between adjacent bars

  const { top: max, ticks } = niceTicks(Math.max(1, ...data.flatMap((d) => [d.sends, d.opens])), 2);
  const y = (v: number) => baseY - (v / max) * plotH;

  function onMove(e: React.MouseEvent) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const relX = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((relX - padL) / groupW)));
    setHover(i);
    const d = data[i];
    setTip({
      x: ((padL + i * groupW + groupW / 2) / W) * box.width,
      y: (padT / H) * box.height,
      node: (
        <div className="space-y-0.5">
          <div className="mb-1 font-medium">{d.label}</div>
          <TipRow color={SHARE_SERIES[0].color} label="Envíos" value={d.sends} />
          <TipRow color={SHARE_SERIES[1].color} label="Aperturas" value={d.opens} />
        </div>
      ),
    });
  }

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => { setHover(null); setTip(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" onMouseMove={onMove}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={INK_MUTED}>
              {t}
            </text>
          </g>
        ))}
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="#e2e5ea" strokeWidth="1" />
        {data.map((d, i) => {
          const cx = padL + i * groupW + groupW / 2;
          const x0 = cx - barW - gap / 2;
          const dim = hover != null && hover !== i;
          return (
            <g key={d.day} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
              {d.sends > 0 && (
                <path d={topRoundedRect(x0, y(d.sends), barW, baseY - y(d.sends), 4)} fill={SHARE_SERIES[0].color} />
              )}
              {d.opens > 0 && (
                <path d={topRoundedRect(x0 + barW + gap, y(d.opens), barW, baseY - y(d.opens), 4)} fill={SHARE_SERIES[1].color} />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill={INK_MUTED}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

// ── Actividad: status stacked bar, 2px gaps, hover tooltips ─────────────────
export function ActivityBar({ activity }: { activity: Panorama["activity"] }) {
  const segs = [
    { label: "Activos (7d)", value: activity.active7d, color: "#059669" },
    { label: "Activos (8–30d)", value: activity.active8to30, color: "#2E5FB0" },
    { label: "Inactivos (>30d)", value: activity.dormant, color: "#D97706" },
    { label: "Nunca", value: activity.never, color: "#CBD5E1" },
  ];
  const total = activity.total || 1;

  return (
    <div>
      {/* 2px gaps between segments; the track is the surface color */}
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full">
        {segs.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              title={`${s.label}: ${s.value}`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              className="h-full min-w-[6px] rounded-[2px] first:rounded-l-full last:rounded-r-full transition hover:opacity-80"
            />
          ) : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {segs.map((s) => {
          const pct = Math.round((s.value / total) * 100);
          return (
            <div key={s.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <dt className="text-sm text-neutral-500">{s.label}</dt>
              <dd className="ml-auto text-sm font-semibold tabular-nums text-neutral-900">
                {s.value}
                <span className="ml-1 font-normal text-neutral-400">{pct}%</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

// ── Oferta ↔ Demanda: butterfly with center spine, hover highlight ──────────
export function SupplyDemand({ rows }: { rows: Panorama["supplyDemand"] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Sin datos todavía.</p>;
  }
  const max = Math.max(1, ...rows.flatMap((r) => [r.supply, r.demand]));

  return (
    <div className="space-y-0.5">
      {rows.map((r) => {
        const gap = r.demand > 0 && r.supply === 0;
        const active = hover === r.state;
        return (
          <div
            key={r.state}
            onMouseEnter={() => setHover(r.state)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-3 rounded-lg px-1 py-[5px] transition ${
              active ? "bg-neutral-50" : ""
            }`}
          >
            <div className="flex flex-1 items-center justify-end gap-2">
              <span className="w-7 text-right text-xs tabular-nums text-neutral-400">
                {r.demand || ""}
              </span>
              <div
                className="h-2.5 rounded-l-full"
                style={{ width: `${(r.demand / max) * 100}%`, background: "#C2410C", opacity: active ? 1 : 0.9 }}
              />
            </div>
            <div className="w-20 shrink-0 truncate text-center text-xs font-medium text-neutral-700 sm:w-28">
              {r.state}
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div
                className="h-2.5 rounded-r-full"
                style={{ width: `${(r.supply / max) * 100}%`, background: "#059669", opacity: active ? 1 : 0.9 }}
              />
              <span className="w-7 text-xs tabular-nums text-neutral-400">
                {r.supply || ""}
              </span>
              {gap ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-inset ring-rose-200">
                  sin oferta
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
