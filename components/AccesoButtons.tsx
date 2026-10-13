"use client";

import { useState, useTransition } from "react";
import { closeSessions, revokeAccess, setTeamRole, unlockPhone } from "@/app/accesos/actions";

// The Accesos page's buttons (team login, 2026-10-13). Each one is a server
// action that re-checks who may do it — hiding a button is only courtesy.

const SMALL =
  "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-50";

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>, done?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else done?.();
    });
  };
  return { pending, error, run };
}

function Err({ text }: { text: string | null }) {
  return text ? <p className="basis-full text-sm text-rose-600">{text}</p> : null;
}

export function TeamRoleSelect({ userId, rol }: { userId: string; rol: "admin" | "equipo" }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <select
        value={rol}
        disabled={pending}
        aria-label="Rol"
        onChange={(e) => run(() => setTeamRole({ userId, rol: e.target.value as "admin" | "equipo" }))}
        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800"
      >
        <option value="admin">Admin</option>
        <option value="equipo">Equipo</option>
      </select>
      <Err text={error} />
    </>
  );
}

export function CloseSessionsButton({ id }: { id: string }) {
  const { pending, error, run } = useAction();
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={pending || done}
        onClick={() => run(() => closeSessions(id), () => setDone(true))}
        title="Saca a esta persona de todas las computadoras donde tenga sesión abierta y olvida sus dispositivos de confianza (la próxima vez le pedirá el código de WhatsApp)"
        className={`${SMALL} text-neutral-600 ring-neutral-200 hover:bg-neutral-50`}
      >
        {done ? "Sesiones cerradas" : "Cerrar sesiones"}
      </button>
      <Err text={error} />
    </>
  );
}

export function RevokeButton({ id, label }: { id: string; label: string }) {
  const { pending, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <>
      <span className="text-sm text-neutral-600">¿{label}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => revokeAccess(id), () => setConfirm(false))}
        className={`${SMALL} bg-rose-600 text-white ring-rose-600 hover:opacity-90`}
      >
        Sí, quitar
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirm(false)} className={`${SMALL} text-neutral-600 ring-neutral-200`}>
        No
      </button>
      <Err text={error} />
    </>
  ) : (
    <button type="button" onClick={() => setConfirm(true)} className="text-sm font-medium text-rose-600 hover:underline">
      Quitar
    </button>
  );
}

export function UnlockButton({ phone }: { phone: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => unlockPhone(phone))}
        className={`${SMALL} text-neutral-700 ring-neutral-200 hover:bg-neutral-50`}
      >
        Desbloquear
      </button>
      <Err text={error} />
    </>
  );
}

export function AddTeamForm() {
  const { pending, error, run } = useAction();
  const [phone, setPhone] = useState("");
  const [rol, setRol] = useState<"admin" | "equipo">("equipo");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setTeamRole({ phone10: phone, rol }), () => setPhone(""));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="numeric"
        placeholder="Teléfono de su cuenta (10 dígitos)"
        className="h-9 w-64 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      />
      <select
        value={rol}
        onChange={(e) => setRol(e.target.value as "admin" | "equipo")}
        aria-label="Rol"
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm"
      >
        <option value="equipo">Equipo</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        disabled={pending || phone.replace(/\D/g, "").length !== 10}
        className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
      >
        Agregar al equipo
      </button>
      <Err text={error} />
    </form>
  );
}
