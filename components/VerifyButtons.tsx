"use client";

import { useState, useTransition } from "react";
import { rejectVerification, revokeVerification, verifyMember } from "@/app/actions";

// Decision buttons for the «Verificado» check. Same language as
// ApproveButton: one confirm for the yes, a reason picker for the no — the
// reason is what the member reads in the app, so each one is a sentence they
// can act on (upload again, fix their name…).
const REJECT_REASONS = [
  "La foto de tu INE no se lee bien — vuelve a subirla con buena luz y sin reflejos",
  "El nombre de tu INE no coincide con el de tu cuenta",
  "Tu INE está vencida",
  "Necesitamos el frente de tu INE (el lado con tu foto)",
];

const REVOKE_REASONS = [
  "Recibimos reportes sobre esta cuenta",
  "Los datos de la cuenta ya no coinciden con tu INE",
];

export function VerifyButtons({
  id,
  name,
  mode,
}: {
  id: string;
  name: string | null;
  // pending → Verificar / Rechazar · verified → Quitar verificación
  mode: "pending" | "verified";
}) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const reasons = mode === "pending" ? REJECT_REASONS : REVOKE_REASONS;
  const [reason, setReason] = useState<string>(reasons[0]);
  const [custom, setCustom] = useState("");

  const isCustom = reason === "__otro__";
  const finalReason = isCustom ? custom : reason;
  const first = name?.split(" ")[0] ?? "esta cuenta";

  function verify() {
    const ok = window.confirm(
      `¿Verificar a ${name ?? "esta cuenta"}?\n\nLlevará la palomita azul en toda la red.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await verifyMember(id);
      if (res?.error) alert(res.error);
    });
  }

  function decline() {
    if (finalReason.trim().length < 3) return;
    startTransition(async () => {
      const res =
        mode === "pending"
          ? await rejectVerification(id, finalReason)
          : await revokeVerification(id, finalReason);
      if (res?.error) alert(res.error);
      else setAsking(false);
    });
  }

  if (asking) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-rose-200 bg-rose-50/50 p-3 sm:w-80">
        <p className="text-xs font-medium text-neutral-700">
          {mode === "pending" ? "Motivo del rechazo" : "Motivo para quitar la verificación"}
          <span className="font-normal text-neutral-500"> · lo verá {first} en la app</span>
        </p>
        <div className="mt-2 space-y-1">
          {reasons.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2 text-xs text-neutral-700">
              <input
                type="radio"
                name={`vreason-${id}`}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="mt-0.5 accent-rose-600"
              />
              {r}
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-2 text-xs text-neutral-700">
            <input
              type="radio"
              name={`vreason-${id}`}
              checked={isCustom}
              onChange={() => setReason("__otro__")}
              className="mt-0.5 accent-rose-600"
            />
            Otro
          </label>
          {isCustom && (
            <input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Escribe el motivo…"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={decline}
            disabled={pending || finalReason.trim().length < 3}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? "Guardando…" : mode === "pending" ? "Confirmar rechazo" : "Quitar verificación"}
          </button>
          <button
            onClick={() => setAsking(false)}
            disabled={pending}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-500 transition hover:text-neutral-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "verified") {
    return (
      <button
        onClick={() => {
          setReason(reasons[0]);
          setAsking(true);
        }}
        disabled={pending}
        className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
      >
        Quitar verificación
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          setReason(reasons[0]);
          setAsking(true);
        }}
        disabled={pending}
        className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
      >
        Rechazar
      </button>
      <button
        onClick={verify}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {pending ? "Verificando…" : "Verificar"}
      </button>
    </div>
  );
}
