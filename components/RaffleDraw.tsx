"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { drawRaffleWinner, type RifaPool, type RifaWinner } from "@/app/actions";
import { fmtPhone } from "@/lib/format";

// El sorteo en pantalla. Pensado para proyectarse: un «escenario» azul Propia
// con la foto del evento de fondo, un rodillo de números mientras sortea y el
// ganador en grande con confeti. ⚠ Regla de Pablo: nada en la página dice
// cuánta gente hay en la bolsa — el rodillo gira dígitos inventados, no
// participantes reales. Los ganadores de cada evento se guardan en este
// navegador para no repetirlos si se recarga a media rifa.

export type RaffleEvent = {
  id: string;
  title: string;
  label: string;
  isForo: boolean;
  start: number;
  image: string | null;
};

const STORE_KEY = "rifas:winners";
const SUSPENSE_MS = 2400;

type Store = Record<string, RifaWinner[]>;

function loadStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function saveStore(s: Store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento (ventana privada): la rifa sigue, sólo no sobrevive a un recargo.
  }
}

const randomDigits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

// Rodillo tipo tragamonedas: dígitos al azar que se refrescan cada 70 ms.
function Roller() {
  const [digits, setDigits] = useState("0000000000");
  useEffect(() => {
    const t = setInterval(() => setDigits(randomDigits(10)), 70);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-1.5 font-mono text-3xl font-semibold tabular-nums text-white sm:gap-2 sm:text-5xl">
      <span className="text-white/50">+52</span>
      {[digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].map((g, i) => (
        <span key={i} className="rounded-xl bg-white/10 px-2.5 py-1.5 ring-1 ring-white/15 backdrop-blur sm:px-3.5 sm:py-2">
          {g}
        </span>
      ))}
    </div>
  );
}

// Confeti en canvas, sin dependencias. Colores de marca + dorado.
const CONFETTI_COLORS = ["#ffffff", "#f5c542", "#ffd97a", "#8fb3ff", "#1c4588", "#f97362"];

function burstConfetti(canvas: HTMLCanvasElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: 180 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = 9 + Math.random() * 9;
    return {
      x: fromLeft ? 0 : width,
      y: height * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, width, height);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 4200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.cos(p.rot * 3) * p.h);
      ctx.restore();
    }
    if (t < 4200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, width, height);
  };
  requestAnimationFrame(frame);
}

const TicketIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2" />
    <path d="M13 17v2" />
    <path d="M13 11v2" />
  </svg>
);

const TrophyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const ExpandIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
);

const CollapseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <path d="M14 10l7-7" />
    <path d="M3 21l7-7" />
  </svg>
);

export function RaffleDraw({ events, initialId }: { events: RaffleEvent[]; initialId: string }) {
  const [eventId, setEventId] = useState(initialId);
  const [pool, setPool] = useState<RifaPool>("attended");
  const [store, setStore] = useState<Store>({});
  const [winner, setWinner] = useState<RifaWinner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawing, startDraw] = useTransition();
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => setStore(loadStore()), []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const winners = useMemo(() => store[eventId] ?? [], [store, eventId]);
  const event = events.find((e) => e.id === eventId);

  const draw = useCallback(() => {
    if (!eventId || drawing) return;
    setError(null);
    setWinner(null);
    startDraw(async () => {
      const [r] = await Promise.all([
        drawRaffleWinner({ eventId, pool, exclude: winners.map((w) => w.attendeeId) }),
        new Promise((res) => setTimeout(res, SUSPENSE_MS)),
      ]);
      if (r.error || !r.winner) {
        setError(r.error ?? "No se pudo sacar un ganador.");
        return;
      }
      const won = r.winner;
      setWinner(won);
      setStore((prev) => {
        const next = { ...prev, [eventId]: [...(prev[eventId] ?? []), won] };
        saveStore(next);
        return next;
      });
      requestAnimationFrame(() => confettiRef.current && burstConfetti(confettiRef.current));
    });
  }, [eventId, pool, winners, drawing]);

  // En pantalla completa, la barra espaciadora o Enter sacan al siguiente.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        draw();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, draw]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

  const pickEvent = (id: string) => {
    setEventId(id);
    setWinner(null);
    setError(null);
  };

  const reset = () => {
    setStore((prev) => {
      const next = { ...prev, [eventId]: [] };
      saveStore(next);
      return next;
    });
    setWinner(null);
    setError(null);
  };

  const foros = events.filter((e) => e.isForo);
  const others = events.filter((e) => !e.isForo);
  const option = (e: RaffleEvent) => (
    <option key={e.id} value={e.id}>
      {e.title} — {e.label}
    </option>
  );

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="grid gap-4 rounded-2xl border border-black/[0.05] bg-white p-4 shadow-soft sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
        <div className="min-w-0">
          <label className="block text-xs font-medium text-neutral-500">Evento</label>
          <select
            value={eventId}
            onChange={(e) => pickEvent(e.target.value)}
            disabled={drawing}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            {!eventId ? <option value="">Elige un evento…</option> : null}
            {foros.length ? <optgroup label="Foros">{foros.map(option)}</optgroup> : null}
            {others.length ? <optgroup label="Otros eventos">{others.map(option)}</optgroup> : null}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-neutral-500">Participan</div>
          <div className="mt-1.5 inline-flex rounded-xl bg-neutral-100 p-1 text-sm">
            {(
              [
                ["attended", "Con entrada registrada", "Sólo quien pasó por el escáner en la entrada."],
                ["registered", "Todos los inscritos", "Inscritos confirmados, hayan registrado su entrada o no."],
              ] as const
            ).map(([k, label, hint]) => (
              <button
                key={k}
                type="button"
                title={hint}
                disabled={drawing}
                onClick={() => setPool(k)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${
                  pool === k ? "bg-white text-brand shadow-sm ring-1 ring-black/[0.04]" : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Escenario */}
      <div
        ref={stageRef}
        className={`relative isolate overflow-clip bg-[#0f2a55] text-white ${
          fullscreen ? "flex h-screen w-screen flex-col" : "rounded-3xl shadow-lift ring-1 ring-black/10"
        }`}
      >
        {event?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.image} alt="" className="absolute inset-0 -z-20 h-full w-full scale-110 object-cover opacity-30 blur-md" />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(28,69,136,0.55),transparent_60%),linear-gradient(180deg,rgba(15,42,85,0.75),rgba(10,26,54,0.95))]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
        <canvas ref={confettiRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />

        {/* Cabecera del escenario */}
        <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Propia" className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-white/20" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">Rifa</div>
              <div className={`truncate font-semibold ${fullscreen ? "text-xl" : "text-sm sm:text-base"}`}>
                {event?.title ?? "Elige un evento"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            {fullscreen ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
            <span className="hidden sm:inline">{fullscreen ? "Salir" : "Pantalla completa"}</span>
          </button>
        </div>

        {/* Centro */}
        <div
          className={`flex flex-col items-center justify-center px-6 text-center ${
            fullscreen ? "flex-1 py-10" : "min-h-[420px] py-12"
          }`}
        >
          {drawing ? (
            <div key="drawing" className="flex flex-col items-center [animation:rifa-in_.3s_ease-out]">
              <div className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-white/70">Sorteando…</div>
              <Roller />
            </div>
          ) : winner ? (
            <div key={winner.attendeeId} className="flex flex-col items-center [animation:rifa-pop_.6s_cubic-bezier(.2,1.4,.4,1)]">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-amber-950 shadow-[0_0_40px_rgba(245,197,66,0.45)]">
                <TrophyIcon className="h-4 w-4" />
                {winners.length > 1 ? `Ganador #${winners.length}` : "¡Ganador!"}
              </div>
              <div
                className={`mt-6 max-w-4xl text-balance font-semibold leading-[1.05] tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)] ${
                  fullscreen ? "text-6xl sm:text-8xl" : "text-4xl sm:text-6xl"
                }`}
              >
                {winner.name}
              </div>
              {winner.company ? (
                <div className={`mt-3 text-white/70 ${fullscreen ? "text-2xl" : "text-base sm:text-lg"}`}>{winner.company}</div>
              ) : null}
              {winner.phone ? (
                <div
                  className={`mt-7 rounded-2xl bg-white/10 px-6 py-3 font-medium tabular-nums ring-1 ring-white/20 backdrop-blur ${
                    fullscreen ? "text-4xl" : "text-2xl sm:text-3xl"
                  }`}
                >
                  {fmtPhone(winner.phone)}
                </div>
              ) : null}
            </div>
          ) : (
            <div key="idle" className="flex flex-col items-center [animation:rifa-in_.3s_ease-out]">
              <div className="grid h-20 w-20 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/15">
                <TicketIcon className="h-10 w-10 text-amber-200" />
              </div>
              <div className={`mt-6 font-semibold tracking-tight ${fullscreen ? "text-5xl" : "text-3xl sm:text-4xl"}`}>
                ¿Quién se lleva el premio?
              </div>
              <div className="mt-2 text-white/60">
                {pool === "attended" ? "Participan quienes registraron su entrada." : "Participan todos los inscritos."}
              </div>
            </div>
          )}

          {error ? (
            <p className="mt-6 rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-100 ring-1 ring-rose-300/30">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={draw}
            disabled={!eventId || drawing}
            className={`group mt-10 inline-flex items-center gap-2.5 rounded-2xl bg-white font-semibold text-brand shadow-[0_10px_40px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_50px_rgba(0,0,0,0.4)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-40 ${
              fullscreen ? "px-9 py-4 text-xl" : "px-7 py-3.5 text-base"
            }`}
          >
            <TicketIcon className="h-5 w-5 transition group-hover:rotate-[-8deg]" />
            {winners.length ? "Sacar otro ganador" : "Generar ganador"}
          </button>
          {fullscreen ? <div className="mt-3 text-xs text-white/40">Barra espaciadora para sortear</div> : null}
        </div>

        {/* Ganadores dentro del escenario (visibles al proyectar) */}
        {winners.length ? (
          <div className="border-t border-white/10 bg-black/15 px-5 py-4 sm:px-8">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">Ganadores</div>
              {!fullscreen ? (
                <button
                  type="button"
                  onClick={reset}
                  disabled={drawing}
                  className="text-xs font-medium text-white/50 transition hover:text-rose-200"
                  title="Quien ya ganó vuelve a la bolsa"
                >
                  Reiniciar
                </button>
              ) : null}
            </div>
            <ol className="mt-3 flex flex-wrap gap-2">
              {winners.map((w, i) => (
                <li
                  key={w.attendeeId}
                  className="inline-flex items-center gap-2.5 rounded-full bg-white/10 py-1 pl-1 pr-3.5 text-sm ring-1 ring-white/15"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-300 text-[11px] font-bold tabular-nums text-amber-950">
                    {i + 1}
                  </span>
                  <span className="font-medium">{w.name}</span>
                  <span className="tabular-nums text-white/60">{fmtPhone(w.phone)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
