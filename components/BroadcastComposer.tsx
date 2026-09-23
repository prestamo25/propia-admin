"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendBroadcast } from "@/app/actions";

// El compositor de avisos masivos. La pieza que más importa no es el textarea
// sino el CONTEO: es la última oportunidad de notar que el filtro está mal
// antes de hablarle a cientos de personas, así que se pide de nuevo al
// servidor cada vez que cambia la audiencia y se repite dentro del botón.

export type AudienceCount = { devices: number; people: number };
export type EventOption = { id: string; title: string; when: string };

const ESTADOS = [
  "Puebla", "Nuevo León", "Ciudad de México", "Tlaxcala", "Chihuahua",
  "Querétaro", "Yucatán", "Veracruz", "Quintana Roo", "Morelos", "Estado de México",
];

export function BroadcastComposer({
  estado,
  tier,
  count,
  events,
}: {
  estado: string;
  tier: string;
  count: AudienceCount;
  events: EventOption[];
}) {
  const router = useRouter();
  // El conteo lo calcula el servidor, así que cambiar de audiencia recarga la
  // página con el filtro nuevo en la URL. Nunca se muestra un número viejo
  // junto a un filtro nuevo.
  const onFilter = (next: { estado: string; tier: string }) => {
    const q = new URLSearchParams();
    if (next.estado) q.set("estado", next.estado);
    if (next.tier) q.set("tier", next.tier);
    router.push(`/avisos${q.toString() ? `?${q}` : ""}`);
  };
  const [body, setBody] = useState("");
  const [eventId, setEventId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clean = body.trim();
  const tooLong = clean.length > 300;
  const ready = clean.length > 0 && !tooLong && count.devices > 0;
  const destino = useMemo(() => events.find((e) => e.id === eventId), [events, eventId]);

  const doSend = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await sendBroadcast({ body: clean, estado: estado || null, tier: tier || null, eventId: eventId || null });
      if (r.error) setError(r.error);
      else {
        setResult(`Enviado a ${r.sent?.toLocaleString("es-MX")} dispositivos.`);
        setBody("");
        setEventId("");
      }
      setConfirming(false);
    });
  };

  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-soft">
      <label className="block text-xs font-medium text-neutral-500">Texto del aviso</label>
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
        rows={3}
        placeholder="Lo que va a aparecer en la pantalla de bloqueo…"
        className="mt-1.5 w-full resize-none rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      <div className={`mt-1 text-[11px] tabular-nums ${tooLong ? "text-rose-700" : "text-neutral-400"}`}>
        {clean.length}/300
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500">Estado</label>
          <select
            value={estado}
            onChange={(e) => onFilter({ estado: e.target.value, tier })}
            className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="">Toda la red</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500">Plan</label>
          <select
            value={tier}
            onChange={(e) => onFilter({ estado, tier: e.target.value })}
            className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="">Todos</option>
            <option value="free">Sólo los que NO tienen Premium</option>
            <option value="premium">Sólo Premium</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500">Al tocarlo, abre</label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="">La lista de eventos</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      </div>

      {/* Vista previa: exactamente lo que ve el asesor. */}
      <div className="mt-4">
        <div className="text-xs font-medium text-neutral-500">Así llega</div>
        <div className="mt-1.5 max-w-sm rounded-2xl bg-neutral-900 p-3 text-white shadow-lift">
          <div className="text-[11px] font-semibold opacity-70">Propia · ahora</div>
          <div className="mt-0.5 text-sm leading-snug">
            {clean || <span className="opacity-40">…</span>}
          </div>
        </div>
        {destino ? (
          <div className="mt-1.5 text-[11px] text-neutral-500">Abre: {destino.title} · {destino.when}</div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-4">
        <div className="text-sm text-neutral-600">
          <span className="font-semibold tabular-nums text-neutral-900">{count.devices.toLocaleString("es-MX")}</span> dispositivos
          {" · "}
          <span className="font-semibold tabular-nums text-neutral-900">{count.people.toLocaleString("es-MX")}</span> personas
        </div>
        <div className="grow" />
        {confirming ? (
          <>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              onClick={doSend}
              disabled={pending}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? "Enviando…" : `Sí, mandar a ${count.devices.toLocaleString("es-MX")}`}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={!ready || pending}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            Enviar aviso
          </button>
        )}
      </div>

      {confirming ? (
        <p className="mt-2 text-xs text-amber-800">
          No se puede deshacer: un push enviado no se recoge.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {result ? <p className="mt-2 text-sm text-emerald-700">{result}</p> : null}
    </div>
  );
}
