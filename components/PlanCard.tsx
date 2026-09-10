"use client";

import { useMemo, useState, useTransition } from "react";
import { setUserPlan, type PlanMotivo } from "@/app/actions";
import type { PlanEvent } from "@/lib/miembro";

// «Plan» card on /broker/[id] (Franz 2026-09-10: the star-pill popover hid
// the decision and left no trace). State at a glance, store subscriptions
// read-only, one primary action that opens a proper dialog (duration →
// motivo → summary), and the plan_events history underneath so «why is this
// broker Premium» has an answer six months from now.

const RC_PROJECT = "projafbd47d6";

const SOURCE: Record<string, { label: string; cls: string }> = {
  app_store: { label: "App Store", cls: "bg-neutral-100 text-neutral-700 ring-neutral-200" },
  play_store: { label: "Google Play", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  stripe: { label: "Web · tarjeta", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  oxxo: { label: "OXXO", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  promotional: { label: "Cortesía", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  manual: { label: "Venta manual", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  test_store: { label: "Test Store", cls: "bg-neutral-100 text-neutral-500 ring-neutral-200" },
};

const KIND: Record<string, string> = {
  INITIAL_PURCHASE: "Compra",
  RENEWAL: "Renovación",
  NON_RENEWING_PURCHASE: "Compra",
  PRODUCT_CHANGE: "Cambio de plan",
  UNCANCELLATION: "Reactivó la suscripción",
  CANCELLATION: "Canceló la renovación",
  BILLING_ISSUE: "Problema de cobro",
  EXPIRATION: "Premium vencido",
  TRANSFER: "Transferencia de cuenta",
  OXXO_PAID: "Pago en OXXO",
  STRIPE_CHECKOUT_DIRECT: "Compra web",
  admin_venta_whatsapp: "Venta cerrada por WhatsApp",
  admin_cortesia: "Cortesía",
  admin_prueba: "Prueba interna",
  admin_otro: "Premium otorgado",
  admin_quitar: "Premium retirado",
  manual: "Cambio manual",
  test_cleanup: "Limpieza de prueba",
};

const MOTIVOS: [PlanMotivo, string, string][] = [
  ["venta_whatsapp", "Venta cerrada por WhatsApp", "Pagó fuera de la app. Cuenta como venta."],
  ["cortesia", "Cortesía", "Regalo de Propia. No cuenta como venta."],
  ["prueba", "Prueba interna", "Equipo o demo."],
  ["otro", "Otro", "Explica en la nota."],
];

type Duration = "3" | "6" | "12" | "open" | "date";
const DURATIONS: [Duration, string][] = [
  ["3", "3 meses"],
  ["6", "6 meses"],
  ["12", "12 meses"],
  ["open", "Sin vencimiento"],
  ["date", "Fecha exacta"],
];

const DAY = 24 * 3600 * 1000;

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Mexico_City",
  });
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function endOfDayCdmx(ymd: string): Date {
  return new Date(`${ymd}T23:59:59-06:00`);
}

export function PlanCard({
  id,
  name,
  plan,
  expiresAt,
  source,
  active,
  events,
}: {
  id: string;
  name: string | null;
  plan: "free" | "premium";
  expiresAt: string | null;
  source: string | null;
  active: boolean;
  events: PlanEvent[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState<Duration>("12");
  const [date, setDate] = useState("");
  const [motivo, setMotivo] = useState<PlanMotivo>("venta_whatsapp");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Captured once per mount so render math stays pure (react-hooks/purity).
  const [now] = useState(() => Date.now());

  const storeManaged = active && (source === "app_store" || source === "play_store" || source === "stripe");
  const src = source ? SOURCE[source] : null;
  const expired = plan === "premium" && !active;

  // Remaining-time bar: from the last grant to the expiry.
  const bar = useMemo(() => {
    if (!active || !expiresAt) return null;
    const grant = events.find((e) => e.plan === "premium");
    const start = grant ? Date.parse(grant.created_at) : now;
    const end = Date.parse(expiresAt);
    const total = Math.max(1, end - start);
    const left = Math.max(0, end - now);
    return { pct: Math.round(Math.min(100, (left / total) * 100)), days: Math.ceil(left / DAY) };
  }, [active, expiresAt, events, now]);

  // Extending adds to the current expiry; a new grant starts today.
  const base = active && expiresAt ? new Date(expiresAt) : new Date(now);
  const computed: Date | null =
    duration === "open" ? null : duration === "date" ? (date ? endOfDayCdmx(date) : null) : addMonths(base, Number(duration));
  const canConfirm = duration !== "date" || Boolean(date);

  function reset() {
    setDuration("12");
    setDate("");
    setMotivo("venta_whatsapp");
    setNote("");
    setError(null);
    setConfirmRemove(false);
  }

  function grant() {
    if (!canConfirm) return;
    setError(null);
    startTransition(async () => {
      const res = await setUserPlan(id, "premium", computed ? computed.toISOString() : null, motivo, note);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        reset();
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await setUserPlan(id, "free", null, "quitar", note);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        reset();
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
      {/* State */}
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
            active ? "bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-200" : "bg-neutral-100 text-neutral-400"
          }`}
          aria-hidden
        >
          {active ? "★" : "☆"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-neutral-900">
              {active ? "Premium" : expired ? "Premium vencido" : "Plan gratuito"}
            </span>
            {active && src ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${src.cls}`}>{src.label}</span>
            ) : null}
            {active && !expiresAt ? (
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
                Sin vencimiento
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            {active && expiresAt ? (
              <>
                Vence el <span className="font-medium text-neutral-800">{fmtDate(expiresAt)}</span>
                {bar ? <> · {bar.days === 1 ? "1 día" : `${bar.days} días`}</> : null}
              </>
            ) : expired ? (
              <>Venció el {fmtDate(expiresAt)}. Ve Clientes solo de su propiedad más reciente.</>
            ) : active ? (
              "Activo hasta que alguien lo retire."
            ) : (
              "Ve Clientes solo de su propiedad más reciente y no puede crear eventos."
            )}
          </div>
          {bar ? (
            <div className="mt-2.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full rounded-full ${bar.days <= 7 ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${bar.pct}%` }} />
            </div>
          ) : null}
          {storeManaged ? (
            <p className="mt-2.5 text-xs text-neutral-500">
              Se administra en {src?.label}. Lo que pongas aquí se sobrescribe en la próxima renovación.{" "}
              <a
                href={`https://app.revenuecat.com/customers/${RC_PROJECT}/${id}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Ver en RevenueCat
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(true);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            {active ? "Extender Premium" : "Otorgar Premium"}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="border-t border-neutral-100 px-5 py-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Historial</div>
        {events.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin movimientos. Nunca ha sido Premium.</p>
        ) : (
          <ol className="divide-y divide-neutral-100">
            {events.map((e) => {
              const raw = (e.raw ?? {}) as { note?: string | null; environment?: string; store?: string; price_in_purchased_currency?: number; currency?: string };
              const sandbox = raw.environment === "SANDBOX" || raw.store === "TEST_STORE";
              const s = e.source ? SOURCE[e.source] : null;
              const amount =
                typeof raw.price_in_purchased_currency === "number" && raw.price_in_purchased_currency > 0
                  ? `$${raw.price_in_purchased_currency.toLocaleString("es-MX")} ${(raw.currency ?? "MXN").toUpperCase()}`
                  : null;
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="w-32 shrink-0 tabular-nums text-neutral-400">{fmtDate(e.created_at, true)}</span>
                  <span className={`font-medium ${e.plan === "premium" ? "text-neutral-900" : "text-rose-700"}`}>
                    {KIND[e.kind] ?? e.kind}
                  </span>
                  {s ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}>{s.label}</span> : null}
                  {sandbox ? <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">sandbox</span> : null}
                  {amount ? <span className="text-neutral-600">{amount}</span> : null}
                  {e.plan === "premium" ? (
                    <span className="text-neutral-500">{e.expires_at ? `hasta el ${fmtDate(e.expires_at)}` : "sin vencimiento"}</span>
                  ) : null}
                  {e.actor && !["revenuecat", "stripe-webhook"].includes(e.actor) ? (
                    <span className="text-neutral-400">por {e.actor}</span>
                  ) : null}
                  {raw.note ? <span className="basis-full text-neutral-500">«{raw.note}»</span> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Dialog */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => !pending && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lift"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
              {active ? "Extender Premium" : "Otorgar Premium"}
              {name ? <span className="font-normal text-neutral-500"> · {name}</span> : null}
            </h3>
            {active && expiresAt ? (
              <p className="mt-1 text-sm text-neutral-500">Los meses se suman al vencimiento actual ({fmtDate(expiresAt)}).</p>
            ) : null}

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">1 · Duración</div>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDuration(k)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      duration === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {duration === "date" ? (
                <input
                  type="date"
                  value={date}
                  min={new Date(now).toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
              ) : null}
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">2 · Motivo</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {MOTIVOS.map(([k, label, hint]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMotivo(k)}
                    className={`rounded-xl border p-3 text-left transition ${
                      motivo === k ? "border-brand bg-brand-light" : "border-neutral-200 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <div className="text-sm font-medium text-neutral-900">{label}</div>
                    <div className="text-xs text-neutral-500">{hint}</div>
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional): quién pagó, cuánto, acuerdo…"
                rows={2}
                className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              {computed ? (
                <>
                  Premium hasta el <span className="font-semibold">{fmtDate(computed.toISOString())}</span>
                </>
              ) : duration === "open" ? (
                <>
                  Premium <span className="font-semibold">sin vencimiento</span>
                </>
              ) : (
                "Elige una fecha."
              )}{" "}
              · {MOTIVOS.find((m) => m[0] === motivo)?.[1].toLowerCase()}
            </div>

            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {active ? (
                confirmRemove ? (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={pending}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    Sí, quitar Premium
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    disabled={pending}
                    className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Quitar Premium
                  </button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={grant}
                  disabled={pending || !canConfirm}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Guardando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
