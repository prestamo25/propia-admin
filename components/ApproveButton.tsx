"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { approveUser, approveUserAs, rejectUser } from "@/app/actions";
import { PROFILE_TYPE_LABEL, tierOf } from "@/lib/profileTypes";

// Common reasons, one tap. «Otro» opens free text — the reason is what the
// applicant will be shown (in the app AND on WhatsApp), so it must be a
// sentence a person can act on.
const REASONS = [
  "No pudimos verificar que seas parte del sector inmobiliario",
  "Los documentos no son legibles o no corresponden",
  "La información del negocio está incompleta",
  "Cuenta duplicada",
];

// «Aprobar como…» order: the two non-directory answers first (they are the
// usual fixes — a broker who picked proveedor, a person who just wants the
// events), then the nine service types.
const AS_OPTIONS = [
  "asesor",
  "invitado",
  "cliente",
  "notaria",
  "creditos",
  "polizas",
  "constructor",
  "decoracion",
  "valuador",
  "asociacion",
  "educacion",
  "otros",
];
const AS_HINT: Record<string, string> = {
  asesor: "app completa de broker",
  invitado: "eventos y servicios · no aparece en el directorio",
  cliente: "ve el inventario de su asesor",
};

export function ApproveButton({
  id,
  name,
  profileType,
  rejected = false,
}: {
  id: string;
  name: string | null;
  profileType: string;
  rejected?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [custom, setCustom] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const isCustom = reason === "__otro__";
  const finalReason = isCustom ? custom : reason;
  const first = name?.split(" ")[0] ?? "esta cuenta";

  // Close the «Aprobar como…» menu on an outside click / Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function approve() {
    const ok = window.confirm(
      `¿Aprobar a ${name ?? "esta cuenta"}?\n\nTendrá acceso inmediato — su teléfono se actualiza al instante y le avisamos por WhatsApp.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await approveUser(id);
      if (res?.error) alert(res.error);
    });
  }

  function approveAs(type: string) {
    setMenu(false);
    const label = PROFILE_TYPE_LABEL[type] ?? type;
    const effect =
      tierOf(type) === "servicios"
        ? `Aparecerá en el directorio de Servicios como ${label}.`
        : type === "invitado"
          ? "Entra al instante a eventos y servicios. No aparecerá en el directorio."
          : type === "cliente"
            ? "Verá el inventario de su asesor; no publica ni aparece en el directorio."
            : "Tendrá la app completa de broker.";
    const ok = window.confirm(
      `¿Aprobar a ${name ?? "esta cuenta"} como ${label}?\n\n${effect} Le avisamos por WhatsApp.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await approveUserAs(id, type);
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
          <span className="font-normal text-neutral-500"> · lo verá {first} en la app y por WhatsApp</span>
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

  const asMenu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={menu}
        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
          menu
            ? "border-neutral-300 bg-white text-neutral-900"
            : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-white hover:text-neutral-900"
        }`}
      >
        Aprobar como…
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {menu ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/[0.06]"
        >
          {AS_OPTIONS.filter((t) => t !== profileType).map((t, i, arr) => (
            <div key={t}>
              {i === 3 && arr.length > 3 ? <div className="mx-2 my-1 h-px bg-neutral-100" /> : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => approveAs(t)}
                className="flex w-full flex-col items-start rounded-lg px-3 py-1.5 text-left transition hover:bg-neutral-50"
              >
                <span className="text-sm font-medium text-neutral-800">{PROFILE_TYPE_LABEL[t]}</span>
                {AS_HINT[t] ? <span className="text-[11px] text-neutral-500">{AS_HINT[t]}</span> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (rejected) {
    return (
      <div className="flex items-center gap-2">
        {asMenu}
        <button
          onClick={approve}
          disabled={pending}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
        >
          {pending ? "Aprobando…" : "Reconsiderar"}
        </button>
      </div>
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
      {asMenu}
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
