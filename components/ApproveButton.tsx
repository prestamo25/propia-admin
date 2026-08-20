"use client";

import { useState, useTransition } from "react";
import { approveUser, rejectUser } from "@/app/actions";

// Common reasons, one tap. «Otro» opens free text — the reason is what the
// applicant will be shown, so it must be a sentence a person can act on.
const REASONS = [
  "No pudimos verificar que seas parte del sector inmobiliario",
  "Los documentos no son legibles o no corresponden",
  "La información del negocio está incompleta",
  "Cuenta duplicada",
];

export function ApproveButton({
  id,
  name,
  rejected = false,
}: {
  id: string;
  name: string | null;
  rejected?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [custom, setCustom] = useState("");

  const isCustom = reason === "__otro__";
  const finalReason = isCustom ? custom : reason;

  function approve() {
    const ok = window.confirm(
      `¿Aprobar a ${name ?? "esta cuenta"}?\n\nTendrá acceso inmediato — su teléfono se actualiza al instante.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await approveUser(id);
      if (res?.error) alert(res.error);
    });
  }

  function reject() {
    if (finalReason.trim().length < 3) return;
    startTransition(async () => {
      const res = await rejectUser(id, finalReason);
      if (res?.error) alert(res.error);
      else setAsking(false);
    });
  }

  if (asking) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-rose-200 bg-rose-50/50 p-3 sm:w-80">
        <p className="text-xs font-medium text-neutral-700">
          Motivo del rechazo
          <span className="font-normal text-neutral-500"> · lo verá {name?.split(" ")[0] ?? "la persona"}</span>
        </p>
        <div className="mt-2 space-y-1">
          {REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2 text-xs text-neutral-700">
              <input
                type="radio"
                name={`reason-${id}`}
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
              name={`reason-${id}`}
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
            onClick={reject}
            disabled={pending || finalReason.trim().length < 3}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? "Rechazando…" : "Confirmar rechazo"}
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

  if (rejected) {
    return (
      <button
        onClick={approve}
        disabled={pending}
        className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
      >
        {pending ? "Aprobando…" : "Reconsiderar"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAsking(true)}
        disabled={pending}
        className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
      >
        Rechazar
      </button>
      <button
        onClick={approve}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Aprobando…" : "Aprobar"}
      </button>
    </div>
  );
}
