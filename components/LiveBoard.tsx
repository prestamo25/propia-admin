"use client";

import { useEffect, useRef, useState } from "react";

type FeedRow = {
  id: string;
  name: string | null;
  maskedPhone: string;
  created_at: string | null;
  status: string | null;
  tempPin: boolean;
};

type Live = {
  total: number;
  today: number;
  lastHour: number;
  last5m: number;
  tempPin: number;
  sinNombre: number;
  feed: FeedRow[];
  at: string;
};

const POLL_MS = 5_000;

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function LiveBoard() {
  const [live, setLive] = useState<Live | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      // Don't burn requests while the laptop lid is closed / tab hidden —
      // but never block the FIRST load (a page opened in a background tab
      // would otherwise sit on "Cargando" until refocused).
      if (document.hidden && hasData.current) return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Live;
        if (!active) return;
        hasData.current = true;
        setLive(data);
        setStale(false);
      } catch {
        if (active) setStale(true); // keep last numbers, flag them
      } finally {
        if (active) setNow(Date.now());
      }
    };
    tick();
    timer.current = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!live) {
    return (
      <div className="grid place-items-center rounded-2xl bg-white py-24 shadow-sm ring-1 ring-black/[0.04]">
        <p className="text-sm text-neutral-400">Cargando registros…</p>
      </div>
    );
  }

  const stat = (label: string, value: number, accent?: string) => (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04] sm:px-5">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${accent ?? "text-neutral-900"}`}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm text-neutral-500">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${stale ? "bg-amber-400" : "animate-ping bg-emerald-400"}`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`}
            />
          </span>
          {stale ? "Sin conexión — mostrando lo último" : "En vivo"}
        </span>
        <span className="text-xs tabular-nums text-neutral-400">
          {new Date(live.at).toLocaleTimeString("es-MX", {
            timeZone: "America/Mexico_City",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>

      {/* Hero: tonight's number. */}
      <div className="rounded-2xl bg-white px-5 py-6 shadow-sm ring-1 ring-black/[0.04] sm:px-6">
        <p className="text-sm font-medium text-neutral-400">Registros hoy</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <p className="text-6xl font-semibold tabular-nums tracking-tight text-neutral-900 sm:text-7xl">
            {live.today}
          </p>
          <p className="pb-2 text-sm tabular-nums text-neutral-400">
            {live.total} en total
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stat("Últimos 5 min", live.last5m, live.last5m > 0 ? "text-emerald-600" : undefined)}
        {stat("Última hora", live.lastHour)}
        {stat("PIN temporal activo", live.tempPin, live.tempPin > 0 ? "text-violet-600" : undefined)}
        {stat("Sin completar perfil", live.sinNombre, live.sinNombre > 0 ? "text-amber-600" : undefined)}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <p className="border-b border-black/[0.04] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Últimos registros
        </p>
        {live.feed.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">
            Todavía no hay registros.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {live.feed.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    r.name
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {r.name ? r.name.charAt(0).toUpperCase() : "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {r.name ?? `Broker ${r.maskedPhone}`}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {timeAgo(r.created_at, now)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {r.tempPin ? (
                    <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                      PIN temporal
                    </span>
                  ) : null}
                  {!r.name ? (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                      Onboarding
                    </span>
                  ) : null}
                  {r.status === "pending" ? (
                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">
                      Pendiente
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
