"use client";

import { useState, useTransition } from "react";
import { setUserPlan } from "@/app/actions";

// Premium by hand: Pablo closes a sale on WhatsApp or grants a courtesy, the
// admin flips the plan here. Store / Stripe purchases arrive on their own
// through RevenueCat and overwrite whatever is set here.
const SOURCE_LABEL: Record<string, string> = {
  manual: "manual",
  promotional: "cortesía",
  app_store: "App Store",
  play_store: "Google Play",
  stripe: "web (Stripe)",
  test_store: "prueba (Test Store)",
};

function fmt(iso: string | null): string {
  if (!iso) return "sin vencimiento";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
}

export function PlanControl({
  id,
  plan,
  expiresAt,
  source,
  active,
}: {
  id: string;
  plan: "free" | "premium";
  expiresAt: string | null;
  source: string | null;
  // Computed server-side (render purity): premium AND not expired.
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState<string>(() => (expiresAt ? expiresAt.slice(0, 10) : ""));
  const [courtesy, setCourtesy] = useState(source === "promotional");

  const storeManaged = source === "app_store" || source === "play_store" || source === "stripe";

  function save(next: "free" | "premium") {
    if (next === "free" && !window.confirm("¿Quitar Premium a esta cuenta?")) return;
    startTransition(async () => {
      const res = await setUserPlan(id, next, next === "premium" && date ? date : null, courtesy ? "promotional" : "manual");
      if (res?.error) alert(res.error);
      else setOpen(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition ${
          active ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100" : "text-neutral-600 ring-neutral-200 hover:bg-neutral-50"
        }`}
        title={active ? `Premium · ${SOURCE_LABEL[source ?? ""] ?? source ?? ""} · ${fmt(expiresAt)}` : "Plan gratuito"}
      >
        <span aria-hidden>{active ? "★" : "☆"}</span>
        {active ? "Premium" : "Gratis"}
      </button>

      {open && (
        <div className="w-64 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-lg">
          <div className="mb-2 text-xs text-neutral-500">
            {active ? (
              <>
                Premium {SOURCE_LABEL[source ?? ""] ?? ""} · vence {fmt(expiresAt)}
              </>
            ) : plan === "premium" ? (
              <>Premium vencido el {fmt(expiresAt)}</>
            ) : (
              "Plan gratuito"
            )}
          </div>
          {storeManaged && active ? (
            <p className="mb-2 rounded-md bg-neutral-50 p-2 text-xs text-neutral-500">
              Suscripción de tienda: se administra sola. Cambiarla aquí se revierte en la próxima renovación.
            </p>
          ) : null}
          <label className="mb-2 block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Vence (vacío = sin vencimiento)</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="mb-3 flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={courtesy} onChange={(e) => setCourtesy(e.target.checked)} />
            Cortesía (no es venta)
          </label>
          <div className="flex justify-end gap-2">
            {active && (
              <button
                onClick={() => save("free")}
                disabled={pending}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
              >
                Quitar Premium
              </button>
            )}
            <button
              onClick={() => save("premium")}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : active ? "Guardar" : "Activar Premium"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
